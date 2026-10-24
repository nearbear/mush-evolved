// ---- Ship resources ---------------------------------------------------------
// Decided 2026-10-19: oxygen starts at 30 of 32 and one is burned each cycle; at 0 a random living crew member
// dies every cycle. Fuel (20 of 100, in the tanks) reaches the ship only as capsules carried to the combustion chamber (9 at most, actions/take_fuel.ts); the hull (100) has no source or drain yet. The plasma shield (100)
// absorbs 67% of incoming damage out of its own points; at 0 the hull takes all of it. All of it is public.

import { damage } from "./death.ts";
import { logPublic } from "./log.ts";
import { nextInt } from "./rng.ts";
import type { GameConfig, GameState, ShipResources } from "./types.ts";

export function startShip(config: GameConfig): ShipResources {
  const { oxygen, fuel, combustion, hull, plasmaShield } = config.ship;
  return { oxygen: oxygen.start, fuel: fuel.start, combustion: combustion.start, hull: hull.start, plasmaShield: plasmaShield.start };
}

export function shipMax(config: GameConfig): ShipResources {
  const { oxygen, fuel, combustion, hull, plasmaShield } = config.ship;
  return { oxygen: oxygen.max, fuel: fuel.max, combustion: combustion.max, hull: hull.max, plasmaShield: plasmaShield.max };
}

/**
 * At each cycle change: with oxygen already at 0, one random living crew member dies (Mush included); then the
 * ship burns its oxygen. So a ship that runs dry gets one cycle of grace. Mutates a state the caller already cloned.
 */
export function burnOxygen(state: GameState): void {
  if (state.ship.oxygen === 0) {
    const living = state.players.filter((p) => p.alive);
    if (living.length > 0) {
      const [i, rng] = nextInt(state.rng, living.length);
      state.rng = rng;
      logPublic(state, undefined, "oxygenOut", undefined, "warning");
      const victim = living[i]!;
      damage(state, victim, victim.hp);
    }
  }
  state.ship.oxygen = Math.max(0, state.ship.oxygen - state.config.ship.oxygen.perCycle);
}

/**
 * Damage to the ship: the shield takes its percentage (rounded down) while it has points, the hull the rest.
 * Nothing calls this yet. Mutates a state the caller already cloned.
 */
export function damageShip(state: GameState, amount: number): void {
  const { ship } = state;
  const toShield = Math.min(ship.plasmaShield, Math.floor((amount * state.config.ship.plasmaShield.absorbPercent) / 100));
  ship.plasmaShield -= toShield;
  ship.hull = Math.max(0, ship.hull - (amount - toShield));
}
