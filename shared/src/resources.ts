// Extra per-character resources (the point types in Mush/derived/data/Data/PAColors.json besides AP and MP).
// Each is just a counter on the player for now; nothing earns or spends them yet.
// Names and descriptions live in the client (i18n keys `resources.<id>.name` / `.desc`).

import type { ResourceId } from "./types.ts";

export const RESOURCE_IDS = ["eng", "exp", "comp", "garden", "core", "shoot", "cook", "heal", "pilgred"] as const;

export function emptyResources(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])) as Record<ResourceId, number>;
}

/** The skill whose daily grant is the only way to gain each resource (the other resources have no source yet). */
const RESOURCE_SKILLS: Partial<Record<ResourceId, readonly string[]>> = {
  heal: ["first_aid"],
  eng: ["engineer"],
  comp: ["computer", "polymath"],
  shoot: ["gunman"],
  core: ["designer"],
  pilgred: ["physicist"],
  garden: ["botanic"],
};

/** Whether a player could gain this resource: they hold some, or one of their skills grants it. Lets the UI hide counters they can never use. */
export function resourceAvailable(id: ResourceId, held: number, skills: readonly string[], bookSkill?: string): boolean {
  const granting = RESOURCE_SKILLS[id] ?? [];
  return held > 0 || granting.some((skill) => skills.includes(skill) || bookSkill === skill);
}
