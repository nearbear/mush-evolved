// Hunters and space combat, first pass (owner, 2026-10-24, #208; docs/space-combat-plan.md). A server-only point pool
// starts when Mush are chosen and grows each cycle change; a 20% roll spends it on a wave of hunters, never in the
// first two cycle changes. Each hunter takes one action a cycle: pick the ship as its target, or shoot at it. The crew
// shoots back from the six turrets (actions/turret_attack.ts) and patches the hull (actions/repair_hull.ts). At 0 hull
// the Daedalus explodes and everyone aboard dies. Hunters also aim at patrol ships in flight (docs/patrol-plan.md,
// phase 4): at 0 armor a ship is destroyed for good and its pilot dies, as when the Daedalus jumps with ships out.

import { killPlayer } from "./death.ts";
import { logPublic } from "./log.ts";
import { followingHuntersShare, hunterPointsPerCycle, waveShrinkChance } from "./modifiers.ts";
import { type PatrolShip, patrolShip, rechargePatrolShips, shipsInFlight } from "./patrol.ts";
import { roll, rollFloat, rollInt, rollShuffle } from "./rng.ts";
import { damageShip } from "./ship.ts";
import type { GameState, HunterTarget, PlayerState } from "./types.ts";
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
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === TURRET_EQUIPMENT);
}

/** Every turret on the ship. */
export function allTurrets(state: Readonly<GameState>) {
  return Object.values(state.equipment).flatMap((list) => list.filter((equipment) => equipment.type === TURRET_EQUIPMENT));
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

/** Points the pool gains at a cycle change on `day`: day + 6, +1 from day 5, +2 instead from day 10 (eMush's hard and very hard modes). */
export function huntersPerCyclePoints(state: Readonly<GameState>, day: number): number {
  const { perCycle, hardFromDay, hardBonus, veryHardFromDay, veryHardBonus } = state.config.hunters.points;
  const bonus = day >= veryHardFromDay ? veryHardBonus : day >= hardFromDay ? hardBonus : 0;
  return hunterPointsPerCycle(day + perCycle + bonus, state);
}

/**
 * At each cycle change, once Mush are chosen: the hunters act, turrets and docked patrol ships recharge, the shield regenerates, the pool
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
  rechargePatrolShips(state);
  const shield = state.config.ship.plasmaShield;
  if (state.bios.plasma_shield) state.ship.plasmaShield = Math.min(shield.max, state.ship.plasmaShield + shield.regen);
  hunters.points += huntersPerCyclePoints(state, day);
  if (state.cycle - hunters.since > state.config.hunters.safeCycles) spawnWave(state);
}

/**
 * Each hunter's action: pick a target, or shoot at it. A hit on the Daedalus makes it pick again; a hit on a patrol ship
 * (2 to 4 armor, a line in the ship's room for its pilot; owner, 2026-10-28) keeps its aim until the ship is gone.
 */
function huntersAct(state: GameState): void {
  const config = state.config.hunters;
  for (const hunter of state.hunters.list) {
    if (state.ship.hull === 0 || state.phase !== "playing") return;
    if (hunter.target === null) {
      hunter.target = pickTarget(state);
      continue;
    }
    if (rollFloat(state) >= hunter.hitChance) {
      hunter.hitChance = Math.min(1, hunter.hitChance + config.missBonus);
      continue;
    }
    hunter.hitChance = config.hitChance;
    const amount = roll(state, config.damage);
    if (hunter.target.kind === "ship") {
      damageShip(state, amount);
      hunter.target = null;
      continue;
    }
    const ship = patrolShip(hunter.target.id)!;
    const shipState = state.patrolShips[ship.id]!;
    shipState.armor = Math.max(0, shipState.armor - amount);
    logPublic(state, ship.id, "hunterHitPatrol", { room: ship.id, armor: amount });
    if (shipState.armor === 0) destroyPatrolShip(state, ship, "patrolDestroyed");
  }
}

/** eMush's order: a patrol ship in flight (15%, one at random), else the Daedalus. Players out in space come later. */
function pickTarget(state: GameState): HunterTarget {
  const flying = shipsInFlight(state);
  if (flying.length > 0 && rollFloat(state) < state.config.hunters.patrolTargetChance) return { kind: "patrol", id: flying[rollInt(state, flying.length)]!.id };
  return { kind: "ship" };
}

/** Hunters aiming at `ship` aim at `to` instead: the Daedalus when it lands (eMush), a new pick when it is destroyed. */
export function retargetHunters(state: GameState, ship: PatrolShip, to: HunterTarget | null): void {
  for (const hunter of state.hunters.list) if (hunter.target?.kind === "patrol" && hunter.target.id === ship.id) hunter.target = to;
}

/**
 * A patrol ship is destroyed for good (owner, 2026-10-28): NERON tells the whole crew (`key` says how: shot down, or left
 * behind by a jump), and everyone aboard dies, since there are no spacesuits yet. Their bodies and belongings stay in
 * the wreck's room for now. Mutates a state the caller already cloned.
 */
export function destroyPatrolShip(state: GameState, ship: PatrolShip, key: "patrolDestroyed" | "patrolLost"): void {
  const shipState = state.patrolShips[ship.id]!;
  shipState.destroyed = true;
  shipState.armor = 0;
  retargetHunters(state, ship, null);
  logPublic(state, undefined, key, { room: ship.id }, "warning");
  for (const p of state.players) if (p.alive && p.room === ship.id) killPlayer(state, p);
}

/** The Daedalus jumps (travel or leaving orbit) with ships out: each is lost with its pilot (owner, 2026-10-24, answer 5). */
export function loseShipsInFlight(state: GameState): void {
  for (const ship of shipsInFlight(state)) destroyPatrolShip(state, ship, "patrolLost");
}

/** The 20% roll: on a hit, one hunter per 10 points, the remainder carried over, and NERON tells the crew. */
function spawnWave(state: GameState): void {
  const { hunters } = state;
  const config = state.config.hunters;
  const count = Math.floor(hunters.points / config.points.perHunter);
  if (count === 0) return;
  if (rollFloat(state) >= config.waveChance) return;
  hunters.points -= count * config.points.perHunter;
  let size = count;
  // Space Tactics (owner, 2026-10-25): the points are spent in full; the hunters that don't come are rounded down.
  const shrinkChance = waveShrinkChance(state);
  if (shrinkChance > 0) {
    if (rollFloat(state) < shrinkChance) size -= Math.floor(count * state.config.spaceTactics.shrink);
  }
  for (let i = 0; i < size; i++) hunters.list.push({ id: `hunter-${hunters.nextId++}`, hp: config.hp, hitChance: config.hitChance, target: null });
  logPublic(state, undefined, "hunterWave", { count: size }, "warning");
}

/**
 * The ship jumps (travel or leaving orbit; owner, 2026-10-24, #240): half the hunters, rounded up, follow and the rest
 * are lost. The followers are picked at random and keep their hp, cost the pool nothing, and lose their aim, so they pick
 * the ship again before they next shoot. Mutates a state the caller already cloned.
 */
export function huntersFollow(state: GameState): void {
  const { list } = state.hunters;
  const count = Math.ceil(followingHuntersShare(state.config.hunters.followShare, state) * list.length);
  const kept = new Set(rollShuffle(state, list).slice(0, count));
  state.hunters.list = list.filter((h) => kept.has(h));
  for (const hunter of state.hunters.list) {
    hunter.target = null;
    hunter.hitChance = state.config.hunters.hitChance;
  }
}

/**
 * Hull 0: the Daedalus explodes and everyone aboard dies. Like any death of the last human it's a Mush win, with its
 * own ending (owner, 2026-10-24); the game ends first so killPlayer doesn't end it as `humans_dead`.
 */
export function destroyShip(state: GameState): void {
  logPublic(state, undefined, "shipDestroyed", undefined, "warning");
  endGame(state, "mush", "ship_destroyed");
  for (const p of state.players) killPlayer(state, p);
}
