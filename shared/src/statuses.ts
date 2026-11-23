// Status effects. `dirty` is stored in `PlayerState.statuses`; `full_belly`, `hungry`,
// `immune`, `immunity`, `pacifist`, `hyperactive`, `antisocial`, `germaphobe`, `chronic_vertigo`, `mankind_only_hope`, `wheelchair`, `accommodated`, `inactive`, `super_inactive`, `focused` and `hopeless` are derived each time they are asked for (from satiety, skills
// and traits), so they can't drift out of step with it. Public statuses show on the Inspect panel for
// everyone in the room; private ones appear only in your own view.
// Names and icons live in the client (i18n keys `status.<id>`).

import { CURSE_IDS, isCurseId } from "./curses.ts";
import { inactivityOf } from "./inactivity.ts";
import type { GameState, PlayerState } from "./types.ts";

const FIXED_STATUS_PUBLIC = {
  dirty: true,
  full_belly: false,
  hungry: false,
  immune: false,
  // Owner, 2026-10-18: every character trait is public.
  immunity: true,
  // Owner, 2026-10-18: roommates see Ian's Pacifist as a status icon.
  pacifist: true,
  // Owner, 2026-11-08: Chao's Hyperactive is shown like Pacifist.
  hyperactive: true,
  // Owner, 2026-11-19 (#470): Raluca's Antisocial trait is public, like every trait.
  antisocial: true,
  // Owner, 2026-11-21: Finola's Germaphobe trait is public, like every trait.
  germaphobe: true,
  // Owner, 2026-11-22: Eleesha's Chronic Vertigo trait is public, like every trait.
  chronic_vertigo: true,
  mankind_only_hope: true,
  wheelchair: true,
  // Owner, 2026-10-19: roommates see that Terrence's wheelchair is being pushed.
  accommodated: true,
  // Owner, 2026-10-24: the Outcast status is public to the room (who cursed them is not).
  outcast: true,
  // Owner, 2026-11-14: Bodyguard's Protect gives both the bodyguard and the VIP public statuses in the room.
  protecting: true,
  protected: true,
  // Owner, 2026-11-06: guarding is public to the room.
  guardian: true,
  // Owner, 2026-11-05: Genius is private to its holder.
  genius: false,
  // Owner, 2026-10-31 (#145): both are public to everyone and float over the head.
  inactive: true,
  super_inactive: true,
  // Owner, 2026-11-07 (#192): at a terminal, sitting or standing, shown to the room. Cosmetic: no rule reads it.
  focused: true,
  // Owner, 2026-11-11: at 0 morale; private, Mush included (a Mush never dies of it, so no one else may see it).
  hopeless: false,
  // Owner, 2026-11-14: Nimble mode (Nimble Fingers); private to its holder.
  nimble: false,
  // Owner, 2026-11-21: public to roommates and floated overhead; permanent on the body.
  pregnant: true,
} as const;

export const STATUS_IDS = ["dirty", "full_belly", "hungry", "immune", "immunity", "pacifist", "hyperactive", "antisocial", "germaphobe", "chronic_vertigo", "mankind_only_hope", "wheelchair", "accommodated", "outcast", "protecting", "protected", "guardian", "genius", "inactive", "super_inactive", "focused", "hopeless", "nimble", "pregnant"] as const;
export type StatusId = string;
/**
 * The fixed statuses plus the ship's configured diseases and injuries (`config.diseases.allDiseases` and
 * `allInjuries`), and the curses (curses.ts). Those aren't listed above: they are private, since `STATUS_PUBLIC` has no
 * entry for them (a curse is more than private: hidden from its holder, shown only to Mush, `curseStatusesSeenBy`).
 */
export function statusIdsFor(diseases: readonly string[], injuries: readonly string[] = []): string[] {
  return [...new Set([...STATUS_IDS, ...diseases, ...injuries, ...CURSE_IDS])];
}

/** Confirmed 2026-10-14: dirty is public; full belly and hungry are private. */
export const STATUS_PUBLIC: Readonly<Record<string, boolean>> = FIXED_STATUS_PUBLIC;

/** Statuses that are character traits (permanent, innate): public, but shown on Inspect only, never over the head. */
export const TRAIT_STATUS_IDS: readonly StatusId[] = ["immunity", "pacifist", "hyperactive", "antisocial", "germaphobe", "chronic_vertigo", "mankind_only_hope", "wheelchair"];

/**
 * Statuses never floated over the head, whatever their visibility (owner, 2026-11-05: full belly is Inspect-only;
 * 2026-11-22: so are curses).
 */
const NO_OVERHEAD_STATUS_IDS: readonly StatusId[] = ["full_belly", ...CURSE_IDS];

/** The statuses worth floating over a character's head: everything but traits. */
export function overheadStatuses(statuses: readonly string[]): string[] {
  return statuses.filter((id) => !TRAIT_STATUS_IDS.includes(id) && !NO_OVERHEAD_STATUS_IDS.includes(id));
}

/** Anyone (Mush too, who gain satiety from fake meals) at or above `fullBellyAt` satiety can't eat. */
export function isFullBelly(state: Readonly<Pick<GameState, "config">>, p: Readonly<PlayerState>): boolean {
  return p.satiety >= state.config.hunger.fullBellyAt;
}

/**
 * Hungry once satiety has stayed at 0 for `hungryAfterCycles` cycles (`tapewormHungryAfterCycles` with a tapeworm); the
 * count restarts whenever satiety reaches 0 again.
 */
export function isHungry(state: Readonly<Pick<GameState, "config" | "cycle">>, p: Readonly<PlayerState>): boolean {
  return (
    p.role === "human" &&
    p.satiety === 0 &&
    p.satietyZeroSince !== null &&
    state.cycle - p.satietyZeroSince >=
      (p.modifiers.includes("tapeworm_disease") ? state.config.hunger.tapewormHungryAfterCycles : state.config.hunger.hungryAfterCycles)
  );
}

/** Immune to infection until the cycle in `immuneUntil` (granted by `antic_perfume` or fruit `resistance`). */
export function isImmune(state: Readonly<Pick<GameState, "cycle">>, p: Readonly<PlayerState>): boolean {
  return hasImmunityTrait(p) || (p.immuneUntil !== undefined && state.cycle < p.immuneUntil);
}

/** Immunity is a permanent trait (Chun's): infection never touches the holder. */
export function hasImmunityTrait(p: Readonly<PlayerState>): boolean {
  return p.modifiers.includes("immunity");
}

/** Hopeless: alive at 0 morale (owner, 2026-11-11). Any morale gain ends it; a human still Hopeless when a cycle ends dies (morale.ts). */
export function isHopeless(p: Readonly<PlayerState>): boolean {
  return p.alive && p.morale === 0;
}

/** Pacifist is a permanent modifier (Ian's), shown as a status so it can be inspected; it can never be removed. */
export function isPacifist(p: Readonly<PlayerState>): boolean {
  return p.modifiers.includes("pacifist");
}

/** Every status the player has, stored and derived. */
export function statusesOf(state: Readonly<Pick<GameState, "config" | "cycle" | "players">>, p: Readonly<PlayerState>): string[] {
  const inactivity = inactivityOf(p);
  const protecting = p.alive && state.players.some((o) => o.alive && o.protectedBy === p.id);
  return [
    ...p.statuses,
    ...(isFullBelly(state, p) ? ["full_belly"] : []),
    ...(isHungry(state, p) ? ["hungry"] : []),
    ...(hasImmunityTrait(p) ? ["immunity"] : isImmune(state, p) ? ["immune"] : []),
    ...(isPacifist(p) ? ["pacifist"] : []),
    ...(p.modifiers.includes("hyperactive") ? ["hyperactive"] : []),
    ...(p.modifiers.includes("antisocial") ? ["antisocial"] : []),
    ...(p.modifiers.includes("germaphobe") ? ["germaphobe"] : []),
    ...(p.modifiers.includes("chronic_vertigo") ? ["chronic_vertigo"] : []),
    ...(p.modifiers.includes("mankind_only_hope") ? ["mankind_only_hope"] : []),
    ...(p.modifiers.includes("wheelchair") ? ["wheelchair"] : []),
    ...(p.pushedBy !== undefined ? ["accommodated"] : []),
    ...(p.outcastBy !== undefined ? ["outcast"] : []),
    ...(protecting ? ["protecting"] : []),
    ...(p.alive && p.protectedBy !== undefined ? ["protected"] : []),
    ...(inactivity !== null ? [inactivity] : []),
    // At a terminal with its window open (spot.ts, #192).
    ...(p.spot?.kind === "occupancy" ? ["focused"] : []),
    ...(isHopeless(p) ? ["hopeless"] : []),
  ];
}

/** The statuses anyone may see on this player. */
export function publicStatusesOf(state: Readonly<Pick<GameState, "config" | "cycle" | "players">>, p: Readonly<PlayerState>): string[] {
  return statusesOf(state, p).filter((id) => !state.config.diseases.allDiseases.includes(id) && (STATUS_PUBLIC[id] ?? false));
}

/**
 * The curses `viewer` sees on `p`, someone else in their room (owner, 2026-11-22): all of them for a Mush, none for a
 * human. Nobody ever sees their own (`viewFor` strips them).
 */
export function curseStatusesSeenBy(viewer: Readonly<PlayerState>, p: Readonly<PlayerState>): string[] {
  return viewer.role === "mush" && viewer.id !== p.id ? p.statuses.filter(isCurseId) : [];
}

/** Mutates a state that the caller already cloned. */
export function removeStatus(p: PlayerState, id: StatusId): void {
  p.statuses = p.statuses.filter((s) => s !== id);
}

/** Mutates a state that the caller already cloned. */
export function addStatus(p: PlayerState, id: StatusId): void {
  if (!p.statuses.includes(id)) p.statuses.push(id);
}
