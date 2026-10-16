// Extra per-character resources (the point types in Mush/derived/data/Data/PAColors.json besides AP and MP).
// Each is just a counter on the player for now; nothing earns or spends them yet.
// Names and descriptions live in the client (i18n keys `resources.<id>.name` / `.desc`).

import type { ResourceId } from "./types.ts";

export const RESOURCE_IDS = ["eng", "exp", "comp", "garden", "core", "shoot", "cook", "heal", "pilgred"] as const;

export function emptyResources(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])) as Record<ResourceId, number>;
}
