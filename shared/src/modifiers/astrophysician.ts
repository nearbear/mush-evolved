import type { Modifier } from "../modifiers.ts";

// Skill "astrophysician" (Astrophysicien), per the owner 2026-10-27 (the original skills.json): Scan for planets costs
// `config.astrophysicist.scanApDiscount` AP less, and each remote analysis reveals `extraSectors` more. Its NERON project bonus is in
// PROJECTS (projects.ts); the deep-analysis sector is added in analyze_planet.ts and stacks with this one.
export const astrophysician: Modifier = {
  actionCost: (cost, { action, state }) => (action.type === "scan_planet" ? { ...cost, ap: cost.ap - state.config.astrophysicist.scanApDiscount } : cost),
  analysisSectors: (sectors, _player, state) => sectors + state.config.astrophysicist.extraSectors,
};
