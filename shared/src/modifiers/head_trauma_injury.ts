import { updateMaxValues } from "../adjustStats.ts";
import { killPlayer } from "../death.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Max health lost. */
const MAX_HP_LOSS = 3;
/** Max morale lost. */
const MAX_MORALE_LOSS = 3;
/** Chance to die after each action resolves. */
const ACTION_DEATH_CHANCE = 0.5;
/** Chance to die at each cycle change. */
const CYCLE_DEATH_CHANCE = 0.25;

// Head Trauma (owner, 2026-11-18): -3 max health, -3 max morale, a 50% chance to die of sepsis (`sepsis`) after each of
// your actions resolves (`onActionDone`), and a 25% chance at each cycle change.
export const head_trauma_injury: Modifier = {
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  maxMorale: (value) => Math.max(1, value - MAX_MORALE_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onActionDone: (next, player) => {
    if (player.alive && rollFloat(next) < ACTION_DEATH_CHANCE) killPlayer(next, player, "sepsis");
  },
  onCycle: (next, player) => {
    if (player.alive && rollFloat(next) < CYCLE_DEATH_CHANCE) killPlayer(next, player, "sepsis");
  },
};
