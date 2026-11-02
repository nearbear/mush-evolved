// Dispenser helpers: regeneration schedules and readiness.
// Confirmed 2026-10-13, updated 2026-11-02 (the original's rules; eMushpedia "Machine à café", "Torréfacteur à fission"):
// The coffee machine holds up to 1 coffee until taken; dispensing empties it until the next scheduled regeneration cycle.
// Base schedule: C1.
// Fission Coffee Roaster: C1, C5.
// PILGRED repaired: C1, C3, C5, C7.
// Both Roaster and PILGRED: every cycle (C1..cyclesPerDay).

import { isPilgredRepaired } from "./pilgred.ts";
import { projectDone } from "./projects.ts";
import type { GameState } from "./types.ts";

/** Cycles of the day in which the coffee machine regenerates (owner, 2026-11-02). */
export function coffeeRegenCycles(state: Readonly<Pick<GameState, "projects" | "pilgred" | "config">>): readonly number[] {
  const roaster = projectDone(state, "FISSION_COFFEE_ROASTER");
  const pilgred = isPilgredRepaired(state);
  if (roaster && pilgred) {
    return Array.from({ length: state.config.cyclesPerDay }, (_, i) => i + 1);
  }
  if (pilgred) {
    return state.config.pilgred.coffeeCycles;
  }
  if (roaster) {
    return state.config.project.fissionCoffeeRoaster.cycles;
  }
  return state.config.dispense.coffeeCycles;
}

/** The most recent cycle (`1 <= c <= state.cycle`) on which the coffee dispenser regenerated. */
export function lastCoffeeRegenCycle(state: Readonly<Pick<GameState, "cycle" | "projects" | "pilgred" | "config">>): number {
  const cycles = coffeeRegenCycles(state);
  const { cyclesPerDay } = state.config;
  for (let c = state.cycle; c >= 1; c--) {
    const cycleOfDay = ((c - 1) % cyclesPerDay) + 1;
    if (cycles.includes(cycleOfDay)) {
      return c;
    }
  }
  return 1;
}

/** Whether a dispenser is ready to produce an item. */
export function isDispenserReady(state: Readonly<GameState>, equipmentId: string, itemType?: string): boolean {
  if (itemType === "coffee") {
    const lastDispensed = state.dispensedOn[equipmentId];
    if (lastDispensed === undefined) return true;
    return lastDispensed < lastCoffeeRegenCycle(state);
  }
  return state.dispensedOn[equipmentId] !== state.cycle;
}
