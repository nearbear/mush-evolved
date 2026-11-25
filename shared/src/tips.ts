// Tips for new players (#351): short, dismissable advice the client shows from the player's own view. Pure, and computed
// on the client like `legalIn`, so a tip can only use what the player already has. A tip names an action here only when
// it is in `view.actions`; for other rooms it names places from the fixed ship map (situation.ts), never live state
// there. Tips only state implemented rules. Their triggers are their own, not the bots' (server/src/bots/goals).

import { nearest, roomsWith, doorCount } from "./situation.ts";
import type { PlayerView, RoomId } from "./types.ts";

export const TIP_IDS = ["hunters", "hurt", "eat", "dirty", "rest", "noMp", "welcome"] as const;
export type TipId = (typeof TIP_IDS)[number];

/** A tip that applies now, with what its text needs. `room` and `doors` name the nearest place to go (0 doors: here). */
export interface Tip {
  id: TipId;
  room?: RoomId;
  doors?: number;
  /** welcome: whether End cycle is offered (single player), else the text points at the countdown. */
  endCycle?: boolean;
}

interface TipDef {
  id: TipId;
  /** Higher shows first when several apply. */
  priority: number;
  /**
   * Shown until dismissed once, rather than coming back each time its situation does: for tips whose situation never
   * ends (welcome).
   */
  once?: true;
  applies(view: PlayerView): Omit<Tip, "id"> | null;
}

/** HP at or under which the hurt tip shows: half of the starting 14, the same line bots ask for healing at. */
export const TIP_HURT_HP = 7;
/** AP at or under which the rest tip shows. */
export const TIP_REST_AP = 1;
/** Cycles at 0 satiety after which the eat tip shows, ahead of Hungry, which costs HP. */
export const TIP_EAT_AFTER_CYCLES = 16;

/** The nearest of `rooms` with its distance, or just {} when none can be reached (the text then names no room). */
function place(view: PlayerView, rooms: readonly RoomId[]): Omit<Tip, "id"> {
  const room = nearest(view, rooms)[0];
  return room === undefined ? {} : { room, doors: doorCount(view, room)! };
}

const TIPS: readonly TipDef[] = [
  {
    id: "hunters",
    priority: 90,
    applies: (view) => (view.hunters.count > 0 ? place(view, roomsWith(view, ["TURRET_COMMAND"])) : null),
  },
  {
    id: "hurt",
    priority: 80,
    applies: (view) => (view.you.hp <= TIP_HURT_HP ? place(view, ["SICK_BAY"]) : null),
  },
  {
    id: "eat",
    priority: 70,
    applies(view) {
      if (view.statuses.includes("full_belly") || view.you.role !== "human") return null;
      const since = view.you.satietyZeroSince;
      const hungry = view.statuses.includes("hungry") || (view.you.satiety === 0 && since !== null && view.cycle - since >= TIP_EAT_AFTER_CYCLES);
      return hungry ? place(view, [...roomsWith(view, ["KITCHEN", "COFFEE_DISPENSER"]), view.config.gardenRoom]) : null;
    },
  },
  {
    id: "dirty",
    priority: 60,
    // Only once dirt actually stands in the way: an action here is refused for it.
    applies: (view) => (view.statuses.includes("dirty") && view.actions.some((o) => o.lacks.includes("clean")) ? place(view, roomsWith(view, ["SHOWER"])) : null),
  },
  {
    id: "rest",
    priority: 50,
    applies(view) {
      if (view.you.ap > TIP_REST_AP || view.you.lyingIn !== undefined || view.you.ap >= view.maxAp) return null;
      const beds = roomsWith(view, ["BED"]);
      return beds.length > 0 ? place(view, beds) : null;
    },
  },
  {
    id: "noMp",
    priority: 40,
    applies: (view) => (view.you.mp < view.movement.mpPerMove ? {} : null),
  },
  {
    id: "welcome",
    priority: 10,
    once: true,
    applies: (view) => ({ endCycle: view.actions.some((o) => o.action.type === "ready") }),
  },
];

/** Tips shown until dismissed once (`TipDef.once`); the others come back when their situation does. */
export const ONCE_TIPS: ReadonlySet<TipId> = new Set(TIPS.filter((t) => t.once).map((t) => t.id));

/** Every tip that applies to this view, highest priority first. None for the dead or once the game is over. */
export function tipsFor(view: PlayerView): Tip[] {
  if (!view.you.alive || view.phase !== "playing") return [];
  return [...TIPS]
    .sort((a, b) => b.priority - a.priority)
    .flatMap((def) => {
      const found = def.applies(view);
      return found ? [{ id: def.id, ...found }] : [];
    });
}
