import { legInjury } from "./legInjury.ts";

// Mashed Foot (owner, 2026-11-18): every room-to-room move costs 1 MP more, -1 max health, -3 max MP. Broken Foot's
// upgrade, and upgrades to Unusable Legs (INJURY_UPGRADES, diseases.ts). The MP parts skip a wheelchair user.
export const mashed_foot_injury = legInjury({ mpPerMove: 1, maxHpLoss: 1, maxMpLoss: 3 });
