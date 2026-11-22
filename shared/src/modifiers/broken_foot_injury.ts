import { legInjury } from "./legInjury.ts";

// Broken Foot (owner, 2026-11-22): every room-to-room move costs 1 MP more, -1 max health. Mashed Foot is its upgrade
// (INJURY_UPGRADES, diseases.ts). The MP cost skips a wheelchair user (legInjury.ts).
export const broken_foot_injury = legInjury({ mpPerMove: 1, maxHpLoss: 1 });
