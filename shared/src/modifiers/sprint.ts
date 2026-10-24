import type { Modifier } from "../modifiers.ts";

// Skill "sprint" (Sprinter), owner 2026-10-24 from eMushpedia: each AP-to-MP conversion gives `config.sprinter.extraMpPerConversion` (2) MP more. The wiki's
// expedition bonus (+1 sector) has no system to attach to yet. Conversion still never pushes MP past the cap.
export const sprint: Modifier = {
  movement: (rules, _player, state) => ({ ...rules, mpPerConversion: rules.mpPerConversion + state.config.sprinter.extraMpPerConversion }),
};
