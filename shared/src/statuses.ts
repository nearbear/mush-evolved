// Status effects. `dirty` is stored in `PlayerState.statuses`; `full_belly`, `hungry`,
// `immune` and `pacifist` are derived from satiety each time they are asked for, so they can't
// drift out of step with it. Public statuses show on the Inspect panel for
// everyone in the room; private ones appear only in your own view.
// Names and icons live in the client (i18n keys `status.<id>`).

import type { GameState, PlayerState } from "./types.ts";

export const STATUS_IDS = ["dirty", "full_belly", "hungry", "immune", "pacifist"] as const;
export type StatusId = (typeof STATUS_IDS)[number];

/** Confirmed 2026-10-14: dirty is public; full belly and hungry are private. */
export const STATUS_PUBLIC: Readonly<Record<StatusId, boolean>> = {
  dirty: true,
  full_belly: false,
  hungry: false,
  immune: false,
  // Owner, 2026-10-18: roommates see Ian's Pacifist as a status icon.
  pacifist: true,
};

/** Humans at or above `fullBellyAt` satiety can't eat. */
export function isFullBelly(state: Readonly<Pick<GameState, "config">>, p: Readonly<PlayerState>): boolean {
  return p.role === "human" && p.satiety >= state.config.hunger.fullBellyAt;
}

/** Hungry once satiety has stayed at 0 for `hungryAfterCycles` cycles; the count restarts whenever satiety reaches 0 again. */
export function isHungry(state: Readonly<Pick<GameState, "config" | "cycle">>, p: Readonly<PlayerState>): boolean {
  return (
    p.role === "human" &&
    p.satiety === 0 &&
    p.satietyZeroSince !== null &&
    state.cycle - p.satietyZeroSince >= state.config.hunger.hungryAfterCycles
  );
}

/** Immune to infection until the cycle in `immuneUntil` (granted by the antic_perfume skill). */
export function isImmune(state: Readonly<Pick<GameState, "cycle">>, p: Readonly<PlayerState>): boolean {
  return p.immuneUntil !== undefined && state.cycle < p.immuneUntil;
}

/** Pacifist is a permanent modifier (Ian's), shown as a status so it can be inspected; it can never be removed. */
export function isPacifist(p: Readonly<PlayerState>): boolean {
  return p.modifiers.includes("pacifist");
}

/** Every status the player has, stored and derived. */
export function statusesOf(state: Readonly<Pick<GameState, "config" | "cycle">>, p: Readonly<PlayerState>): string[] {
  return [
    ...p.statuses,
    ...(isFullBelly(state, p) ? ["full_belly"] : []),
    ...(isHungry(state, p) ? ["hungry"] : []),
    ...(isImmune(state, p) ? ["immune"] : []),
    ...(isPacifist(p) ? ["pacifist"] : []),
  ];
}

/** The statuses anyone may see on this player. */
export function publicStatusesOf(state: Readonly<Pick<GameState, "config" | "cycle">>, p: Readonly<PlayerState>): string[] {
  return statusesOf(state, p).filter((id) => STATUS_PUBLIC[id as StatusId]);
}

/** Mutates a state that the caller already cloned. */
export function removeStatus(p: PlayerState, id: StatusId): void {
  p.statuses = p.statuses.filter((s) => s !== id);
}

/** Mutates a state that the caller already cloned. */
export function addStatus(p: PlayerState, id: StatusId): void {
  if (!p.statuses.includes(id)) p.statuses.push(id);
}
