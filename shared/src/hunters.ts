// Hunters and space combat, first pass (owner, 2026-10-24, #208; docs/space-combat-plan.md). A server-only point pool
// starts when Mush are chosen and grows each cycle change; a 20% roll spends it on a wave of hunters, never in the
// first two cycle changes. Each hunter takes one action a cycle: pick the ship as its target, or shoot at it. The crew
// shoots back from the six turrets (actions/turret_attack.ts) and patches the hull (actions/repair_hull.ts). At 0 hull
// the Daedalus explodes and everyone aboard dies.

import { killPlayer } from "./death.ts";
import { logPublic } from "./log.ts";
import { hunterPointsPerCycle } from "./modifiers.ts";
import { nextFloat, nextInt, type RngState } from "./rng.ts";
import { damageShip } from "./ship.ts";
import type { GameState, PlayerState } from "./types.ts";
import { endGame } from "./victory.ts";

export const TURRET_EQUIPMENT = "TURRET_COMMAND";

/** An empty pool, before Mush are chosen. */
export const newHunters = (): GameState["hunters"] => ({ points: 0, since: null, list: [], nextId: 1 });

/** Starts the pool when the game proper starts: at creation without pre-selection, otherwise in `selectMush`. */
export function startHunters(state: GameState): void {
  state.hunters.points = state.config.hunters.points.start;
  state.hunters.since = state.cycle;
}

/** Turrets in the player's room. */
export function turretsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === TURRET_EQUIPMENT);
}

/** Every turret on the ship. */
export function allTurrets(state: Readonly<GameState>) {
  return Object.values(state.config.equipment).flatMap((list) => list.filter((equipment) => equipment.type === TURRET_EQUIPMENT));
}

export const turretCharges = (state: Readonly<GameState>, turret: string): number => state.turrets[turret] ?? state.config.turrets.charges;

/** Takes `amount` off a hunter's hp; at 0 it is destroyed (removed). Returns whether it was. Mutates a state the caller already cloned. */
export function damageHunter(state: GameState, id: string, amount: number): boolean {
  const hunter = state.hunters.list.find((h) => h.id === id);
  if (!hunter) return false;
  hunter.hp = Math.max(0, hunter.hp - amount);
  if (hunter.hp > 0) return false;
  state.hunters.list = state.hunters.list.filter((h) => h.id !== id);
  return true;
}

/** Uniform integer in [min, max]. */
export function rollRange(rng: RngState, [min, max]: readonly [number, number]): [number, RngState] {
  const [n, next] = nextInt(rng, max - min + 1);
  return [min + n, next];
}

/** Points the pool gains at a cycle change on `day`: day + 6, +1 from day 5, +2 instead from day 10 (eMush's hard and very hard modes). */
export function huntersPerCyclePoints(state: Readonly<GameState>, day: number): number {
  const { perCycle, hardFromDay, hardBonus, veryHardFromDay, veryHardBonus } = state.config.hunters.points;
  const bonus = day >= veryHardFromDay ? veryHardBonus : day >= hardFromDay ? hardBonus : 0;
  return hunterPointsPerCycle(day + perCycle + bonus, state);
}

/**
 * At each cycle change, once Mush are chosen: the hunters act, turrets recharge, the shield regenerates, the pool
 * grows, and maybe a wave arrives. `day` is the day the new cycle belongs to. Mutates a state the caller already cloned.
 */
export function huntersCycle(state: GameState, day: number): void {
  const { hunters } = state;
  if (state.phase !== "playing" || hunters.since === null) return;
  huntersAct(state);
  if (state.ship.hull === 0) {
    destroyShip(state);
    return;
  }
  for (const turret of allTurrets(state)) {
    const charges = Math.min(state.config.turrets.charges, turretCharges(state, turret.id) + state.config.turrets.rechargePerCycle);
    if (charges >= state.config.turrets.charges) delete state.turrets[turret.id];
    else state.turrets[turret.id] = charges;
  }
  const shield = state.config.ship.plasmaShield;
  if (state.bios.plasma_shield) state.ship.plasmaShield = Math.min(shield.max, state.ship.plasmaShield + shield.regen);
  hunters.points += huntersPerCyclePoints(state, day);
  if (state.cycle - hunters.since > state.config.hunters.safeCycles) spawnWave(state);
}

/** Each hunter's action: pick the ship as its target, or shoot at it (and then pick again). */
function huntersAct(state: GameState): void {
  const config = state.config.hunters;
  for (const hunter of state.hunters.list) {
    if (state.ship.hull === 0) return;
    if (!hunter.targeted) {
      hunter.targeted = true;
      continue;
    }
    const [roll, rng] = nextFloat(state.rng);
    state.rng = rng;
    if (roll < hunter.hitChance) {
      const [amount, next] = rollRange(state.rng, config.damage);
      state.rng = next;
      damageShip(state, amount);
      hunter.hitChance = config.hitChance;
      hunter.targeted = false;
    } else {
      hunter.hitChance = Math.min(1, hunter.hitChance + config.missBonus);
    }
  }
}

/** The 20% roll: on a hit, one hunter per 10 points, the remainder carried over, and NERON tells the crew. */
function spawnWave(state: GameState): void {
  const { hunters } = state;
  const config = state.config.hunters;
  const count = Math.floor(hunters.points / config.points.perHunter);
  if (count === 0) return;
  const [roll, rng] = nextFloat(state.rng);
  state.rng = rng;
  if (roll >= config.waveChance) return;
  hunters.points -= count * config.points.perHunter;
  for (let i = 0; i < count; i++) hunters.list.push({ id: `hunter-${hunters.nextId++}`, hp: config.hp, hitChance: config.hitChance, targeted: false });
  logPublic(state, undefined, "hunterWave", { count }, "warning");
}

/**
 * Hull 0: the Daedalus explodes and everyone aboard dies. Like any death of the last human it's a Mush win, with its
 * own ending (owner, 2026-10-24); the game ends first so killPlayer doesn't end it as `humans_dead`.
 */
function destroyShip(state: GameState): void {
  logPublic(state, undefined, "shipDestroyed", undefined, "warning");
  endGame(state, "mush", "ship_destroyed");
  for (const p of state.players) killPlayer(state, p);
}
