import { legInjury } from "./legInjury.ts";

// Broken Leg (owner, 2026-11-22; eMushpedia's "Jambe cassée"): every room-to-room move costs 1 MP more, -1 max health,
// -5 max MP. Upgrades to Unusable Legs (INJURY_UPGRADES, diseases.ts). The MP parts skip a wheelchair user.
export const broken_leg_injury = legInjury({ mpPerMove: 1, maxHpLoss: 1, maxMpLoss: 5 });
