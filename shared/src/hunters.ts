// Hunters and space combat, first pass (owner, 2026-10-24, #208; docs/plans/archive/space-combat.md). A server-only point pool
// starts when Mush are chosen and grows each cycle change; a 20% roll spends it on a wave of hunters, never in the
// first two cycle changes. Each hunter takes one action a cycle: pick the ship as its target, or shoot at it. The crew
// shoots back from the six turrets (actions/turret_attack.ts) and patches the hull (actions/repair_hull.ts). At 0 hull
// the Daedalus explodes and everyone aboard dies. Hunters also aim at patrol ships in flight (docs/plans/archive/patrol.md,
// phase 4): at 0 armor a ship is destroyed for good and its pilot dies, as when the Daedalus jumps with ships out.
// Destroyed hunters and ships leave debris in space (`state.space`, phase 5), which patrol ships collect
// (actions/collect_scrap.ts) until the Daedalus jumps.
// Other kinds (owner, 2026-11-12, #388; eMush's numbers in `config.hunters.types`): a wave draws its kinds by weight; the
// Arack stops the ship from jumping (actions/travel.ts, leave_orbit.ts), the D1000 acts three times a cycle and its
// armor takes 1 off each hit it receives, every Trax follows a jump, and the asteroid doesn't shoot but hits the
// Daedalus for its hp once its countdown runs out.

import { killPlayer } from "./death.ts";
import { newItemId, sameContainer } from "./items.ts";
import { logPublic } from "./log.ts";
import { followingHuntersShare, hunterPointsPerCycle, waveShrinkChance } from "./modifiers.ts";
import { type PatrolShip, patrolShip, rechargePatrolShips, shipsInFlight } from "./patrol.ts";
import { projectDone } from "./projects.ts";
import { RESEARCH_COMPLETE } from "./research.ts";
import { roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
import { damageShip } from "./ship.ts";
import { type DebrisTable, type DeepReadonly, type GameState, HUNTER_TYPES, type Hunter, type HunterTarget, type HunterType, type PlayerState } from "./types.ts";
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

/** A broken turret shows 0 and keeps its own charges for when it is repaired (owner, 2026-10-25). */
export const turretCharges = (state: Readonly<GameState>, turret: string): number =>
  allTurrets(state).some((t) => t.id === turret && t.broken) ? 0 : state.turrets[turret] ?? state.config.turrets.charges;

/** Charges each working turret regains per cycle: doubled once Inverted pulsator (`TURRET_EXTRA_FIRERATE`) is complete. */
export function turretRechargePerCycle(state: Readonly<Pick<GameState, "config" | "projects">>): number {
  const base = state.config.turrets.rechargePerCycle;
  return projectDone(state, "TURRET_EXTRA_FIRERATE") ? base * state.config.project.turretExtraFirerate.rechargeMultiplier : base;
}

/** A new hunter of a kind, at full hp and with no target yet. Mutates a state the caller already cloned. */
export function newHunter(state: GameState, type: HunterType): Hunter {
  const kind = state.config.hunters.types[type];
  return { id: `hunter-${state.hunters.nextId++}`, type, hp: kind.hp, hitChance: kind.hitChance, target: null, countdown: kind.countdown };
}

/** Is an Arack around? It stops the ship from travelling or leaving orbit (owner, 2026-11-12, #388; eMush). */
export const arackAround = (state: Readonly<GameState>): boolean => state.hunters.list.some((h) => h.type === "spider");

/** Hunters that shoot: every kind but the asteroid, which only counts down (eMush's `getAllExceptType(ASTEROID)`). */
export const shootingHunters = (state: Readonly<GameState>): number => state.hunters.list.filter((h) => state.config.hunters.types[h.type].actions > 0).length;

/**
 * Takes `amount`, less the hunter's armor (the D1000's 1), off its hp; at 0 it is destroyed (removed) and leaves debris
 * in space. Returns whether it was. Mutates a state the caller already cloned.
 */
export function damageHunter(state: GameState, id: string, amount: number): boolean {
  const hunter = state.hunters.list.find((h) => h.id === id);
  if (!hunter) return false;
  hunter.hp = Math.max(0, hunter.hp - Math.max(0, amount - state.config.hunters.types[hunter.type].armor));
  if (hunter.hp > 0) return false;
  state.hunters.list = state.hunters.list.filter((h) => h.id !== id);
  dropDebris(state, state.config.hunters.types[hunter.type].debris);
  return true;
}

/**
 * Leaves wreckage in space from `table` (owner, 2026-11-21, #422: eMush's table per hunter kind): a weighted piece
 * count, then a weighted item type for each piece.
 */
export function dropDebris(state: GameState, table: DeepReadonly<DebrisTable>): void {
  const { count, types } = table;
  const kinds = Object.keys(types);
  const weights = kinds.map((kind) => types[kind]!);
  for (let i = rollWeighted(state, count); i > 0; i--) state.space.push({ id: newItemId(state), type: kinds[rollWeighted(state, weights)]! });
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
  const recharge = turretRechargePerCycle(state);
  for (const turret of allTurrets(state).filter((t) => !t.broken)) {
    const charges = Math.min(state.config.turrets.charges, turretCharges(state, turret.id) + recharge);
    if (charges >= state.config.turrets.charges) delete state.turrets[turret.id];
    else state.turrets[turret.id] = charges;
  }
  rechargePatrolShips(state);
  const shield = state.config.ship.plasmaShield;
  if (state.bios.plasma_shield) state.ship.plasmaShield = Math.min(shield.max, state.ship.plasmaShield + shield.regen);
  hunters.points += huntersPerCyclePoints(state, day);
  if (state.cycle - hunters.since > state.config.hunters.safeCycles) spawnWave(state, day);
}

/**
 * Each hunter's actions, as many as its kind has (the D1000's 3): pick a target, or shoot at it. An asteroid instead
 * counts down, and at 0 hits the Daedalus (`asteroidImpact`).
 */
function huntersAct(state: GameState): void {
  for (const hunter of [...state.hunters.list]) {
    if (state.ship.hull === 0 || state.phase !== "playing") return;
    if (!state.hunters.list.some((h) => h.id === hunter.id)) continue;
    if (hunter.countdown !== null) {
      hunter.countdown = Math.max(0, hunter.countdown - 1);
      if (hunter.countdown === 0) asteroidImpact(state, hunter);
      continue;
    }
    for (let i = 0; i < state.config.hunters.types[hunter.type].actions; i++) {
      if (state.ship.hull === 0 || state.phase !== "playing") return;
      if (!state.hunters.list.some((h) => h.id === hunter.id)) break;
      hunterAction(state, hunter);
    }
  }
}

/**
 * One action: pick a target, or shoot at it. A hit on the Daedalus or a teammate hunter (Meridon scrambler) makes it
 * pick again; a hit on a patrol ship (its kind's damage in armor, a line in the ship's room for its pilot; owner,
 * 2026-10-28) keeps its aim until the ship is gone.
 */
function hunterAction(state: GameState, hunter: Hunter): void {
  const config = state.config.hunters;
  const kind = config.types[hunter.type];
  if (hunter.target?.kind === "hunter") {
    const targetId = hunter.target.id;
    if (!state.hunters.list.some((h) => h.id === targetId)) hunter.target = null;
  }
  if (hunter.target === null) {
    hunter.target = pickTarget(state, hunter);
    return;
  }
  if (rollFloat(state) >= hunter.hitChance) {
    hunter.hitChance = Math.min(1, hunter.hitChance + config.missBonus);
    return;
  }
  hunter.hitChance = kind.hitChance;
  const amount = roll(state, kind.damage);
  if (hunter.target.kind === "ship") {
    damageShip(state, amount);
    hunter.target = null;
    return;
  }
  if (hunter.target.kind === "hunter") {
    damageHunter(state, hunter.target.id, amount);
    hunter.target = null;
    return;
  }
  const ship = patrolShip(hunter.target.id)!;
  const shipState = state.patrolShips[ship.id]!;
  shipState.armor = Math.max(0, shipState.armor - amount);
  logPublic(state, ship.id, "hunterHitPatrol", { room: ship.id, armor: amount });
  if (shipState.armor === 0) destroyPatrolShip(state, ship, "patrolDestroyed");
}

/**
 * An asteroid's countdown ran out (owner, 2026-11-12, #388): it hits the Daedalus for its hp, through the shield like
 * any hit, and is gone. Like eMush, its debris is left in space as if shot down (owner, 2026-11-21, #422). NERON tells
 * the whole crew.
 */
function asteroidImpact(state: GameState, asteroid: Hunter): void {
  state.hunters.list = state.hunters.list.filter((h) => h.id !== asteroid.id);
  damageShip(state, asteroid.hp);
  dropDebris(state, state.config.hunters.types.asteroid.debris);
  logPublic(state, undefined, "asteroidImpact", undefined, "warning");
}

/**
 * With Meridon scrambler (`FUNGUS_SCRAMBLER`), a 20% chance to aim at another shooting hunter (not self, not an
 * asteroid); otherwise eMush's order: a patrol ship in flight (15%, one at random), else the Daedalus.
 */
function pickTarget(state: GameState, hunter: Readonly<Hunter>): HunterTarget {
  if ((state.research.FUNGUS_SCRAMBLER ?? 0) >= RESEARCH_COMPLETE) {
    const teammates = state.hunters.list.filter((h) => h.id !== hunter.id && state.config.hunters.types[h.type].actions > 0);
    if (teammates.length > 0 && rollFloat(state) < state.config.hunters.meridonScramblerChance) {
      return { kind: "hunter", id: teammates[rollInt(state, teammates.length)]!.id };
    }
  }
  const flying = shipsInFlight(state);
  if (flying.length > 0 && rollFloat(state) < state.config.hunters.patrolTargetChance) return { kind: "patrol", id: flying[rollInt(state, flying.length)]!.id };
  return { kind: "ship" };
}

/** Hunters aiming at `ship` aim at `to` instead: the Daedalus when it lands (eMush), a new pick when it is destroyed. */
export function retargetHunters(state: GameState, ship: PatrolShip, to: HunterTarget | null): void {
  for (const hunter of state.hunters.list) if (hunter.target?.kind === "patrol" && hunter.target.id === ship.id) hunter.target = to;
}

/**
 * Hunters aiming at `ship` pick another target at once (owner, 2026-11-09, #359): it landed on a planet, out of their
 * reach (`shipsInFlight` leaves it out). Mutates a cloned state.
 */
export function retargetNow(state: GameState, ship: PatrolShip): void {
  for (const hunter of state.hunters.list) if (hunter.target?.kind === "patrol" && hunter.target.id === ship.id) hunter.target = pickTarget(state, hunter);
}

/**
 * A patrol ship is destroyed for good (owner, 2026-10-28): NERON tells the whole crew (`key` says how: shot down, or left
 * behind by a jump), and everyone aboard dies, since there are no spacesuits yet. Everything in the wreck, their bodies
 * and belongings too, floats off as debris (phase 5). Mutates a state the caller already cloned.
 */
export function destroyPatrolShip(state: GameState, ship: PatrolShip, key: "patrolDestroyed" | "patrolLost"): void {
  const shipState = state.patrolShips[ship.id]!;
  shipState.destroyed = true;
  shipState.armor = 0;
  retargetHunters(state, ship, null);
  logPublic(state, undefined, key, { room: ship.id }, "warning");
  for (const p of state.players) if (p.alive && p.room === ship.id) killPlayer(state, p, key === "patrolLost" ? "abandoned" : "space_battle");
  const wreck = { kind: "room", id: ship.id } as const;
  for (const { at: _at, hiddenBy: _hiddenBy, ...item } of state.items.filter((i) => sameContainer(i.at, wreck))) state.space.push(item);
  state.items = state.items.filter((i) => !sameContainer(i.at, wreck));
}

/**
 * The Daedalus jumps (travel or leaving orbit): each ship out is lost with its pilot (owner, 2026-10-24, answer 5), and
 * the debris around the ship, the wrecks' included, is left behind. With Magnetic net the ships were already pulled
 * aboard (`pullShipsAboard`, actions/land.ts), so only the debris goes.
 */
export function loseShipsInFlight(state: GameState): void {
  for (const ship of shipsInFlight(state)) destroyPatrolShip(state, ship, "patrolLost");
  state.space = [];
}

/** Kinds a wave on `day` may draw at all: a weight above 0 and `fromDay` reached. */
const drawable = (state: Readonly<GameState>, day: number): HunterType[] =>
  HUNTER_TYPES.filter((type) => state.config.hunters.types[type].weight > 0 && day >= state.config.hunters.types[type].fromDay);

/**
 * The 20% roll, once the pool can pay for its cheapest kind. On a hit, hunters are drawn one at a time by weight among
 * the kinds still affordable and under their per-wave cap (owner, 2026-11-12, #388; eMush), until none is left; the
 * remainder is carried over, and NERON tells the crew.
 */
function spawnWave(state: GameState, day: number): void {
  const { hunters } = state;
  const config = state.config.hunters;
  const kinds = drawable(state, day);
  if (!kinds.some((type) => config.types[type].cost <= hunters.points)) return;
  if (rollFloat(state) >= config.waveChance) return;
  const wave: HunterType[] = [];
  for (;;) {
    const open = kinds.filter((type) => {
      const kind = config.types[type];
      return kind.cost <= hunters.points && (kind.maxPerWave === null || wave.filter((t) => t === type).length < kind.maxPerWave);
    });
    if (open.length === 0) break;
    // One kind left needs no roll, so a wave of plain hunters (before day 5) draws nothing.
    const type = open.length === 1 ? open[0]! : open[rollWeighted(state, open.map((t) => config.types[t].weight))]!;
    hunters.points -= config.types[type].cost;
    wave.push(type);
  }
  let size = wave.length;
  // Space Tactics (owner, 2026-10-25): the points are spent in full; the hunters that don't come are rounded down, the last drawn first.
  const shrinkChance = waveShrinkChance(state);
  if (shrinkChance > 0) {
    if (rollFloat(state) < shrinkChance) size -= Math.floor(wave.length * state.config.spaceTactics.shrink);
  }
  for (const type of wave.slice(0, size)) hunters.list.push(newHunter(state, type));
  logPublic(state, undefined, "hunterWave", { count: size }, "warning");
}

/**
 * The ship jumps (travel or leaving orbit; owner, 2026-10-24, #240): half the plain hunters and Aracks, rounded up,
 * follow, every Trax follows, and asteroids and D1000s never do (owner, 2026-11-12, #388); the rest are lost. The
 * followers in the half are picked at random. All of them keep their hp, cost the pool nothing, and lose their aim, so
 * they pick the ship again before they next shoot. Mutates a state the caller already cloned.
 */
export function huntersFollow(state: GameState): void {
  const { list } = state.hunters;
  const { types } = state.config.hunters;
  const share = list.filter((h) => types[h.type].follows === "share");
  const count = Math.ceil(followingHuntersShare(state.config.hunters.followShare, state) * share.length);
  const kept = new Set([...list.filter((h) => types[h.type].follows === "all"), ...rollShuffle(state, share).slice(0, count)]);
  state.hunters.list = list.filter((h) => kept.has(h));
  for (const hunter of state.hunters.list) {
    hunter.target = null;
    hunter.hitChance = types[hunter.type].hitChance;
  }
}

/**
 * Hull 0: the Daedalus explodes and everyone aboard dies. Like any death of the last human it's a Mush win, with its
 * own ending (owner, 2026-10-24); the game ends first so killPlayer doesn't end it as `humans_dead`.
 */
export function destroyShip(state: GameState): void {
  logPublic(state, undefined, "shipDestroyed", undefined, "warning");
  endGame(state, "mush", "ship_destroyed");
  for (const p of state.players) killPlayer(state, p, "daedalus_destroyed");
}
