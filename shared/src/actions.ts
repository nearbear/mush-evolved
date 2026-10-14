// The action registry: one definition per action type. applyAction and
// legalActions go through it (and scheduled plans will, see
// docs/action-plans.md), so an action behaves the same however it is
// triggered. Pure, like the rest of the rules.

import { EQUIPMENT_TYPES, equipmentName } from "./equipment.ts";
import { ITEM_TYPES, canReach, canTransfer, itemName, itemsIn, produceItem } from "./items.ts";
import { logPrivate, logPublic, roomName } from "./log.ts";
import { contaminationCapacity, moveCost, movementRules } from "./modifiers.ts";
import { dayOf } from "./rules.ts";
import type { Action, Container, GameState, ItemState, PlayerId, PlayerState, Target } from "./types.ts";

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** AP and MP an action takes away. MP is negative when converted AP yields more MP than the action uses. */
export interface ActionCost {
  ap: number;
  mp: number;
}

/**
 * Parameterized by the action itself (not its type tag) so a definition for one
 * action widens to `ActionDef<Action>`.
 */
export interface ActionDef<A extends Action> {
  /** Actions of this type worth offering the player; legalActions keeps those that pass `check`. */
  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): A[];
  /** Why the player can't do this right now (a reason code, not display text), or null if they can. */
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): string | null;
  /** What it costs. Only called once `check` passes. */
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  /** The effect, after the cost is paid. Mutates a state the caller already cloned. */
  apply(next: GameState, player: PlayerState, action: A): void;
}

const free = (): ActionCost => ({ ap: 0, mp: 0 });

const move: ActionDef<ActionOf<"move">> = {
  candidates: (state, p) => (state.config.rooms[p.room] ?? []).map((to) => ({ type: "move", to })),
  check(state, p, a) {
    if (!(state.config.rooms[p.room] ?? []).includes(a.to)) return "not_adjacent";
    return moveCost(movementRules(state, p), p) ? null : "cant_afford";
  },
  cost(state, p) {
    const c = moveCost(movementRules(state, p), p)!; // checked, so affordable
    return { ap: c.ap, mp: p.mp - c.mpAfter };
  },
  apply(next, p, a) {
    const from = p.room;
    p.room = a.to;
    logPublic(next, from, `${p.name} left for ${roomName(a.to)}.`);
    logPublic(next, a.to, `${p.name} entered from ${roomName(from)}.`);
  },
};

/** Taking and dropping are free (confirmed 2026-10-11) and differ only in where the item goes. */
function transfer<A extends ActionOf<"take" | "drop">>(type: A["type"]): ActionDef<A> {
  const destination = (p: Readonly<PlayerState>): Container =>
    type === "take" ? { kind: "player", id: p.id } : { kind: "room", id: p.room };
  return {
    candidates: (state) => state.items.map((i) => ({ type, item: i.id }) as A),
    check(state, p, a) {
      const item = state.items.find((i) => i.id === a.item);
      if (!item) return "no_such_item";
      return canTransfer(state, p, item, destination(p)) ? null : "cant_transfer";
    },
    cost: free,
    apply(next, p, a) {
      const index = next.items.findIndex((i) => i.id === a.item); // checked, so it exists
      const [item] = next.items.splice(index, 1) as [ItemState];
      item.at = destination(p);
      next.items.push(item); // newest arrivals list last in every container
      const verb = type === "take" ? "picked up" : "dropped";
      logPublic(next, p.room, `${p.name} ${verb} the ${itemName(item.type)}.`);
    },
  };
}

/** Pulling from a machine is free but works once per cycle per machine (confirmed 2026-10-13). */
const dispense: ActionDef<ActionOf<"dispense">> = {
  candidates: (state, p) =>
    (state.config.equipment[p.room] ?? []).filter((e) => EQUIPMENT_TYPES[e.type]?.dispenses).map((e) => ({ type: "dispense", equipment: e.id })),
  check(state, p, a) {
    const e = state.config.equipment[p.room]?.find((eq) => eq.id === a.equipment);
    if (!e || !EQUIPMENT_TYPES[e.type]?.dispenses) return "cant_dispense";
    return state.dispensedOn[e.id] === state.cycle ? "empty" : null;
  },
  cost: free,
  apply(next, p, a) {
    const e = next.config.equipment[p.room]!.find((eq) => eq.id === a.equipment)!; // checked, so it exists
    const type = EQUIPMENT_TYPES[e.type]!.dispenses!;
    next.dispensedOn[e.id] = next.cycle;
    const { item, inInventory } = produceItem(next, p, type);
    const name = itemName(item.type);
    logPublic(
      next,
      p.room,
      inInventory ? `${p.name} took a ${name} from the ${equipmentName(e.type)}.` : `${p.name} took a ${name} from the ${equipmentName(e.type)} and knocked it over.`,
    );
  },
};

/** Eating or drinking an item you carry or one lying in your room: free, removes it, public (confirmed 2026-10-13). */
const consume: ActionDef<ActionOf<"consume">> = {
  candidates: (state, p) => state.items.filter((i) => ITEM_TYPES[i.type]?.consume && canReach(state, p, i.at)).map((i) => ({ type: "consume", item: i.id })),
  check(state, p, a) {
    const item = state.items.find((i) => i.id === a.item);
    if (!item) return "no_such_item";
    return ITEM_TYPES[item.type]?.consume && canReach(state, p, item.at) ? null : "cant_consume";
  },
  cost: free,
  apply(next, p, a) {
    const index = next.items.findIndex((i) => i.id === a.item); // checked, so it exists
    const [item] = next.items.splice(index, 1) as [ItemState];
    p.ap = Math.min(next.config.maxAp, p.ap + ITEM_TYPES[item.type]!.consume!.ap);
    logPublic(next, p.room, `${p.name} consumed the ${itemName(item.type)}.`);
  },
};

/** Examining is free and private (confirmed 2026-10-11). */
const examine: ActionDef<ActionOf<"examine">> = {
  candidates: (state, p) => visibleTargets(state, p).map((target) => ({ type: "examine", target })),
  check: (state, p, a) =>
    visibleTargets(state, p).some((t) => t.kind === a.target.kind && t.id === a.target.id) ? null : "cant_see",
  cost: free,
  apply(next, p, a) {
    logPrivate(next, p.id, `You examine ${targetName(next, p, a.target)}.`);
  },
};

/** Others you could bond with or share with: living, in your room. */
const peopleHere = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);

const hasBondedTo = (state: Readonly<GameState>, from: PlayerId, to: PlayerId): boolean => !!state.bonds[from]?.includes(to);

/** Bonding costs 1 AP, lasts forever, and is one-way: the other person bonds back with their own action (confirmed 2026-10-14). */
const bond: ActionDef<ActionOf<"bond">> = {
  candidates: (state, p) => peopleHere(state, p).map((o) => ({ type: "bond", target: o.id })),
  check(state, p, a) {
    if (!peopleHere(state, p).some((o) => o.id === a.target)) return "cant_see";
    if (hasBondedTo(state, p.id, a.target)) return "already_bonded";
    return p.ap >= state.config.bondAp ? null : "cant_afford";
  },
  cost: (state) => ({ ap: state.config.bondAp, mp: 0 }),
  apply(next, p, a) {
    (next.bonds[p.id] ??= []).push(a.target);
    // Private: bonds are visible to the two partners only, so the room doesn't hear about it.
    logPrivate(next, p.id, `You bonded with ${next.players.find((o) => o.id === a.target)!.name}.`);
  },
};

/**
 * DTT and STT (confirmed 2026-10-14): need a bond both ways and the same room.
 * One of the two pays 1 AP; both gain 2 morale. Each of the two can do one of
 * them per day, never both and never twice, and that blocks both partners.
 */
function share<A extends ActionOf<"dtt" | "stt">>(type: A["type"]): ActionDef<A> {
  return {
    candidates: (state, p) => peopleHere(state, p).map((o) => ({ type, target: o.id }) as A),
    check(state, p, a) {
      if (!peopleHere(state, p).some((o) => o.id === a.target)) return "cant_see";
      if (!hasBondedTo(state, p.id, a.target) || !hasBondedTo(state, a.target, p.id)) return "not_bonded";
      const { day } = dayOf(state);
      if (state.sharedOnDay[p.id] === day || state.sharedOnDay[a.target] === day) return "cooldown";
      return p.ap >= state.config.shareAp ? null : "cant_afford";
    },
    cost: (state) => ({ ap: state.config.shareAp, mp: 0 }),
    apply(next, p, a) {
      const other = next.players.find((o) => o.id === a.target)!; // checked, so it exists
      const { day } = dayOf(next);
      for (const who of [p, other]) {
        who.morale = Math.min(next.config.maxMorale, who.morale + next.config.shareMorale);
        next.sharedOnDay[who.id] = day;
      }
      // Contamination only flows from a DTT with exactly one Mush, into the human. Hidden from everyone.
      const human = p.role === "human" ? p : other;
      if (type === "dtt" && p.role !== other.role) {
        next.contamination[human.id] = Math.min(contaminationCapacity(next, human), (next.contamination[human.id] ?? 0) + 1);
      }
      const label = type.toUpperCase(); // i18n-ignore: the acronym stays as written in every language
      logPrivate(next, p.id, `You did ${label} with ${other.name}.`);
      logPrivate(next, other.id, `${p.name} did ${label} with you.`);
    },
  };
}

const ready: ActionDef<ActionOf<"ready">> = {
  candidates: () => [{ type: "ready" }],
  check: () => null,
  cost: free,
  apply(_next, p) {
    p.ready = true;
  },
};

/** Every action type. Its order is the order legalActions lists them in. */
export const ACTIONS: { [T in ActionType]: ActionDef<ActionOf<T>> } = {
  ready,
  move,
  take: transfer("take"),
  drop: transfer("drop"),
  dispense,
  consume,
  examine,
  bond,
  dtt: share("dtt"),
  stt: share("stt"),
};

/** Everything a player can see and so interact with: people and equipment in their room, their items and the room's. */
export function visibleTargets(state: Readonly<GameState>, player: Readonly<PlayerState>): Target[] {
  return [
    ...state.players.filter((o) => o.room === player.room).map((o): Target => ({ kind: "player", id: o.id })),
    ...(state.config.equipment[player.room] ?? []).map((e): Target => ({ kind: "equipment", id: e.id })),
    ...itemsIn(state, { kind: "player", id: player.id }).map((i): Target => ({ kind: "item", id: i.id })),
    ...itemsIn(state, { kind: "room", id: player.room }).map((i): Target => ({ kind: "item", id: i.id })),
  ];
}

/** How a target is named in log text. Only called for targets the player can see. */
function targetName(state: Readonly<GameState>, viewer: Readonly<PlayerState>, target: Target): string {
  switch (target.kind) {
    case "player":
      return target.id === viewer.id ? "yourself" : (state.players.find((p) => p.id === target.id)?.name ?? target.id);
    case "equipment": {
      const e = state.config.equipment[viewer.room]?.find((eq) => eq.id === target.id);
      return `the ${equipmentName(e?.type ?? target.id)}`;
    }
    case "item": {
      const i = state.items.find((it) => it.id === target.id);
      return `the ${itemName(i?.type ?? target.id)}`;
    }
  }
}
