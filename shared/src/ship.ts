// ---- Ship resources ---------------------------------------------------------
// Decided 2026-11-17 (matching eMush): oxygen starts at 20 of 32 and one is burned each cycle; at 0 a random living crew member
// dies every cycle. Fuel (20 of 32, in the tanks) reaches the ship only as capsules carried to the combustion chamber (9 at most, actions/take_fuel.ts).
// Hunters damage the hull (100) and the plasma shield (50 of 100), which absorbs 33% of each hit out of its own points, 67% with
// the Plasma Shield project (owner, 2026-10-24, hunters.ts); at 0 the hull takes all of it. All of it is public.

import { pushChat } from "./chat.ts";
import { shipInvincible } from "./cheats.ts";
import { damage } from "./death.ts";
import { logPublic } from "./log.ts";
import { projectDone } from "./projects.ts";
import { rollFloat, rollInt } from "./rng.ts";
import type { DeepReadonly, GameConfig, GameState, PlayerView, ShipResources } from "./types.ts";

export const PLASMA_SHIELD = "PLASMA_SHIELD";

/** Whether any Plasma Shield emitter aboard is broken. */
export const plasmaShieldBroken = (state: DeepReadonly<GameState>): boolean =>
  Object.values(state.equipment).some((list) => list.some((e) => e.type === PLASMA_SHIELD && e.broken));

/** Whether the plasma shield is currently active: BIOS on and equipment working. */
export const plasmaShieldActive = (state: DeepReadonly<GameState>): boolean =>
  state.bios.plasma_shield && !plasmaShieldBroken(state);

export function startShip(config: GameConfig): ShipResources {
  const { oxygen, fuel, combustion, hull, plasmaShield } = config.ship;
  return { oxygen: oxygen.start, fuel: fuel.start, combustion: combustion.start, hull: hull.start, plasmaShield: plasmaShield.start };
}

/** The ship's public counters and caps: the combustion chamber's level is left out (owner, 2026-10-28), see check_combustion.ts. */
export function shipView(state: DeepReadonly<GameState>): PlayerView["ship"] {
  const { combustion: _level, ...resources } = state.ship;
  const { combustion: _cap, ...max } = shipMax(state.config);
  return { ...resources, plasmaShield: plasmaShieldActive(state) ? state.ship.plasmaShield : 0, max };
}

export function shipMax(config: DeepReadonly<GameConfig>): ShipResources {
  const { oxygen, fuel, combustion, hull, plasmaShield } = config.ship;
  return { oxygen: oxygen.max, fuel: fuel.max, combustion: combustion.max, hull: hull.max, plasmaShield: plasmaShield.max };
}

/**
 * Roll once per cycle for Oxygenated ducts (`OXY_MORE`): when complete, a 20% roll prevents all passive oxygen loss
 * for the cycle (normal burn and broken tank leaks) and posts a NERON announcement.
 */
export function rollOxygenSaved(state: GameState): boolean {
  if (!projectDone(state, "OXY_MORE")) return false;
  if (rollFloat(state) >= state.config.project.oxyMore.saveChance) return false;
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "oxygenSavedDucts" } });
  return true;
}

/**
 * At each cycle change: with oxygen already at 0, one random living crew member dies (Mush included); then the
 * ship burns its oxygen (unless Oxygenated ducts saved oxygen this cycle). So a ship that runs dry gets one cycle of grace.
 * Mutates a state the caller already cloned.
 */
export function burnOxygen(state: GameState, oxygenSaved = false): void {
  if (shipInvincible(state)) return;
  if (state.ship.oxygen === 0) {
    const living = state.players.filter((p) => p.alive);
    if (living.length > 0) {
      const i = rollInt(state, living.length);
      logPublic(state, undefined, "oxygenOut", undefined, "warning");
      const victim = living[i]!;
      damage(state, victim, victim.hp, "asphyxia");
    }
  }
  if (!oxygenSaved) {
    state.ship.oxygen = Math.max(0, state.ship.oxygen - state.config.ship.oxygen.perCycle);
  }
}

/** The percent of a hit the shield takes: none while BIOS has it off or the emitter is broken, more once the Plasma Shield project is done. */
export function shieldAbsorbPercent(state: Readonly<GameState>): number {
  const shield = state.config.ship.plasmaShield;
  if (!plasmaShieldActive(state)) return 0;
  return projectDone(state, "PLASMA_SHIELD") ? shield.projectAbsorbPercent : shield.absorbPercent;
}

/**
 * Damage to the ship (hunters.ts): Armoured corridors reduces the incoming hit (floor 0), then the shield takes its
 * percentage (rounded to the nearest point) while it has points, the hull the rest. Mutates a state the caller already cloned.
 */
export function damageShip(state: GameState, amount: number): void {
  if (shipInvincible(state)) return;
  const { ship } = state;
  const effective = projectDone(state, "ARMOUR_CORRIDOR")
    ? Math.max(0, amount - state.config.project.armourCorridor.damageReduction)
    : amount;
  const toShield = Math.min(ship.plasmaShield, Math.round((effective * shieldAbsorbPercent(state)) / 100));
  ship.plasmaShield -= toShield;
  ship.hull = Math.max(0, ship.hull - (effective - toShield));
}
