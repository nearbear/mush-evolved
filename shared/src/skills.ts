// Which skills exist and how many a player can hold. A skill's rules live in
// modifiers.ts (only some have any yet); this list is what can be picked.

import type { CharacterId } from "./characters.ts";
import type { PlayerState } from "./types.ts";

/**
 * Every human skill. Each character picks only from their own list (CHARACTER_SKILLS); books teach any of them.
 * Ids are the lowercase ids from the original design table (`Mush/derived/data/Data/skills.json`, human, not
 * beta), which are also the icon file names under `Mush/www/img/icons/skills`. The last ten are on a character's
 * list on eMushpedia but not retained in the original (the first seven) or new in eMush (the last three, which
 * have no icon). Mankind's Only Hope is left out: it is Chun's trait here (owner, 2026-10-18;
 * `modifiers/mankind_only_hope.ts`).
 */
export const SKILLS = [
  "engineer",
  "astrophysician",
  "pilot",
  "gunman",
  "cook",
  "botanic",
  "biologist",
  "designer",
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
  "cold_blood",
  "optimistic",
  "lethargy",
  "panic",
  "mycologist",
  "frugivore",
  "opportunist",
  "bodyguard",
  "infantryman",
  "maintenance_agent",
] as const;

export type SkillId = (typeof SKILLS)[number];

export function isSkill(value: unknown): value is SkillId {
  return typeof value === "string" && (SKILLS as readonly string[]).includes(value);
}

/**
 * The human skills each character can pick (owner, 2026-10-25): their list on eMushpedia's character pages, which
 * matches the original's `heros.json` except for eMush's changes to Chao (Bodyguard and Infantryman for Crazy Eye
 * and Daunting) and Chun (Maintenance Agent for Mankind's Only Hope, now her trait). The `anySkill` cheat lifts it.
 */
export const CHARACTER_SKILLS: Readonly<Record<CharacterId, readonly SkillId[]>> = {
  chao: ["gunman", "survival", "wrestler", "torturer", "bodyguard", "infantryman"],
  chun: ["maintenance_agent", "first_aid", "premonition", "escape", "lethargy"],
  eleesha: ["hunt", "persistent", "observant", "computer", "engineer", "polymath"],
  finola: ["biologist", "medic", "first_aid", "diplomacy", "stickler"],
  frieda: ["astrophysician", "pilot", "survival", "computer", "radio_expert", "antic_perfume"],
  gioele: ["sturdy", "paranoid", "caffeinomaniac", "astrophysician", "panic", "juge"],
  hua: ["pilot", "botanic", "survival", "engineer", "persistent", "fast_backward"],
  ian: ["botanic", "biologist", "mycologist", "green_thumb", "fireman", "frugivore"],
  janice: ["shrink", "computer", "neron_only_friend", "diplomacy", "radio_expert", "abnegation"],
  jinsu: ["leadership", "pilot", "cold_blood", "gunman", "logistics", "space_tactics"],
  kuanti: ["designer", "optimistic", "astrophysician", "engineer", "leadership", "politician"],
  paola: ["radio_expert", "logistics", "gunman", "biologist", "rebel", "gunner"],
  raluca: ["physicist", "unconcerned", "engineer", "genius", "designer"],
  roland: ["sprint", "pilot", "gunman", "fireman", "optimistic", "creative"],
  stephen: ["cook", "sturdy", "opportunist", "gunman", "apprentice", "creative"],
  terrence: ["robotics", "engineer", "pilot", "gunman", "computer", "metaliciste"],
};

/**
 * Mush skills a Mush player can pick, in their own slots (MUSH_SKILL_SLOTS) beside the human ones (owner,
 * 2026-10-24: all of them for now). Ids are the lowercase ids of the Mush, retained, not beta rows of the same
 * design table, which are also the icon file names.
 */
export const MUSH_SKILLS = [
  "pyromane",
  "tough",
  "fertile",
  "ninja",
  "sapper",
  "nimble_fingers",
  "water_resistant",
  "traitor",
  "doorman",
  "neron_access",
  "fungus_cook",
  "radio_piracy",
  "nightmare",
  "disheartening_contact",
  "transfert",
  "bacterial_contact",
  "infectious_agent",
  "phagocytosis",
  "trapper",
  "mycellium_spirit",
  "anonymous",
  "massggedon",
  "nerondepress",
  "slimetrap",
  "electro_slime",
  "defacer",
] as const;

export type MushSkillId = (typeof MUSH_SKILLS)[number];

export function isMushSkill(value: unknown): value is MushSkillId {
  return typeof value === "string" && (MUSH_SKILLS as readonly string[]).includes(value);
}

/** Mush skill slots per Mush player (owner, 2026-10-24), separate from the human ones. */
export const MUSH_SKILL_SLOTS = 4;

/** Human skill slots per player. The book slot (`PlayerState.bookSkill`) is a fourth, filled only by a skill book. */
export const SKILL_SLOTS = 3;

type SkillHolder = Pick<PlayerState, "skills" | "bookSkill" | "mushSkills">;

/** Every skill the player has: the picked human ones, the book slot's, then the Mush ones. */
export function skillsOf(player: Readonly<SkillHolder>): string[] {
  return [...player.skills, ...(player.bookSkill === undefined ? [] : [player.bookSkill]), ...player.mushSkills];
}

export function hasSkill(player: Readonly<SkillHolder>, skill: string): boolean {
  return player.skills.includes(skill) || player.bookSkill === skill || player.mushSkills.includes(skill);
}

/** How much of a skill's listed effects the rules implement. A skill missing from SKILL_STATUS is "none". */
export type SkillStatus = "full" | "partial" | "none";

/**
 * Implementation status shown in the skill picker. Update it when a skill gains rules. Bonuses for developing
 * NERON projects are left out of this count (owner, 2026-10-16).
 */
export const SKILL_STATUS: Readonly<Partial<Record<SkillId | MushSkillId, SkillStatus>>> = {
  // Heal bonus only; no operations, medicine properties, or research bonus.
  medic: "partial",
  // Flying patrol ships, with clean takeoffs and landings (owner, 2026-10-24, patrol.ts); no shooting bonus yet.
  pilot: "partial",
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
  // Designer points, spent on NERON projects only (owner, 2026-10-24); its project bonus is in PROJECTS.
  designer: "full",
  // +2 MP per AP-to-MP conversion (owner, 2026-10-24); no expedition bonus yet, there are no expeditions.
  sprint: "partial",
  // Anathema and the Outcast status (owner, 2026-10-24, anathema.ts); the original's "inactive" end has no equivalent yet.
  juge: "full",
  // Fiery speech (owner, 2026-10-24, speech.ts).
  leadership: "full",
  // Boring speech (owner, 2026-10-24, speech.ts).
  motivator: "full",
  // Interrogate, revealing the target's recent actions (owner, 2026-10-24, interrogate.ts).
  torturer: "full",
  // Others can Chitchat with you, revealing their recent actions (owner, 2026-10-24, chitchat.ts).
  confident: "full",
  // Comfort and +1 morale a cycle to roommates lying down (owner, 2026-10-26); no psychological illness cures.
  shrink: "partial",
  // Doubled odds of the link with Sol, x1.5 for roommates (owner, 2026-10-21, comms.ts).
  radio_expert: "full",
  // +100% rebel decoding (owner, 2026-10-21, comms.ts).
  rebel: "full",
  // Garden points and seeing plant sickness (owner, 2026-10-22, botany.ts); no grafting or fruit properties.
  botanic: "partial",
  // Sees plant sickness as the Botanist does (botany.ts); none of its other skills' knowledge.
  skilful: "partial",
  // Mush skill: the one-use body swap (owner, 2026-10-24, body_transfer.ts).
  transfert: "full",
  // Mush skill: spores into food (owner, 2026-10-24, fungal_cuisine.ts); no Hygienist or Cook-point interaction.
  fungus_cook: "partial",
  // Mush skill: one free spore extraction a day, ignoring the cooldown (owner, 2026-10-27, actions/extract_spore.ts).
  fertile: "full",
  // Mush skill: showering costs at most 1 AP and no HP (owner reading of eMushpedia, 2026-10-27, actions/shower.ts).
  water_resistant: "full",
  //Increases success rate, injury chance, and dirty chance by 20%
  expert: "full",
  // Free turret shots from Shoot points (owner, 2026-10-25); no fewer clumsy misses or more critical hits on shots.
  gunman: "partial",
  // Scan for planets costs 1 AP less; remote analyses reveal 1 extra sector; +4 on its two NERON projects (owner, 2026-10-27).
  astrophysician: "full",
  // One extra camera item when picked (owner, 2026-10-27).
  paranoid: "full",
  // Doubled turret odds and damage (owner, 2026-10-24).
  gunner: "full",
  // A faster-growing streak on turret shots and astro scans (owner, 2026-10-25).
  persistent: "full",
  // 50% of hunter waves come 33% smaller (owner, 2026-10-25).
  space_tactics: "full",
  // Two more channels and Computer points; not the -10% on actions (owner, 2026-10-25).
  polymath: "partial",
};

export function skillStatus(skill: string): SkillStatus {
  return isSkill(skill) || isMushSkill(skill) ? (SKILL_STATUS[skill] ?? "none") : "none";
}
