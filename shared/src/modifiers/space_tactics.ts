import type { Modifier } from "../modifiers.ts";

// Skill "space_tactics" (Stratéguerre), per the owner 2026-10-25: while the holder is alive, each hunter wave has a
// 50% chance to come 33% smaller (hunters.ts spawnWave). Several holders don't stack.
export const space_tactics: Modifier = {
  crewWaveShrinkChance: (chance, _holder, state) => Math.max(chance, state.config.spaceTactics.chance),
};
