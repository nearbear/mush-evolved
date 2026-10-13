// The action registry: one definition per action type. applyAction and
// legalActions go through it (and scheduled plans will, see
// docs/action-plans.md), so an action behaves the same however it is
// triggered. Pure, like the rest of the rules.

import { equipmentName } from "./equipment.ts";
import { canTransfer, itemName, itemsIn } from "./items.ts";
import { logPrivate, logPublic, roomName } from "./log.ts";
import { moveCost, movementRules } from "./modifiers.ts";
import type { Action, Container, GameState, ItemState, PlayerState, Target } from "./types.ts";

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
  examine,
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
