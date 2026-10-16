// Which skills exist and how many a player can hold. A skill's rules live in
// modifiers.ts (only some have any yet); this list is what can be picked.

/**
 * Human skills a player can pick (decided 2026-10-15: all of them for now; each character will get its own
 * set later). Ids are the lowercase ids from the original design table (`Mush/derived/data/Data/skills.json`,
 * human, retained, not beta), which are also the icon file names under `Mush/www/img/icons/skills`.
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
  "mankind_only_hope",
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

/** Human skill slots per player (a fourth, for books, comes later). */
export const SKILL_SLOTS = 3;
