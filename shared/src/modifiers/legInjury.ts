import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";
import type { PlayerState } from "../types.ts";

/** Terrence's wheelchair (owner, 2026-11-22): a leg injury's MP cost and max MP loss don't touch him. */
const inWheelchair = (player: Readonly<PlayerState>): boolean => player.modifiers.includes("wheelchair");

/**
 * A leg or foot injury: each room-to-room move costs `mpPerMove` more MP, max health drops (never below 1) and max MP drops (down to 0, which leaves no MP to move with).
 * The MP parts skip a wheelchair user; the max health loss doesn't. Mutates nothing itself.
 */
export function legInjury({ mpPerMove = 0, maxHpLoss = 0, maxMpLoss = 0 }: { mpPerMove?: number; maxHpLoss?: number; maxMpLoss?: number }): Modifier {
  return {
    movement: (rules, player) => (inWheelchair(player) ? rules : { ...rules, mpPerMove: rules.mpPerMove + mpPerMove }),
    maxHp: (value) => Math.max(1, value - maxHpLoss),
    maxMp: (value, player) => (inWheelchair(player) ? value : Math.max(0, value - maxMpLoss)),
    onPick: (next, player) => {
      updateMaxValues(next, player);
    },
  };
}
