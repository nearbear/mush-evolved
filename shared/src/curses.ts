// Curses (owner, 2026-11-22): ailments that work like diseases (a modifier, a status and a `DiseaseTracker` countdown,
// all through `addDisease`), but are hidden from the cursed player. `viewFor` strips them from your own statuses,
// modifiers, trackers and action odds; a Mush sees them on other people in their room, like statuses (never overhead).
// A leaf module, so statuses.ts and modifiers.ts can use it without an import cycle.

/** Every curse id. Permanent registry ids: rename what players see in the locales, never these. */
export const CURSE_IDS = ["bad_luck_curse"] as const;
export type CurseId = (typeof CURSE_IDS)[number];

export function isCurseId(id: string): boolean {
  return (CURSE_IDS as readonly string[]).includes(id);
}

/** The list without any curse: what the holder may be shown of their own statuses or modifiers. */
export function withoutCurses<T extends string>(ids: readonly T[]): T[] {
  return ids.filter((id) => !isCurseId(id));
}
