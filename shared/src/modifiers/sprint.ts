import type { Modifier } from "../modifiers.ts";

// Skill "sprint" (Sprinter), owner 2026-10-24 from eMushpedia: each AP-to-MP conversion gives `config.sprinter.extraMpPerConversion` (2) MP more.
// Conversion still never pushes MP past the cap. Its +1 expedition sector is in expeditions.ts (owner, 2026-11-08, #358).
export const sprint: Modifier = {
  movement: (rules, _player, state) => ({ ...rules, mpPerConversion: rules.mpPerConversion + state.config.sprinter.extraMpPerConversion }),
};
