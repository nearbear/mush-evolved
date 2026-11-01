// Which skill a bot without a key picks (owner, 2026-11-01; to be revised as features land). A character can only pick
// from its own list (CHARACTER_SKILLS), so "always" means "whenever the skill is on this character's list". Each pick is
// a fresh choice: the first "always" rule that applies, then the first "preferred" one, then a seeded random skill from
// the rest of the list. Rules are checked in this order, which matters only when they offer more than the free slots.

import { isSkill, type CharacterId, type SkillId } from "@mush2/shared";

export interface SkillRule {
  skill: SkillId;
  tier: "always" | "preferred";
  /** Only these characters take it. */
  only?: readonly CharacterId[];
  /** For these characters it is only preferred. */
  preferredFor?: readonly CharacterId[];
  /** Only once the bot has this skill. */
  needs?: SkillId;
}

/** In the owner's order. Display names in comments where the id differs (web/src/locales/en.json). */
export const BOT_SKILL_RULES: readonly SkillRule[] = [
  { skill: "logistics", tier: "always" }, // Logistics Expert
  { skill: "pilot", tier: "always", preferredFor: ["frieda", "terrence"] },
  { skill: "gunman", tier: "always", needs: "pilot" }, // Shooter
  { skill: "astrophysician", tier: "always", only: ["frieda"] }, // Astrophysicist
  { skill: "botanic", tier: "always", only: ["ian"] }, // Botanist
  { skill: "green_thumb", tier: "always", only: ["ian"] },
  { skill: "designer", tier: "preferred" },
  { skill: "computer", tier: "always", only: ["frieda", "janice", "eleesha"] }, // IT Expert
  { skill: "medic", tier: "always" },
  { skill: "paranoid", tier: "always" },
  { skill: "physicist", tier: "always" },
  { skill: "shrink", tier: "always" },
  { skill: "engineer", tier: "always" }, // Technician
  { skill: "hunt", tier: "always" }, // Tracker
  { skill: "lethargy", tier: "always" },
  { skill: "stickler", tier: "always" }, // Meticulous
  { skill: "radio_expert", tier: "always", only: ["paola"] },
];

function tierOf(rule: SkillRule, character: CharacterId, have: readonly string[]): SkillRule["tier"] | null {
  if (rule.only && !rule.only.includes(character)) return null;
  if (rule.needs && !have.includes(rule.needs)) return null;
  return rule.preferredFor?.includes(character) ? "preferred" : rule.tier;
}

/**
 * The skill to pick from `offered` (the bot's pick_skill options), or null when none is a human skill. Mush skills are
 * never picked here. `roll(n)` is the bot's seeded roll in [0, n).
 */
export function chooseSkill(character: CharacterId, offered: readonly string[], have: readonly string[], roll: (n: number) => number, rules: readonly SkillRule[] = BOT_SKILL_RULES): SkillId | null {
  const human = offered.filter(isSkill);
  if (human.length === 0) return null;
  for (const tier of ["always", "preferred"] as const) {
    const rule = rules.find((r) => human.includes(r.skill) && tierOf(r, character, have) === tier);
    if (rule) return rule.skill;
  }
  // A skill a rule names but rules out for this character (Astrophysicist for Gioele, Shooter before Pilot) is left
  // for last, so a random pick doesn't take it.
  const unruled = human.filter((s) => !rules.some((r) => r.skill === s));
  const pool = unruled.length > 0 ? unruled : human;
  return pool[roll(pool.length)]!;
}
