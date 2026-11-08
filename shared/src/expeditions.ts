// Expeditions (docs/plans/expedition.md). Phase 1 (owner, 2026-10-31): a Pilot in the Icarus Bay takes off while the
// ship orbits a planet with unexplored sectors; everyone living in the bay goes, up to `maxCrew`. A landing event, then
// up to `sectors` unexplored sectors drawn by their tag's `explo` weight, each with an event from its table.
// Phase 2 (owner, 2026-11-07, #356): the crew is away over time, in the Icarus (`config.expedition.craft`, a room with
// no doors). The landing is the first step, `stepMs` after takeoff, then one sector per `stepMs`; the server's `tick`
// runs them (`nextDue`, queue.ts). Members see each event in their report as it happens. The crew is back in the bay
// as the last sector resolves, or at once when every member is dead, with whatever is in the Icarus (loot, bodies).
// Single player resolves it all at takeoff (`instantExpeditions`). If the ship jumps while the crew is out, they are
// stranded (`strandExpedition`): Magnetic return brings them back, or they die and the Icarus is lost for good.
// Pure: every draw goes through the seeded RNG.
// The action is actions/icarus_takeoff.ts.

import { endPushToLeave } from "./actions/accommodate.ts";
import { board } from "./actions/takeoff.ts";
import { damage, killPlayer } from "./death.ts";
import { FAST_EXPEDITION_STEP_MS, fastExpeditions } from "./cheats.ts";
import { soil } from "./dirt.ts";
import { isWorking, itemsIn, newItemId, removeItem, sameContainer } from "./items.ts";
import { logPrivate, logPublic } from "./log.ts";
import { isTraveling } from "./navigation.ts";
import { canFly } from "./patrol.ts";
import { PLANET_TAGS, type PlanetTag } from "./planets.ts";
import { projectDone } from "./projects.ts";
import { roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
import { shipMax } from "./ship.ts";
import { hasSkill } from "./skills.ts";
import type { ExpeditionEvent, ExpeditionEventRule, ExpeditionReport, GameState, ItemState, Planet, PlayerState } from "./types.ts";

/** The landing's event table key: drawn before any sector. */
export const LANDING = "LANDING";

/**
 * Who may launch: a Pilot, for now (owner, 2026-10-31). The one place this is decided, so the NERON piloting lock can
 * open it to everyone later.
 */
export const canLaunchExpedition = (_state: Readonly<GameState>, player: Readonly<PlayerState>): boolean => canFly(player);

/** The planet the ship orbits, if any, while not leaving it. */
export function orbitedPlanet(state: Readonly<GameState>): Planet | undefined {
  const id = state.navigation.orbit;
  if (id === null || isTraveling(state)) return undefined;
  return planetById(state, id);
}

const planetById = (state: Readonly<GameState>, id: string): Planet | undefined =>
  Object.values(state.planets)
    .flat()
    .find((p) => p.id === id);

/** Whether the planet still has a sector no expedition explored. */
export const hasUnexplored = (planet: Readonly<Planet>): boolean => planet.sectors.some((s) => !s.explored);

/** Who goes: the launcher, then the others living in the bay in a random order, up to `maxCrew` in all. */
export function pickCrew(state: GameState, launcher: PlayerState): PlayerState[] {
  const others = state.players.filter((p) => p.id !== launcher.id && p.alive && p.room === launcher.room);
  return [launcher, ...rollShuffle(state, others)].slice(0, state.config.expedition.maxCrew);
}

/** The sectors explored this time, by index, in order: unexplored ones drawn by their tag's `explo` weight, without repeats. */
export function pickSectors(state: GameState, planet: Readonly<Planet>): number[] {
  const left = planet.sectors.flatMap((s, i) => (s.explored ? [] : [i]));
  const picked: number[] = [];
  while (picked.length < state.config.expedition.sectors && left.length > 0) {
    const i = rollWeighted(
      state,
      left.map((index) => PLANET_TAGS[planet.sectors[index]!.tag].explo),
    );
    picked.push(left.splice(i, 1)[0]!);
  }
  return picked;
}

/**
 * Launches an expedition to the orbited planet from `launcher`'s room. The caller (the takeoff action) checked that it
 * may go. Mutates a cloned state: the public takeoff line, the crew into the Icarus, an empty report, and the
 * expedition under way, its sectors drawn now so the time it takes is known. With `instantExpeditions` it runs to the
 * end at once. Returns the report.
 */
export function runExpedition(state: GameState, launcher: PlayerState): ExpeditionReport {
  const planet = orbitedPlanet(state)!;
  const rules = state.config.expedition;
  const crew = pickCrew(state, launcher);
  logPublic(state, launcher.room, "icarusTakeoff", { name: launcher.character, planet: planet.name });

  const report: ExpeditionReport = {
    id: `expedition-${state.nextExpeditionId++}`,
    members: crew.map((p) => p.id),
    crew: crew.map((p) => p.character),
    planet: planet.name,
    events: [],
  };
  state.expeditions.push(report);
  for (const p of crew) {
    endPushToLeave(state, p);
    board(p, rules.craft);
  }
  state.expedition = {
    report: report.id,
    planet: planet.id,
    landed: false,
    sectors: pickSectors(state, planet),
    nextAt: state.now + stepMs(state),
    // Items each member carried when they set out, for `deadKeepItems: false`.
    carried: Object.fromEntries(crew.map((p) => [p.id, itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id)])),
  };
  if (state.config.instantExpeditions) while (state.expedition) expeditionStep(state);
  return report;
}

/**
 * The next step of the expedition under way: the landing, or the next sector (marked explored). Then the crew comes
 * back if that was the last one or nobody is left alive; otherwise the next step is `stepMs` later. Mutates a cloned
 * state; the caller checked there is one.
 */
export function expeditionStep(state: GameState): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  const crew = report.members.map((id) => state.players.find((p) => p.id === id)!);
  const ctx: Ctx = { state, crew, carried: away.carried };
  const planet = planetById(state, away.planet);
  if (!away.landed) {
    away.landed = true;
    const pilotAboard = crew.some((p) => p.alive && canFly(p));
    const landing = rules.events[LANDING]!.filter((e) => !(pilotAboard && e.kind === "catastrophe"));
    report.events.push(resolve(ctx, LANDING, landing));
  } else if (planet) {
    const sector = planet.sectors[away.sectors.shift()!]!;
    sector.explored = true;
    report.events.push(resolve(ctx, sector.tag, rules.events[sector.tag] ?? []));
  } else {
    // The planet is gone (only possible once the ship has left it): nothing left to explore.
    away.sectors = [];
  }
  if (away.sectors.length === 0 || !crew.some((p) => p.alive)) returnExpedition(state);
  // The fast cheat counts from now, so a step that was due long ago doesn't set off a burst of overdue ones.
  else away.nextAt = fastExpeditions(state) ? Math.max(away.nextAt, state.now) + FAST_EXPEDITION_STEP_MS : away.nextAt + rules.stepMs;
}

/**
 * The crew is back: the living into the bay, and everything in the Icarus (loot, bodies, what members dropped) onto
 * the bay's floor. Each living member may come back dirty (`dirtyChance`). Each member gets a private line pointing at
 * the report; nothing public (owner, 2026-10-31). Mutates a cloned state.
 */
function returnExpedition(state: GameState): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  state.expedition = null;
  for (const item of state.items) if (sameContainer(item.at, { kind: "room", id: rules.craft })) item.at = { kind: "room", id: rules.room };
  for (const id of report.members) {
    const p = state.players.find((q) => q.id === id)!;
    if (p.alive && p.room === rules.craft) {
      board(p, rules.room);
      if (rollFloat(state) < rules.dirtyChance) soil(state, p);
    }
    logPrivate(state, p.id, "expeditionReturned", { planet: report.planet, report: report.id });
  }
}

/**
 * The Daedalus jumped (travel or leaving orbit) while a crew is out (owner, 2026-11-07, #356). With Magnetic return
 * (`AUTO_RETURN_ICARUS`) the crew is back at once, the sectors left skipped, as on a normal return; NERON says so to
 * everyone. Without it the living members die, the Icarus is lost with everything in it (items, loot, bodies), and no
 * expedition can take off again (`icarusLost`); NERON tells everyone. Mutates a cloned state; nothing if none is out.
 */
export function strandExpedition(state: GameState): void {
  const away = state.expedition;
  if (!away) return;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  if (projectDone(state, "AUTO_RETURN_ICARUS")) {
    logPublic(state, undefined, "icarusRecalled", { planet: report.planet }, "warning");
    returnExpedition(state);
    return;
  }
  const craft = state.config.expedition.craft;
  state.expedition = null;
  state.icarusLost = true;
  logPublic(state, undefined, "icarusLost", { planet: report.planet }, "warning");
  for (const id of report.members) {
    const p = state.players.find((q) => q.id === id)!;
    if (p.alive && p.room === craft) killPlayer(state, p);
  }
  state.items = state.items.filter((i) => !sameContainer(i.at, { kind: "room", id: craft }));
}

/** When the expedition under way is back, if nothing ends it early: one `stepMs` per step left after the next. */
export function expeditionReturnAt(state: Readonly<GameState>): number | null {
  const away = state.expedition;
  if (!away) return null;
  const steps = (away.landed ? 0 : 1) + away.sectors.length;
  return away.nextAt + (steps - 1) * stepMs(state);
}

/** Time between steps: the config's, or 2 seconds under the fastExpeditions development cheat. */
const stepMs = (state: Readonly<GameState>): number => (fastExpeditions(state) ? FAST_EXPEDITION_STEP_MS : state.config.expedition.stepMs);

interface Ctx {
  state: GameState;
  crew: PlayerState[];
  carried: Readonly<Record<string, string[]>>;
}

/** Draws and applies one sector's event. An empty table is a sector where nothing happens. */
function resolve(ctx: Ctx, sector: PlanetTag | typeof LANDING, table: readonly ExpeditionEventRule[]): ExpeditionEvent {
  const { state } = ctx;
  if (table.length === 0) return { sector, kind: "nothing" };
  const rule = table[rollWeighted(state, table.map((e) => e.weight))]!;
  const event: ExpeditionEvent = { sector, kind: rule.kind };
  const rules = state.config.expedition;
  const living = () => ctx.crew.filter((p) => p.alive);
  const amount = rule.amount ?? 0;
  switch (rule.kind) {
    case "nothing":
      break;
    case "fatigue":
      hurt(ctx, event, new Map(living().map((p) => [p, rules.fatigue])));
      break;
    case "accident": {
      const all = living();
      hurt(ctx, event, new Map([[all[rollInt(state, all.length)]!, roll(state, rules.accident)]]));
      break;
    }
    case "catastrophe":
      hurt(ctx, event, new Map(living().map((p) => [p, roll(state, rules.catastrophe)])));
      break;
    case "oxygen": {
      const before = state.ship.oxygen;
      state.ship.oxygen = Math.min(shipMax(state.config).oxygen, before + amount);
      event.amount = state.ship.oxygen - before;
      break;
    }
    case "fuel": {
      const before = state.ship.fuel;
      state.ship.fuel = Math.min(shipMax(state.config).fuel, before + amount);
      event.amount = state.ship.fuel - before;
      break;
    }
    case "harvest": {
      const bonus = living().some((p) => hasSkill(p, "botanic")) ? rules.botanistBonus : 0;
      event.item = rules.loot.harvest;
      event.amount = drop(state, event.item, amount + bonus);
      break;
    }
    case "provision":
      event.item = rules.loot.provision;
      event.amount = drop(state, event.item, amount);
      break;
    case "artifact":
      event.item = rules.loot.artifact;
      event.amount = drop(state, event.item, amount);
      break;
    case "fight":
      fight(ctx, event, amount);
      break;
  }
  return event;
}

/**
 * A fight against a creature of `strength`. The crew's strength is 1 per living member plus each carried weapon's
 * `expoStrength`; a gun counts only with a charge left. Grenades (`consumed` weapons) are used up one at a time while
 * the crew is still weaker (eMush's Fight). A loss deals the difference as HP, each point to a random living member.
 */
function fight(ctx: Ctx, event: ExpeditionEvent, strength: number): void {
  const { state } = ctx;
  const weapons = state.config.weapons.types;
  const members = ctx.crew.filter((p) => p.alive);
  const gear = members.flatMap((p) => itemsIn(state, { kind: "player", id: p.id })).filter((i) => weapons[i.type] !== undefined && isWorking(i));
  const grenades = gear.filter((i) => weapons[i.type]!.consumed);
  let crew = members.length;
  for (const item of gear) if (!weapons[item.type]!.consumed && usable(state, item)) crew += weapons[item.type]!.expoStrength;
  let used = 0;
  for (const grenade of grenades) {
    if (crew >= strength) break;
    crew += weapons[grenade.type]!.expoStrength;
    removeItem(state, grenade.id);
    used++;
  }
  const won = crew >= strength;
  event.amount = strength;
  event.fight = { strength: crew, grenades: used, won };
  if (won) return;
  const hits = new Map<PlayerState, number>();
  for (let i = 0; i < strength - crew; i++) {
    const p = members[rollInt(state, members.length)]!;
    hits.set(p, (hits.get(p) ?? 0) + 1);
  }
  hurt(ctx, event, new Map([...hits].sort(([a], [b]) => members.indexOf(a) - members.indexOf(b))));
}

/** A weapon counts in a fight when it needs no charges or has one left. */
const usable = (state: Readonly<GameState>, item: Readonly<ItemState>): boolean =>
  state.config.weapons.types[item.type]!.charges === undefined || (item.charges ?? 0) > 0;

/**
 * Damage to members, each taking theirs as one hit, less `survivalReduction` with the Survival skill. Notes it on the
 * event. A member who dies leaves a body in the Icarus, which comes back with it (death.ts); without `deadKeepItems`,
 * what they set out with is lost (the items `killPlayer` dropped on the floor are taken away).
 */
function hurt(ctx: Ctx, event: ExpeditionEvent, amounts: Map<PlayerState, number>): void {
  const { state } = ctx;
  const rules = state.config.expedition;
  for (const [p, amount] of amounts) {
    const hp = Math.max(0, amount - (hasSkill(p, "survival") ? rules.survivalReduction : 0));
    (event.hurt ??= []).push({ name: p.character, hp });
    damage(state, p, hp);
    if (p.alive) continue;
    (event.died ??= []).push(p.character);
    if (!rules.deadKeepItems) {
      const lost = new Set(ctx.carried[p.id] ?? []);
      state.items = state.items.filter((i) => !lost.has(i.id));
    }
  }
}

/** `count` items of `type` on the floor of the Icarus, which unloads them in the bay on its return. Returns how many. */
function drop(state: GameState, type: string, count: number): number {
  for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type, at: { kind: "room", id: state.config.expedition.craft } });
  return count;
}
