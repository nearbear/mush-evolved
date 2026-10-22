// Which skills exist and how many a player can hold. A skill's rules live in
// modifiers.ts (only some have any yet); this list is what can be picked.

import type { PlayerState } from "./types.ts";

/**
 * Human skills a player can pick (decided 2026-10-15: all of them for now; each character will get its own
 * set later). Ids are the lowercase ids from the original design table (`Mush/derived/data/Data/skills.json`,
 * human, retained, not beta), which are also the icon file names under `Mush/www/img/icons/skills`. Mankind's Only
 * Hope is left out: it is Chun's trait here (owner, 2026-10-18; `modifiers/mankind_only_hope.ts`).
 */
export const SKILLS = [
  "engineer",
  "astrophysician",
  "pilot",
  "gunman",
  "cook",
  "botanic",
  "biologist",
  "conceptor",
  "medic",
  "first_aid",
  "leadership",
  "sturdy",
  "sprint",
  "fireman",
  "hunt",
  "survival",
  "unconcerned",
  "computer",
  "radio_expert",
  "diplomacy",
  "shrink",
  "persistent",
  "robotics",
  "paranoid",
  "caffeinomaniac",
  "physicist",
  "apprentice",
  "premonition",
  "wrestler",
  "green_thumb",
  "genius",
  "observant",
  "torturer",
  "crazy_eye",
  "logistics",
  "rebel",
  "escape",
  "neron_only_friend",
  "stickler",
  "daunting",
  "juge",
  "creative",
  "fast_backward",
  "abnegation",
  "antic_perfume",
  "metaliciste",
  "space_tactics",
  "devoted",
  "skilful",
  "oisif",
  "expert",
  "confident",
  "strong_skin",
  "motivator",
  "gunner",
  "polymath",
  "politician",
] as const;

export type SkillId = (typeof SKILLS)[number];

export function isSkill(value: unknown): value is SkillId {
  return typeof value === "string" && (SKILLS as readonly string[]).includes(value);
}

/** Human skill slots per player. The book slot (`PlayerState.bookSkill`) is a fourth, filled only by a skill book. */
export const SKILL_SLOTS = 3;

/** Every skill the player has: the picked ones, then the book slot's. */
export function skillsOf(player: Readonly<Pick<PlayerState, "skills" | "bookSkill">>): string[] {
  return player.bookSkill === undefined ? [...player.skills] : [...player.skills, player.bookSkill];
}

export function hasSkill(player: Readonly<Pick<PlayerState, "skills" | "bookSkill">>, skill: string): boolean {
  return player.skills.includes(skill) || player.bookSkill === skill;
}

/** How much of a skill's listed effects the rules implement. A skill missing from SKILL_STATUS is "none". */
export type SkillStatus = "full" | "partial" | "none";

/**
 * Implementation status shown in the skill picker. Update it when a skill gains rules. Bonuses for developing
 * NERON projects are left out of this count (owner, 2026-10-16).
 */
export const SKILL_STATUS: Readonly<Partial<Record<SkillId, SkillStatus>>> = {
  // Heal bonus only; no operations, medicine properties, or research bonus.
  medic: "partial",
  // Heavy-item penalty and punch damage only; no Throw Out.
  sturdy: "partial",
  // Free heal points only; no medicine properties.
  first_aid: "partial",
  // Computer points and their use on research and NERON projects only; no hacking.
  computer: "partial",
  // PILGRED points and the PILGRED repair bonus (owner, 2026-10-21).
  physicist: "full",
  // PILGRED repair bonus only; no repair points, repairs or renovations.
  engineer: "partial",
  creative: "full",
  antic_perfume: "full",
  logistics: "full",
  caffeinomaniac: "full",
  stickler: "full",
};

export function skillStatus(skill: string): SkillStatus {
  return isSkill(skill) ? (SKILL_STATUS[skill] ?? "none") : "none";
}
