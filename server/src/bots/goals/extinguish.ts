import { DEFAULT_CONFIG, type PlayerView, type RoomId } from "@mush2/shared";
import { fireSensor, unlocatedFires, unsearchedRooms } from "../fireShare.ts";
import { roomsHolding } from "../itemShare.ts";
import { act, canAfford, failed, find, goTo, nearest, offered, walkBudget, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Where fighting fires ranks (owner, 2026-11-14, #429): a fire is urgent, above the Astrophysicist's planet work (76)
 * and the Commander's jumps (77); under eating (80) and the quick once-only jobs above it.
 */
export const EXTINGUISH_PRIORITY = 78;

/**
 * Where a bot leaves an extinguisher once no fire is known (owner, 2026-11-14): the front and rear corridors, central,
 * so anyone can reach one for the next fire. They also start there (`config.ts`).
 */
export const EXTINGUISHER_HOMES: readonly RoomId[] = ["CORRIDOR_A", "CORRIDOR_C"];

const EXTINGUISHER = "extinguisher";
const extinguishAp = DEFAULT_CONFIG.extinguish.cost.ap;

/** A working extinguisher the bot carries. */
const carried = (view: PlayerView): string | undefined => view.inventory.find((i) => i.type === EXTINGUISHER && !i.broken)?.id;

const isWorking = (view: PlayerView, id: string): boolean => [...view.inventory, ...view.roomItems].some((i) => i.id === id && !i.broken);

/** Whether walking `from -> via -> to` with the bot's AP and MP still leaves `ap` to spend at `to`. */
function canWalkVia(view: PlayerView, via: RoomId, to: RoomId, ap: number): boolean {
  const there = walkBudget(view, view.you.room, via, view.you.ap, view.you.mp);
  if (!there) return false;
  const after = walkBudget(view, via, to, there.ap, there.mp);
  return after !== null && after.ap >= ap;
}

/** What fighting fires means for this bot now, by its key; null when there's nothing it can do. */
interface Plan {
  key: string;
  label: string;
}

/**
 * The first that applies, skipping any ended this cycle:
 * 1. The bot's room burns and it can reach a working extinguisher: put it out.
 * 2. A room is known to burn: carry a working extinguisher there (fetching one from a room bots said holds one first)
 *    and put it out. May spend the AP reserve: the reserve is kept for emergencies, and a fire is one.
 * 3. A fire was announced and nobody has found it: walk to the nearest room not yet searched, keeping the AP reserve
 *    (owner, 2026-11-14: a bot that found the fire with nothing left couldn't put it out). Arriving tells the others
 *    (`fireShare.ts`).
 * 4. No fire known and the bot carries an extinguisher: leave it in the nearest of `EXTINGUISHER_HOMES`.
 * A Firefighter's manual try isn't used: bots don't pick that skill (owner, 2026-11-14).
 */
function plan(view: PlayerView, memory: BotMemory): Plan | null {
  const fires = memory.fires;
  const open = (key: string): boolean => !memory.ended.has(key);
  if (view.roomOnFire && open("extinguish:here") && offered(view, "extinguish").some((o) => o.lacks.length === 0 && isWorking(view, o.action.item))) {
    return { key: "extinguish:here", label: "Put out the fire here with an extinguisher" }; // i18n-ignore: model prompt text, not player-visible
  }
  const burning = nearest(view, [...fires.burning]);
  if (burning.length > 0) {
    if (carried(view)) {
      const room = burning.find((r) => canAfford(view, r, extinguishAp, 0));
      if (room && open(`extinguish:fire:${room}`)) return { key: `extinguish:fire:${room}`, label: `Carry your extinguisher to the fire ${where(view, room)} and put it out` }; // i18n-ignore: model prompt text, not player-visible
    } else {
      for (const from of nearest(view, roomsHolding(memory, EXTINGUISHER))) {
        const room = burning.find((r) => canWalkVia(view, from, r, extinguishAp));
        if (room && open(`extinguish:fetch:${from}`)) return { key: `extinguish:fetch:${from}`, label: `Take the extinguisher ${where(view, from)} to the fire in ${room} and put it out` }; // i18n-ignore: model prompt text, not player-visible
      }
    }
  }
  if (unlocatedFires(fires) > 0 && !fireSensor(view) && open("extinguish:search")) {
    if (nearest(view, unsearchedRooms(fires)).some((r) => canAfford(view, r, 0, memory.reserve))) {
      return { key: "extinguish:search", label: "A fire broke out somewhere: look for it in the rooms nobody has checked" }; // i18n-ignore: model prompt text, not player-visible
    }
  }
  if (fires.active === 0 && fires.burning.size === 0 && carried(view) && open("extinguish:return")) {
    const home = nearest(view, EXTINGUISHER_HOMES).find((r) => canAfford(view, r, 0, memory.reserve));
    if (home) return { key: "extinguish:return", label: `Leave your extinguisher ${where(view, home)}, where anyone can reach it` }; // i18n-ignore: model prompt text, not player-visible
  }
  return null;
}

/** One step of the plan with `key`, read again from the view each turn (a bot walked elsewhere re-paths by itself). */
function step(view: PlayerView, memory: BotMemory, key: string): GoalStep {
  // The situation changed (the fire went out, someone found it, the extinguisher was taken): choose again.
  if (plan(view, memory)?.key !== key) return { kind: "done", again: true };
  const [, kind, room] = key.split(":") as [string, string, RoomId | undefined];
  const fires = memory.fires;
  if (kind === "here") {
    const option = offered(view, "extinguish").find((o) => o.lacks.length === 0 && isWorking(view, o.action.item))!;
    return act(option.action);
  }
  if (kind === "fire") return goTo(view, room!) ?? { kind: "done", again: true };
  if (kind === "fetch") {
    const walk = goTo(view, room!);
    if (walk) return walk;
    const take = find(view, "take", (a) => view.roomItems.some((i) => i.id === a.item && i.type === EXTINGUISHER && !i.broken));
    return take ? act(take) : failed("no_extinguisher");
  }
  if (kind === "search") {
    const target = nearest(view, unsearchedRooms(fires)).find((r) => canAfford(view, r, 0, memory.reserve));
    return target ? (goTo(view, target) ?? { kind: "done", again: true }) : { kind: "done" };
  }
  // return
  const home = nearest(view, EXTINGUISHER_HOMES).find((r) => canAfford(view, r, 0, memory.reserve));
  const walk = home === undefined ? failed("no_home") : goTo(view, home);
  if (walk) return walk;
  const drop = find(view, "drop", (a) => a.item === carried(view));
  return drop ? act(drop) : failed("cant_drop");
}

/**
 * Fight fires (#429; owner, 2026-11-14: every bot, urgently). See `plan` for what it does, and `fireShare.ts` for how
 * bots learn where fires burn.
 */
export const extinguish: GoalDef = {
  id: "extinguish",
  priority: EXTINGUISH_PRIORITY,
  options(view, memory) {
    const p = plan(view, memory);
    if (!p) return [];
    const goal: Goal = { id: "extinguish", key: p.key, label: p.label, step: (v, m) => step(v, m, p.key) };
    return [goal];
  },
};
