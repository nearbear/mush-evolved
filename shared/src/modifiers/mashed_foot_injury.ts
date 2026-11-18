import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Mashed Foot (owner, 2026-11-18): every room-to-room move costs 1 MP more, -1 max health, -3 max MP.
export const mashed_foot_injury: Modifier = {
  movement: (rules) => ({ ...rules, mpPerMove: rules.mpPerMove + 1 }),
  maxHp: (value) => Math.max(1, value - 1),
  maxMp: (value) => Math.max(1, value - 3),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
