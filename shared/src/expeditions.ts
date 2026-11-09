// Expeditions (docs/plans/expedition.md). Phase 1 (owner, 2026-10-31): a Pilot in the Icarus Bay takes off while the
// ship orbits a planet with unexplored sectors; everyone living in the bay goes, up to `maxCrew`. A landing event, then
// up to `sectors` unexplored sectors drawn by their tag's `explo` weight, each with an event from its table.
// Phase 2 (owner, 2026-11-07, #356): the crew is away over time, in the Icarus (`config.expedition.craft`, a room with
// no doors). The landing is the first step, `stepMs` after takeoff, then one sector per `stepMs`; the server's `tick`
// runs them (`nextDue`, queue.ts). Members see each event in their report as it happens. The crew is back in the bay
// as the last sector resolves, or at once when every member is dead, with whatever is in the Icarus (loot, bodies).
// Single player resolves it all at takeoff (`instantExpeditions`). If the ship jumps while the crew is out, they are
// stranded (`strandExpedition`): Magnetic return brings them back, or they die and the Icarus is lost for good.
// Phases 3 and 4, slice A (owner, 2026-11-08, #357): every tag's table, Again (the sector stays unexplored), Back,
// Lost item, Kill and Kill all, the Mush trap, starmaps, named creatures with a win roll and loot, random artifacts,
// Survival's extra steak, and a safe landing with a Pilot or the Antigrav propeller. Disease reads as Nothing until
// #214. Slice B: getting lost (the member stays on the planet, in a place of their own, and the planet gains a Lost
// sector), finding them again, and their death when the ship leaves; a Tracker cancels Found dead. A member "with the
// crew" is alive and in the Icarus (`withCrew`): the lost and the dead take no part in events. Slice C: gear. A
// planet with no Oxygen sector needs a spacesuit, checked at takeoff: members without one stay in the Icarus and don't
// explore (`explores`), and with nobody suited the expedition ends at once. The other gear changes which sectors are
// picked (`pickSectors`), which events can happen (`cancelled`, `eventWeight`) or what they do.
// Pure: every draw goes through the seeded RNG.
// The action is actions/icarus_takeoff.ts.

import { endPushToLeave } from "./actions/accommodate.ts";
import { board } from "./actions/takeoff.ts";
import { damage, killPlayer } from "./death.ts";
import { FAST_EXPEDITION_STEP_MS, fastExpeditions } from "./cheats.ts";
import { soil } from "./dirt.ts";
import { contaminate } from "./infection.ts";
import { CORPSE_ITEM, isWorking, itemsIn, newItemId, removeItem, sameContainer } from "./items.ts";
import { logPrivate, logPublic } from "./log.ts";
import { isTraveling } from "./navigation.ts";
import { canFly, isLostPlace, lostPlace } from "./patrol.ts";
import { PLANET_TAGS, type PlanetTag } from "./planets.ts";
import { projectDone } from "./projects.ts";
import { roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
import { shipMax } from "./ship.ts";
import { hasSkill } from "./skills.ts";
import type { CreatureLoot, ExpeditionEvent, ExpeditionEventRule, ExpeditionReport, GameState, ItemState, Planet, PlayerState } from "./types.ts";

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

/**
 * The sectors explored this time, by index, in order: up to `count` unexplored ones drawn by their tag's `explo`
 * weight, without repeats. A finder (echolocator, thermosensor) carried by a member who explores makes its tags
 * `factor` times as likely (owner, 2026-11-08, #357).
 */
export function pickSectors(state: GameState, planet: Readonly<Planet>, count = state.config.expedition.sectors): number[] {
  const left = planet.sectors.flatMap((s, i) => (s.explored ? [] : [i]));
  const finders = state.config.expedition.gear.finders.filter((f) => crewCarries(state, f.item));
  const weight = (tag: PlanetTag) => finders.reduce<number>((w, f) => (f.tags.includes(tag) ? w * f.factor : w), PLANET_TAGS[tag].explo);
  const picked: number[] = [];
  while (picked.length < count && left.length > 0) {
    const i = rollWeighted(
      state,
      left.map((index) => weight(planet.sectors[index]!.tag)),
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
  // A planet with no Oxygen sector, revealed or not: members without a working spacesuit stay in the Icarus (owner,
  // 2026-11-08, #357), checked once, here.
  const suitless = needsSpacesuit(planet) ? crew.filter((p) => !carries(state, p, rules.gear.spacesuit)) : [];
  state.expedition = {
    report: report.id,
    planet: planet.id,
    landed: false,
    sectors: [],
    nextAt: state.now + stepMs(state),
    // Items each member carried when they set out, for `deadKeepItems: false`.
    carried: Object.fromEntries(crew.map((p) => [p.id, itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id)])),
    suitless: suitless.map((p) => p.id),
  };
  for (const p of suitless) report.events.push({ sector: LANDING, kind: "noSpacesuit", who: p.character });
  // Nobody can go out: the expedition ends at once, the AP spent (owner, 2026-11-08).
  if (suitless.length === crew.length) {
    report.events.push({ sector: LANDING, kind: "grounded" });
    returnExpedition(state, false);
    return report;
  }
  // Drawn once the explorers are known, as their gear changes the odds.
  state.expedition.sectors = pickSectors(state, planet);
  if (state.config.instantExpeditions) while (state.expedition) expeditionStep(state);
  return report;
}

/** Whether exploring the planet needs a spacesuit: it has no Oxygen sector, revealed or not (owner, 2026-11-08). */
export const needsSpacesuit = (planet: Readonly<Planet>): boolean => !planet.sectors.some((s) => s.tag === "OXYGEN");

/**
 * The next step of the expedition under way: the landing, or the next sector (marked explored). Then the crew comes
 * back if that was the last one or nobody is left alive; otherwise the next step is `stepMs` later. Mutates a cloned
 * state; the caller checked there is one.
 */
export function expeditionStep(state: GameState): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  const members = () => report.members.map((id) => state.players.find((p) => p.id === id)!);
  const planet = planetById(state, away.planet);
  const ctx: Ctx = { state, crew: members(), carried: away.carried, report, planet, redraw: false };
  if (!away.landed) {
    away.landed = true;
    // A safe landing (owner, 2026-11-08): a living Pilot aboard or the Antigrav propeller.
    // The Pilot flies the Icarus, so one without a spacesuit still lands it.
    const safe = ctx.crew.some((p) => withCrew(state, p) && canFly(p)) || projectDone(state, "ICARUS_ANTIGRAV_PROPELLER");
    report.events.push(resolve(ctx, LANDING, safe ? [] : rules.events[LANDING]!));
  } else if (planet) {
    const sector = planet.sectors[away.sectors.shift()!]!;
    const event = resolve(ctx, sector.tag, rules.events[sector.tag] ?? []);
    report.events.push(event);
    // Again: the step is used but the sector isn't explored, so a later expedition can draw it.
    if (event.kind !== "again") sector.explored = true;
    // Back: the crew heads home at once with what it found.
    if (event.kind === "back") away.sectors = [];
    // Someone got lost: the planet has a new Lost sector, so the steps left are drawn again with it in the running
    // (drawing in turn without repeats, as at takeoff, so the odds are those of a draw at each step).
    else if (ctx.redraw) away.sectors = pickSectors(state, planet, away.sectors.length);
  } else {
    // The planet is gone (only possible once the ship has left it): nothing left to explore.
    away.sectors = [];
  }
  // Back when the sectors are done, or nobody is left exploring (all dead, lost, or without a spacesuit).
  if (away.sectors.length === 0 || !members().some((p) => explores(state, p))) returnExpedition(state);
  // The fast cheat counts from now, so a step that was due long ago doesn't set off a burst of overdue ones.
  else away.nextAt = fastExpeditions(state) ? Math.max(away.nextAt, state.now) + FAST_EXPEDITION_STEP_MS : away.nextAt + rules.stepMs;
}

/**
 * The crew is back: the living into the bay, and everything in the Icarus (loot, bodies, what members dropped) onto
 * the bay's floor. Each living member may come back dirty (`dirtyChance`). Each member gets a private line pointing at
 * the report; nothing public (owner, 2026-10-31). Mutates a cloned state.
 */
function returnExpedition(state: GameState, landed = true): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  state.expedition = null;
  for (const item of state.items) if (sameContainer(item.at, { kind: "room", id: rules.craft })) item.at = { kind: "room", id: rules.room };
  for (const id of report.members) {
    const p = state.players.find((q) => q.id === id)!;
    if (p.alive && p.room === rules.craft) {
      board(p, rules.room);
      // A crew that never left (nobody had a spacesuit) stays clean.
      if (landed && rollFloat(state) < rules.dirtyChance) soil(state, p);
    }
    // A lost member isn't back: they stay on the planet (owner, 2026-11-08).
    if (!(p.alive && isLostPlace(p.room))) logPrivate(state, p.id, "expeditionReturned", { planet: report.planet, report: report.id });
  }
}

/**
 * The Daedalus jumped (travel or leaving orbit) while a crew is out (owner, 2026-11-07, #356). With Magnetic return
 * (`AUTO_RETURN_ICARUS`) the crew is back at once, the sectors left skipped, as on a normal return; NERON says so to
 * everyone. Without it the living members die, the Icarus is lost with everything in it (items, loot, bodies), and no
 * expedition can take off again (`icarusLost`); NERON tells everyone. Mutates a cloned state; nothing if none is out.
 */
export function strandExpedition(state: GameState): void {
  strandCrew(state);
  abandonLost(state);
}

function strandCrew(state: GameState): void {
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

/**
 * The ship left the planet: everyone lost on it dies there, Magnetic return or not (owner, 2026-11-08, #357), and
 * whatever is in their places (their items, their bodies) is gone with the planet. Mutates a cloned state.
 */
function abandonLost(state: GameState): void {
  for (const p of lostPlayers(state)) killPlayer(state, p);
  state.items = state.items.filter((i) => !(i.at.kind === "room" && isLostPlace(i.at.id)));
}

/** Everyone alive and lost on a planet, in seat order. They are all on the planet the ship orbits: leaving it kills them. */
export const lostPlayers = (state: Readonly<GameState>): PlayerState[] => state.players.filter((p) => p.alive && isLostPlace(p.room));

/** Whether a member is still with the crew: alive and in the Icarus, not lost on the planet. */
export const withCrew = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean => p.alive && p.room === state.config.expedition.craft;

/**
 * Whether a member explores: still with the crew and not left in the Icarus for want of a spacesuit. Only they take
 * part in events, and only their items count (owner, 2026-11-08, #357).
 */
export const explores = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean =>
  withCrew(state, p) && !(state.expedition?.suitless.includes(p.id) ?? false);

/** Whether the player carries a working copy of this item type. */
const carries = (state: Readonly<GameState>, p: Readonly<PlayerState>, type: string): boolean =>
  itemsIn(state, { kind: "player", id: p.id }).some((i) => i.type === type && isWorking(i));

/** Whether a member who explores the expedition under way carries a working copy of this item type. */
const crewCarries = (state: Readonly<GameState>, type: string): boolean => {
  const away = state.expedition;
  if (!away) return false;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  return report.members.some((id) => {
    const p = state.players.find((q) => q.id === id)!;
    return explores(state, p) && carries(state, p, type);
  });
};

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
  /** Every member, as the step began (the dead, the lost and the suitless included: filter with `explores`). */
  crew: PlayerState[];
  carried: Record<string, string[]>;
  report: ExpeditionReport;
  planet: Planet | undefined;
  /** Set when the planet gained a sector, so the steps left are drawn again once this one is explored. */
  redraw: boolean;
}

/** Draws and applies one sector's event. An empty table is a sector where nothing happens. */
function resolve(ctx: Ctx, sector: PlanetTag | typeof LANDING, table: readonly ExpeditionEventRule[]): ExpeditionEvent {
  const { state } = ctx;
  // A cancelled event can't be drawn: the sector rolls among its others, or is Nothing if none is left (owner, 2026-11-08).
  const weights = table.map((e) => (cancelled(ctx, sector, e) ? 0 : eventWeight(ctx, sector, e)));
  if (weights.every((w) => w === 0)) return { sector, kind: "nothing" };
  const rule = table[rollWeighted(state, weights)]!;
  // Not built yet: Disease (#214) reads as Nothing.
  const kind = rule.kind === "disease" ? "nothing" : rule.kind;
  const event: ExpeditionEvent = { sector, kind };
  const rules = state.config.expedition;
  const living = () => ctx.crew.filter((p) => explores(state, p));
  const amount = rule.amount ?? 0;
  switch (kind) {
    case "nothing":
    case "again":
    case "back":
      break;
    case "fatigue":
      hurt(ctx, event, new Map(living().map((p) => [p, rules.fatigue])));
      break;
    case "accident": {
      const all = living();
      const victim = all[rollInt(state, all.length)]!;
      const hp = roll(state, rules.accident);
      // A rope spares its bearer in some sectors: the Accident happens, with no effect (owner, 2026-11-08).
      const { rope } = rules.gear;
      if (rope.tags.includes(sector) && carries(state, victim, rope.item)) event.avoided = { name: victim.character, item: rope.item };
      else hurt(ctx, event, new Map([[victim, hp]]));
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
      const { drill } = rules.gear;
      const found = crewCarries(state, drill.item) ? amount * drill.fuelFactor : amount;
      state.ship.fuel = Math.min(shipMax(state.config).fuel, before + found);
      event.amount = state.ship.fuel - before;
      break;
    }
    case "harvest": {
      const bonus = living().some((p) => hasSkill(p, "botanic")) ? rules.botanistBonus : 0;
      event.item = rules.loot.harvest;
      event.amount = drop(state, event.item, amount + bonus);
      break;
    }
    case "provision": {
      // Survival: one more steak per living holder (owner, 2026-11-08).
      const bonus = living().filter((p) => hasSkill(p, "survival")).length * rules.survivalProvision;
      event.item = rules.loot.provision;
      event.amount = drop(state, event.item, amount + bonus);
      break;
    }
    case "artifact":
      event.item = artifact(state);
      event.amount = drop(state, event.item, 1);
      break;
    case "starmap":
      event.item = rules.loot.starmap;
      event.amount = drop(state, event.item, 1);
      break;
    case "fight":
      fight(ctx, event, rule.creature!);
      break;
    case "lostItem": {
      // One item carried by a member still with the crew, never a spacesuit, is destroyed.
      const carried = living()
        .flatMap((p) => itemsIn(state, { kind: "player", id: p.id }))
        .filter((i) => i.type !== rules.gear.spacesuit);
      if (carried.length === 0) {
        event.kind = "nothing";
        break;
      }
      event.item = removeItem(state, carried[rollInt(state, carried.length)]!.id).type;
      break;
    }
    case "kill": {
      // One member dies; Survival holders are picked last.
      const all = living();
      const exposed = all.filter((p) => !hasSkill(p, "survival"));
      const pool = exposed.length > 0 ? exposed : all;
      kill(ctx, event, [pool[rollInt(state, pool.length)]!]);
      break;
    }
    case "killAll":
      kill(ctx, event, living());
      break;
    case "mushTrap":
      // Each human member, independently, may gain a spore. Secret: the report only says the crew walked into a trap.
      for (const p of living()) if (p.role === "human" && rollFloat(state) < rules.mushTrapChance) contaminate(state, p);
      break;
    case "lost":
      // A compass bearer can't get lost (owner, 2026-11-08).
      getLost(ctx, event, living().filter((p) => !carries(state, p, rules.gear.compass)));
      break;
    case "found":
    case "foundDead":
      find(ctx, event);
      break;
  }
  return event;
}

/**
 * Whether an event is cancelled for this crew (owner, 2026-11-08, #357): a Tracker cancels Found dead; a compass
 * cancels Again, and Lost when every member who explores carries one; a white flag cancels Fight in its sector.
 */
function cancelled(ctx: Ctx, sector: string, rule: ExpeditionEventRule): boolean {
  const { state } = ctx;
  const { gear } = state.config.expedition;
  const explorers = ctx.crew.filter((p) => explores(state, p));
  switch (rule.kind) {
    case "foundDead":
      return explorers.some((p) => hasSkill(p, "hunt"));
    case "again":
      return crewCarries(state, gear.compass);
    case "lost":
      return explorers.length > 0 && explorers.every((p) => carries(state, p, gear.compass));
    case "fight":
      return sector === gear.whiteFlag.tag && crewCarries(state, gear.whiteFlag.item);
    default:
      return false;
  }
}

/** An event's weight for this crew: the Babel module makes Artifact more likely in its sector (owner, 2026-11-08). */
function eventWeight(ctx: Ctx, sector: string, rule: ExpeditionEventRule): number {
  const { babel } = ctx.state.config.expedition.gear;
  return rule.kind === "artifact" && sector === babel.tag && crewCarries(ctx.state, babel.item) ? rule.weight * babel.artifactFactor : rule.weight;
}

/**
 * Lost (owner, 2026-11-08, #357): one member still with the crew, picked at random, stays on the planet in a place of
 * their own (`lostPlace`), and the planet gains a revealed Lost sector. Their report stops at this line. NERON names
 * them and the planet to everyone (an accepted leak, phase 2). With nobody to lose, Nothing.
 */
function getLost(ctx: Ctx, event: ExpeditionEvent, pool: PlayerState[]): void {
  const { state, report, planet } = ctx;
  if (pool.length === 0 || !planet) {
    event.kind = "nothing";
    return;
  }
  const p = pool[rollInt(state, pool.length)]!;
  event.who = p.character;
  board(p, lostPlace(p.id));
  (report.lostAt ??= {})[p.id] = report.events.length + 1;
  planet.sectors.push({ tag: "LOST", known: true });
  ctx.redraw = true;
  logPublic(state, undefined, "crewLost", { name: p.character, planet: planet.name }, "warning");
}

/**
 * Found and Found dead (owner, 2026-11-08, #357): one of those lost on the planet, at random. Found, they join this
 * crew (over `maxCrew` if need be) with whatever they left on the ground, and come back with it; a member found by
 * their own expedition sees its whole report again. Found dead, they die where they are and the crew brings back the
 * body (and their things, unless `deadKeepItems` is off). Nobody lost: Nothing.
 */
function find(ctx: Ctx, event: ExpeditionEvent): void {
  const { state, report } = ctx;
  const craft = state.config.expedition.craft;
  const lost = lostPlayers(state);
  if (lost.length === 0) {
    event.kind = "nothing";
    return;
  }
  const p = lost[rollInt(state, lost.length)]!;
  const place = p.room;
  event.who = p.character;
  // Through `damage`, as Kill, so the dev infiniteHp cheat survives it (and is then found alive).
  if (event.kind === "foundDead") damage(state, p, p.hp);
  const left = (i: ItemState) => i.at.kind === "room" && i.at.id === place;
  if (!p.alive && !state.config.expedition.deadKeepItems) state.items = state.items.filter((i) => !left(i) || i.type === CORPSE_ITEM);
  for (const item of state.items) if (left(item)) item.at = { kind: "room", id: craft };
  if (!p.alive) return;
  board(p, craft);
  if (!report.members.includes(p.id)) {
    report.members.push(p.id);
    report.crew.push(p.character);
  }
  if (report.lostAt) delete report.lostAt[p.id];
  ctx.carried[p.id] = itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id);
}

/** An artifact picked uniformly among the original's 9. */
const artifact = (state: GameState): string => {
  const list = state.config.expedition.loot.artifacts;
  return list[rollInt(state, list.length)]!;
};

/**
 * A fight against a creature (owner, 2026-11-08, #357). The crew's strength is 1 per living member plus each carried
 * weapon's `expoStrength`; a gun counts only with a charge left. Grenades (`consumed` weapons) are used up one at a
 * time while the crew is still weaker (eMush's Fight). The crew wins with a chance of 0 below half the creature's
 * strength (rounded down), then (crew − half + 1) / (creature − half + 1), capped at 1; a win brings the creature's
 * loot. Win or lose, the shortfall against the crew's strength with every grenade counted, spent or not, is dealt as
 * HP, each point to a random living member.
 */
function fight(ctx: Ctx, event: ExpeditionEvent, creature: string): void {
  const { state } = ctx;
  const foe = state.config.expedition.creatures[creature]!;
  const strength = foe.strength.length === 1 ? foe.strength[0]! : foe.strength[rollInt(state, foe.strength.length)]!;
  const weapons = state.config.weapons.types;
  const members = ctx.crew.filter((p) => explores(state, p));
  const gear = members.flatMap((p) => itemsIn(state, { kind: "player", id: p.id })).filter((i) => weapons[i.type] !== undefined && isWorking(i));
  const grenades = gear.filter((i) => weapons[i.type]!.consumed);
  let crew = members.length;
  for (const item of gear) if (!weapons[item.type]!.consumed && usable(state, item)) crew += weapons[item.type]!.expoStrength;
  const withAllGrenades = crew + grenades.reduce((sum, g) => sum + weapons[g.type]!.expoStrength, 0);
  let used = 0;
  for (const grenade of grenades) {
    if (crew >= strength) break;
    crew += weapons[grenade.type]!.expoStrength;
    removeItem(state, grenade.id);
    used++;
  }
  const chance = winChance(crew, strength);
  const won = chance >= 1 || (chance > 0 && rollFloat(state) < chance);
  event.creature = creature;
  event.amount = strength;
  event.fight = { strength: crew, grenades: used, won };
  if (won) event.found = fightLoot(state, foe.loot);
  const hits = new Map<PlayerState, number>();
  for (let i = 0; i < strength - withAllGrenades; i++) {
    const p = members[rollInt(state, members.length)]!;
    hits.set(p, (hits.get(p) ?? 0) + 1);
  }
  if (hits.size > 0) hurt(ctx, event, new Map([...hits].sort(([a], [b]) => members.indexOf(a) - members.indexOf(b))));
}

/** The chance a crew of `crew` strength beats a creature of `strength` (owner, 2026-11-08; eMushpedia's `Combat`). */
export function winChance(crew: number, strength: number): number {
  const half = Math.floor(strength / 2);
  if (crew < half) return 0;
  return Math.min(1, (crew - half + 1) / (strength - half + 1));
}

/** A won fight's loot onto the Icarus's floor, grouped by item type. */
function fightLoot(state: GameState, loot: Readonly<CreatureLoot>): { item: string; count: number }[] {
  const rules = state.config.expedition;
  const found = new Map<string, number>();
  const add = (item: string) => found.set(item, (found.get(item) ?? 0) + drop(state, item, 1));
  for (let i = 0; i < (loot.provision ?? 0); i++) add(rules.loot.provision);
  for (let i = 0; i < (loot.artifact ?? 0); i++) add(artifact(state));
  for (let i = 0; i < (loot.starmap ?? 0); i++) add(rules.loot.starmap);
  return [...found].map(([item, count]) => ({ item, count }));
}

/** Kill and Kill all: these members die outright (Survival doesn't help), under the expedition's death rules. */
function kill(ctx: Ctx, event: ExpeditionEvent, members: PlayerState[]): void {
  for (const p of members) {
    damage(ctx.state, p, p.hp);
    if (!p.alive) died(ctx, event, p);
  }
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
    if (!p.alive) died(ctx, event, p);
  }
}

/** Notes a death on the event; without `deadKeepItems`, what they set out with is lost (dropped by `killPlayer`, then taken away). */
function died(ctx: Ctx, event: ExpeditionEvent, p: PlayerState): void {
  (event.died ??= []).push(p.character);
  if (ctx.state.config.expedition.deadKeepItems) return;
  const lost = new Set(ctx.carried[p.id] ?? []);
  ctx.state.items = ctx.state.items.filter((i) => !lost.has(i.id));
}

/** `count` items of `type` on the floor of the Icarus, which unloads them in the bay on its return. Returns how many. */
function drop(state: GameState, type: string, count: number): number {
  for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type, at: { kind: "room", id: state.config.expedition.craft } });
  return count;
}
