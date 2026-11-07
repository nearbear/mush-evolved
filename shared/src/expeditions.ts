// Expeditions, phase 1 (owner, 2026-10-31; docs/plans/expedition.md). A Pilot in the Icarus Bay takes off while the ship
// orbits a planet with unexplored sectors; everyone living in the bay goes, up to `maxCrew`. Everything resolves at
// takeoff: a landing event, then up to `sectors` unexplored sectors drawn by their tag's `explo` weight, each with an
// event from its table. The crew is back in the bay at once, with the loot on its floor and a report only they see.
// Pure: every draw goes through the seeded RNG in state. The action is actions/icarus_takeoff.ts.

import { damage } from "./death.ts";
import { isWorking, itemsIn, newItemId, removeItem } from "./items.ts";
import { logPrivate, logPublic } from "./log.ts";
import { isTraveling } from "./navigation.ts";
import { canFly } from "./patrol.ts";
import { PLANET_TAGS, type PlanetTag } from "./planets.ts";
import { roll, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
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
  return Object.values(state.planets)
    .flat()
    .find((p) => p.id === id);
}

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
 * Runs an expedition to the orbited planet from `launcher`'s room. The caller (the takeoff action) checked that it may
 * go. Mutates a cloned state: damage, deaths, the ship's oxygen and fuel, the loot, grenades used up, explored sectors,
 * the public takeoff line, the report, and each member's private line pointing at it.
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
  // Items each member carried when they set out, for `deadKeepItems: false`.
  const carried = new Map(crew.map((p) => [p.id, itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id)]));
  const ctx: Ctx = { state, crew, carried };

  const pilotAboard = crew.some((p) => canFly(p));
  const landing = rules.events[LANDING]!.filter((e) => !(pilotAboard && e.kind === "catastrophe"));
  report.events.push(resolve(ctx, LANDING, landing));

  for (const index of pickSectors(state, planet)) {
    if (!crew.some((p) => p.alive)) break;
    const sector = planet.sectors[index]!;
    sector.explored = true;
    report.events.push(resolve(ctx, sector.tag, rules.events[sector.tag] ?? []));
  }

  state.expeditions.push(report);
  for (const p of crew) logPrivate(state, p.id, "expeditionReturned", { planet: planet.name, report: report.id });
  return report;
}

interface Ctx {
  state: GameState;
  crew: PlayerState[];
  carried: Map<string, string[]>;
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
 * event. A member who dies comes back as a body in the bay (death.ts); without `deadKeepItems`, what they set out with
 * is lost (the items `killPlayer` dropped on the floor are taken away).
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
      const lost = new Set(ctx.carried.get(p.id) ?? []);
      state.items = state.items.filter((i) => !lost.has(i.id));
    }
  }
}

/** `count` items of `type` on the floor of the Icarus Bay. Returns how many. */
function drop(state: GameState, type: string, count: number): number {
  for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type, at: { kind: "room", id: state.config.expedition.room } });
  return count;
}
