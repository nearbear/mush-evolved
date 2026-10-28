import type { Modifier } from "../modifiers.ts";

// Skill "astrophysician" (Astrophysicien), per the owner 2026-10-27 (the original skills.json): Scan for planets costs
// `config.astrophysicist.scanApDiscount` AP less, and each remote analysis reveals `extraSectors` more. The wiki's NERON
// project bonus and the deep-analysis sector (no deep analysis yet) are not built.
export const astrophysician: Modifier = {
  actionCost: (cost, { action, state }) => (action.type === "scan_planet" ? { ...cost, ap: cost.ap - state.config.astrophysicist.scanApDiscount } : cost),
  analysisSectors: (sectors, _player, state) => sectors + state.config.astrophysicist.extraSectors,
};
