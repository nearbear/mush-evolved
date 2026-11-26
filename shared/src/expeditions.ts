// Expeditions (docs/plans/archive/expedition.md). Phase 1 (owner, 2026-10-31): a Pilot in the Icarus Bay takes off while the
// ship orbits a planet with unexplored sectors; everyone living in the bay goes, up to `maxCrew`. A landing event, then
// up to `sectors` unexplored sectors drawn by their tag's `explo` weight, each with an event from its table.
// Phase 2 (owner, 2026-11-07, #356): the crew is away over time, in the Icarus (`config.expedition.craft`, a room with
// no doors). The landing happens at takeoff (owner, 2026-11-17), then one sector per `stepMs`; the server's `tick`
// runs them (`nextDue`, queue.ts). Members see each event in their report as it happens. The crew is back in the bay
// as the last sector resolves, or at once when every member is dead, with whatever is in the Icarus (loot, bodies).
// Single player resolves it all at takeoff (`instantExpeditions`). If the ship jumps while the crew is out, they are
// stranded (`strandExpedition`): Magnetic return brings them back, or they die and the Icarus is lost for good.
// Phases 3 and 4, slice A (owner, 2026-11-08, #357): every tag's table, Again (the sector stays unexplored), Back,
// Lost item, Kill and Kill all, the Mush trap, starmaps, named creatures with a win roll and loot, random artifacts,
// Survival's extra steak, and a safe landing with a Pilot or the Antigrav propeller. Disease (owner, 2026-11-21): one
// member falls ill (`sicken`). Slice B: getting lost (the member stays on the planet, in a place of their own, and the planet gains a Lost
// sector), finding them again, and their death when the ship leaves; a Tracker cancels Found dead. A member "with the
// crew" is alive and in the Icarus (`withCrew`): the lost and the dead take no part in events. Slice C: gear. A
// planet with no Oxygen sector needs a spacesuit (boarding, below). The other gear changes which sectors are
// picked (`pickSectors`), which events can happen (`cancelled`, `eventWeight`) or what they do. Phase 4, slice D
// (#358): skills. Diplomat and Polymath cancel Fight in Intelligent life; Polymath also harvests as a Botanist; Shooter
// and Centauri add strength (`fight`); each Sprinter adds a sector; a U-turn holder ends the expedition (`turnBack`);
// a Traitor's secret Sabotage (`sabotage`) leaves only negative events in the next sector; holders of either see
// the next sector (`nextSectorFor`).
// Phase 5 (owner, 2026-11-09, #359): the hold extension raises the crew cap (`maxCrew`), and a pilot flying a patrol
// ship lands on the orbited planet alone (actions/land_on_planet.ts): an expedition like the Icarus's, half as long,
// whose craft is the ship's room (`expeditionCraft`). One expedition at a time. The ship sits on the planet
// (`PatrolShip.onPlanet`, out of the hunters' reach) and docks in its bay at the end; it stays there while its pilot is
// lost, and is lost for good if they die first (death.ts).
// Boarding (owner, 2026-11-17): the crew boards the docked Icarus one by one (actions/board_icarus.ts, a free action;
// `boardRefusal`), only with a spacesuit unless the planet has an Oxygen sector, up to `maxCrew`; anyone aboard who can
// fly launches from inside (actions/icarus_takeoff.ts), and the landing happens at once. Anyone whose suit stopped
// working since boarding is put off at takeoff. Leaving orbit puts everyone aboard off (`disembarkAll`).
// Boarded crew stay in the bay (owner, 2026-11-21, #469: `boardedIcarus`, `isAboard`) until takeoff moves them into the
// craft, so they can still be reached; a public aggressive action on one puts them off (`knockOffIcarus`).
// Pure: every draw goes through the seeded RNG.
// The actions are actions/board_icarus.ts, actions/leave_icarus.ts, actions/icarus_takeoff.ts and
// actions/land_on_planet.ts.

import { endPushToLeave } from "./actions/accommodate.ts";
import { EXPLORED, ICARUS_LOST, TRAVEL_UNDERWAY } from "./actions/action.ts";
import { dock } from "./actions/land.ts";
import { board } from "./actions/takeoff.ts";
import { damage, killPlayer, type DeathCause } from "./death.ts";
import { FAST_EXPEDITION_STEP_MS, fastExpeditions } from "./cheats.ts";
import { soil } from "./dirt.ts";
import { rebelContacted } from "./comms.ts";
import { contaminate } from "./infection.ts";
import { addDisease } from "./diseases.ts";
import { CORPSE_ITEM, type ItemTypeId } from "./itemIds.ts";
import { afterArmor } from "./armor.ts";
import { isWorking, itemsIn, removeItem, sameContainer, spawnInRoom } from "./items.ts";
import { logPrivate, logPublic } from "./log.ts";
import { isTraveling } from "./navigation.ts";
import { retargetNow } from "./hunters.ts";
import { canFly, canTakeoff, isLostPlace, lostPlace, PATROL_SHIPS, patrolShip, type PatrolShip } from "./patrol.ts";
import { PLANET_TAGS, type PlanetTag } from "./planets.ts";
import { projectDone } from "./projects.ts";
import { itemLost } from "./modifiers.ts";
import { roll, rollFloat, rollInt, rollWeighted } from "./rng.ts";
import { shipMax } from "./ship.ts";
import { hasSkill } from "./skills.ts";
import type { CreatureLoot, ExpeditionEvent, ExpeditionEventRule, ExpeditionReport, GameState, ItemState, Planet, PlayerState, RoomId } from "./types.ts";

/** The landing's event table key: drawn before any sector. */
export const LANDING = "LANDING";

/**
 * Who may launch the Icarus (owner, 2026-11-15, 2026-11-21): anyone who can take off (not grounded, and either a Pilot,
 * `freeHacking`, or the BIOS crew lock is off piloting).
 */
export const canLaunchExpedition = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean => canTakeoff(state, player);

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

/** How many the Icarus holds: `largerBayCrew` once the hold extension is done (owner, 2026-11-09, #359). */
export const maxCrew = (state: Readonly<GameState>): number =>
  projectDone(state, "ICARUS_LARGER_BAY") ? state.config.expedition.largerBayCrew : state.config.expedition.maxCrew;

/**
 * Who is aboard the docked Icarus (owner, 2026-11-17): the living who boarded it (actions/board_icarus.ts) while no
 * Icarus expedition is away. They stay in the Icarus Bay, boarded, until takeoff moves them into the craft (#469), and
 * are the crew of its next takeoff.
 */
export const aboardIcarus = (state: Readonly<GameState>): PlayerState[] => (icarusDocked(state) ? state.players.filter((p) => isAboard(state, p)) : []);

/** Whether this player is aboard the docked Icarus: boarded, alive and in the Icarus Bay (#469). */
export const isAboard = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean =>
  p.alive && p.boardedIcarus === true && p.room === state.config.expedition.room && icarusDocked(state);

/** Whether the Icarus is in its bay: not away on an expedition, and not lost. */
export const icarusDocked = (state: Readonly<GameState>): boolean => !state.icarusLost && !(state.expedition !== null && state.expedition.ship === null);

/**
 * Why this player can't board the docked Icarus now, or null (owner, 2026-11-17): alive in the Icarus Bay, the Icarus
 * docked, the ship orbiting a planet with an unexplored sector, room aboard (`maxCrew`), and a working spacesuit unless
 * the planet has an Oxygen sector, so nobody forgets theirs.
 */
export function boardRefusal(state: Readonly<GameState>, p: Readonly<PlayerState>): string | null {
  if (!p.alive) return "dead";
  if (p.room !== state.config.expedition.room) return "not_in_bay";
  if (p.boardedIcarus) return "already_aboard";
  if (!icarusDocked(state)) return state.icarusLost ? ICARUS_LOST : "icarus_away";
  const planet = orbitedPlanet(state);
  if (!planet) return "not_in_orbit";
  if (state.launched !== null) return TRAVEL_UNDERWAY;
  if (!hasUnexplored(planet)) return EXPLORED;
  if (aboardIcarus(state).length >= maxCrew(state)) return "icarus_full";
  if (needsSpacesuit(planet) && !hasSpacesuit(state, p)) return "no_spacesuit";
  return null;
}

/**
 * Off the docked Icarus (owner, 2026-11-17): the player, who never left the bay (#469), is no longer boarded, with a
 * public line in the bay unless `quiet`. Mutates a cloned state.
 */
export function leaveIcarus(state: GameState, p: PlayerState, quiet = false): void {
  delete p.boardedIcarus;
  if (!quiet) logPublic(state, state.config.expedition.room, "icarusLeft", { name: p.character });
}

/**
 * An aggressive action seen by the bay hit someone aboard the docked Icarus (owner, 2026-11-21, #469): they are put off
 * it, as being punched gets you out of bed, with a public line in the bay. Mutates a cloned state.
 */
export function knockOffIcarus(state: GameState, p: PlayerState): void {
  if (!p.boardedIcarus) return;
  delete p.boardedIcarus;
  if (p.alive) logPublic(state, state.config.expedition.room, "icarusKnockedOff", { name: p.character });
}

/** The ship left the planet (owner, 2026-11-17): everyone aboard the docked Icarus is back in the bay, each told why. */
function disembarkAll(state: GameState): void {
  for (const p of aboardIcarus(state)) {
    leaveIcarus(state, p, true);
    logPrivate(state, p.id, "icarusDisembarked", {});
  }
}

/** Where the crew of the expedition under way is: the patrol ship that landed, or the Icarus. */
export const expeditionCraft = (state: Readonly<GameState>): RoomId => state.expedition?.ship ?? state.config.expedition.craft;

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
 *
 * With `ship`, the launcher is a pilot landing that patrol ship alone (owner, 2026-11-09, #359): they stay in its room,
 * the ship is on the planet from now on, hunters aiming at it pick another target at once, and the Icarus's sector
 * count is divided by `patrol.sectorDivisor`, rounded down.
 */
export function runExpedition(state: GameState, launcher: PlayerState, ship?: PatrolShip): ExpeditionReport {
  const planet = orbitedPlanet(state)!;
  const rules = state.config.expedition;
  // The Icarus takes whoever boarded it (owner, 2026-11-17), the launcher first. A planet with no Oxygen sector: anyone
  // aboard whose spacesuit stopped working since they boarded (green jelly, say) is put off in the bay, told why. The
  // launcher was checked to have one (actions/icarus_takeoff.ts).
  if (!ship && needsSpacesuit(planet)) {
    for (const p of aboardIcarus(state)) {
      if (hasSpacesuit(state, p)) continue;
      leaveIcarus(state, p, true);
      logPrivate(state, p.id, "icarusNoSpacesuit", { planet: planet.name });
    }
  }
  const crew = ship ? [launcher] : [launcher, ...aboardIcarus(state).filter((p) => p.id !== launcher.id)];
  if (ship) {
    logPublic(state, launcher.room, "patrolPlanetLanding", { name: launcher.character, room: ship.id, planet: planet.name });
    state.patrolShips[ship.id]!.onPlanet = launcher.id;
    retargetNow(state, ship);
  } else {
    logPublic(state, rules.room, "icarusTakeoff", { name: launcher.character, planet: planet.name });
    // The boarded crew waited in the bay (#469); now they are in the Icarus.
    for (const p of crew) board(state, p, rules.craft);
  }

  const report: ExpeditionReport = {
    id: `expedition-${state.nextExpeditionId++}`,
    members: crew.map((p) => p.id),
    crew: crew.map((p) => p.character),
    planet: planet.name,
    events: [],
    ...(ship && { ship: ship.id }),
  };
  state.expeditions.push(report);
  for (const p of crew) endPushToLeave(state, p);
  state.expedition = {
    report: report.id,
    planet: planet.id,
    sectors: [],
    nextAt: state.now + stepMs(state),
    // Items each member carried when they set out, for `deadKeepItems: false`.
    carried: Object.fromEntries(crew.map((p) => [p.id, itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id)])),
    sabotaged: false,
    sabotageNext: false,
    hp: {},
    ship: ship?.id ?? null,
  };
  // Drawn at takeoff, as the crew's gear changes the odds. Each Sprinter adds a sector (owner, 2026-11-08, #358).
  const sprinters = crew.filter((p) => hasSkill(p, "sprint")).length;
  const sectors = rules.sectors + sprinters * rules.sprinterSectors;
  state.expedition.sectors = pickSectors(state, planet, ship ? Math.floor(sectors / rules.patrol.sectorDivisor) : sectors);
  // The landing happens at once (owner, 2026-11-17); the first sector a step later.
  land(state, report, crew);
  snapshotHp(state, report);
  if (state.expedition.sectors.length === 0 || !crew.some((p) => withCrew(state, p))) returnExpedition(state);
  else if (state.config.instantExpeditions) while (state.expedition) expeditionStep(state);
  return report;
}

/**
 * The landing: its event, drawn from the LANDING table, or Nothing when it is safe (owner, 2026-11-08, 2026-11-15): an
 * ungrounded living Pilot aboard, or the Antigrav propeller (Icarus only).
 */
function land(state: GameState, report: ExpeditionReport, crew: PlayerState[]): void {
  const away = state.expedition!;
  const ctx: Ctx = { state, crew, carried: away.carried, report, planet: planetById(state, away.planet), redraw: false };
  const safe = crew.some((p) => withCrew(state, p) && canFly(p) && hasSkill(p, "pilot")) || (away.ship === null && projectDone(state, "ICARUS_ANTIGRAV_PROPELLER"));
  report.events.push(resolve(ctx, LANDING, safe ? [] : state.config.expedition.events[LANDING]!));
}

/** Whether exploring the planet needs a spacesuit: it has no Oxygen sector, revealed or not (owner, 2026-11-08). */
export const needsSpacesuit = (planet: Readonly<Planet>): boolean => !planet.sectors.some((s) => s.tag === "OXYGEN");

/** Whether the player carries a working spacesuit. */
export const hasSpacesuit = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean => carries(state, p, state.config.expedition.gear.spacesuit);

/**
 * The next sector of the expedition under way (marked explored). Then the crew comes back if that was the last one or
 * nobody is left with the crew; otherwise the next step is `stepMs` later. Mutates a cloned state; the caller checked
 * there is one.
 */
export function expeditionStep(state: GameState): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  const members = () => report.members.map((id) => state.players.find((p) => p.id === id)!);
  const planet = planetById(state, away.planet);
  const ctx: Ctx = { state, crew: members(), carried: away.carried, report, planet, redraw: false };
  if (planet) {
    const sector = planet.sectors[away.sectors.shift()!]!;
    const event = resolve(ctx, sector.tag, rules.events[sector.tag] ?? []);
    // A Traitor's Sabotage covers this one sector (owner, 2026-11-17).
    away.sabotageNext = false;
    report.events.push(event);
    // Again: the step is used but the sector isn't explored, so a later expedition can draw it. The Superkube's planets
    // (kube.ts) never run out.
    if (event.kind !== "again" && !planet.inexhaustible) sector.explored = true;
    // Back: the crew heads home at once with what it found.
    if (event.kind === "back") away.sectors = [];
    // Someone got lost: the planet has a new Lost sector, so the steps left are drawn again with it in the running
    // (drawing in turn without repeats, as at takeoff, so the odds are those of a draw at each step).
    else if (ctx.redraw) away.sectors = pickSectors(state, planet, away.sectors.length);
  } else {
    // The planet is gone (only possible once the ship has left it): nothing left to explore.
    away.sectors = [];
  }
  snapshotHp(state, report);
  // Back when the sectors are done, or nobody is left with the crew (all dead or lost).
  if (away.sectors.length === 0 || !members().some((p) => withCrew(state, p))) returnExpedition(state);
  // The fast cheat counts from now, so a step that was due long ago doesn't set off a burst of overdue ones.
  else away.nextAt = fastExpeditions(state) ? Math.max(away.nextAt, state.now) + FAST_EXPEDITION_STEP_MS : away.nextAt + rules.stepMs;
}

/**
 * Each member's HP as the step leaves it, which is what the crew sees of each other until the next step (owner,
 * 2026-11-19): live HP would show losses between steps that only humans take (hunger, a disease at a cycle change).
 */
function snapshotHp(state: GameState, report: Readonly<ExpeditionReport>): void {
  state.expedition!.hp = Object.fromEntries(report.members.map((id) => [id, state.players.find((p) => p.id === id)!.hp]));
}

/**
 * The crew is back: the living into the bay, and everything in the Icarus (loot, bodies) onto the bay's floor. Each
 * living member may come back dirty (`dirtyChance`). Each member gets a private line pointing at the report; nothing
 * public (owner, 2026-10-31). Mutates a cloned state.
 *
 * A patrol ship (owner, 2026-11-09, #359) docks in its bay with its pilot and cargo, as a landing does (`dock`). A pilot
 * without a spacesuit never gets this far (actions/land_on_planet.ts); one whose pilot is lost stays on the planet; one
 * whose pilot died is already gone (death.ts).
 */
function returnExpedition(state: GameState): void {
  const away = state.expedition!;
  const rules = state.config.expedition;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  const craft = expeditionCraft(state);
  const ship = away.ship === null ? undefined : patrolShip(away.ship);
  state.expedition = null;
  if (ship) {
    const pilot = state.players.find((p) => p.id === report.members[0])!;
    if (pilot.alive && pilot.room === craft) {
      if (rollFloat(state) < rules.dirtyChance) soil(state, pilot, { superDirty: true });
      dock(state, pilot, ship);
    }
  } else {
    for (const item of state.items) if (sameContainer(item.at, { kind: "room", id: craft })) item.at = { kind: "room", id: rules.room };
  }
  for (const id of report.members) {
    const p = state.players.find((q) => q.id === id)!;
    if (!ship && p.alive && p.room === craft) {
      board(state, p, rules.room);
      // A ship with ICARUS_LAVATORY keeps its crew clean; otherwise the dirt gets past an apron or Stickler.
      if (!projectDone(state, "ICARUS_LAVATORY") && rollFloat(state) < rules.dirtyChance) soil(state, p, { superDirty: true });
    }
    // A lost member isn't back: they stay on the planet (owner, 2026-11-08).
    if (!(p.alive && isLostPlace(p.room))) logPrivate(state, p.id, "expeditionReturned", { planet: report.planet, report: report.id });
  }
}

/**
 * U-turn (owner, 2026-11-08, #358): a holder still with the crew ends the expedition at once; the crew comes back with
 * what it found, the sectors left skipped, and anyone lost stays lost. A report line names who turned back; nothing
 * public but the timer ending. The action (actions/u_turn.ts) checked it may. Mutates a cloned state.
 */
export function turnBack(state: GameState, player: Readonly<PlayerState>): void {
  const report = state.expeditions.find((r) => r.id === state.expedition!.report)!;
  report.events.push({ sector: U_TURN, kind: "uTurn", who: player.character });
  returnExpedition(state);
}

/** The U-turn's report line's sector key: not a planet tag. */
export const U_TURN = "U_TURN";

/** Whether this player is aboard the expedition under way: alive and with its crew in the Icarus (not lost). */
export const onExpedition = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean => state.expedition !== null && withCrew(state, p);

/**
 * The Traitor's Sabotage (owner, 2026-11-08, #358; 2026-11-17): free, secret, once per expedition. The next sector draws
 * only its `negative` events (Nothing if none is left); the ones after it are drawn as usual. Nothing records it
 * anywhere but the flags, which no view carries. The action (actions/sabotage_expedition.ts) checked it may. Mutates a
 * cloned state.
 */
export function sabotage(state: GameState): void {
  state.expedition!.sabotaged = true;
  state.expedition!.sabotageNext = true;
}

/**
 * The next sector's tag, for a member with U-turn or Traitor still with the crew (owner, 2026-11-17, as in eMush): only
 * that one sector, only while it is next. Undefined for anyone else, or with no sector left.
 */
export function nextSectorFor(state: Readonly<GameState>, p: Readonly<PlayerState>): PlanetTag | undefined {
  const away = state.expedition;
  if (!away || !onExpedition(state, p) || !(hasSkill(p, "fast_backward") || hasSkill(p, "traitor"))) return undefined;
  const report = state.expeditions.find((r) => r.id === away.report);
  if (!report?.members.includes(p.id)) return undefined;
  const next = away.sectors[0];
  return next === undefined ? undefined : planetById(state, away.planet)?.sectors[next]?.tag;
}

/**
 * The Daedalus jumped (travel or leaving orbit) while a crew is out (owner, 2026-11-07, #356). With Magnetic return
 * (`AUTO_RETURN_ICARUS`) the crew is back at once, the sectors left skipped, as on a normal return; NERON says so to
 * everyone. Without it the living members die, the Icarus is lost with everything in it (items, loot, bodies), and no
 * expedition can take off again (`icarusLost`); NERON tells everyone. Anyone sitting in the docked Icarus is put off in
 * its bay first (owner, 2026-11-17). Mutates a cloned state; nothing if none is out.
 */
export function strandExpedition(state: GameState): void {
  disembarkAll(state);
  strandCrew(state);
  abandonLost(state);
}

/**
 * Intergalactic launch (#480, owner 2026-11-22): anyone on a planet (in an active expedition or lost) dies at once as
 * `abandoned`, with no Magnetic return rescue, and the craft/items left behind are lost. Anyone sitting in the docked
 * Icarus is still aboard the Daedalus and stays alive. Mutates a cloned state.
 */
export function abandonExpedition(state: GameState): void {
  const away = state.expedition;
  if (away) {
    const report = state.expeditions.find((r) => r.id === away.report);
    const craft = expeditionCraft(state);
    state.expedition = null;
    if (!away.ship) {
      state.icarusLost = true;
      if (report) logPublic(state, undefined, "icarusLost", { planet: report.planet }, "warning");
    }
    for (const p of state.players) {
      if (p.alive && p.room === craft) killPlayer(state, p, "abandoned");
    }
    state.items = state.items.filter((i) => !sameContainer(i.at, { kind: "room", id: craft }));
  }
  abandonLost(state);
}

function strandCrew(state: GameState): void {
  const away = state.expedition;
  if (!away) return;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  // A patrol ship on the planet is recalled or lost like the Icarus (owner, 2026-11-09, #359).
  if (projectDone(state, "AUTO_RETURN_ICARUS")) {
    if (away.ship) logPublic(state, undefined, "patrolRecalled", { room: away.ship, planet: report.planet }, "warning");
    else logPublic(state, undefined, "icarusRecalled", { planet: report.planet }, "warning");
    returnExpedition(state);
    return;
  }
  const craft = expeditionCraft(state);
  state.expedition = null;
  // Its pilot's death loses a patrol ship, with its own NERON line (death.ts).
  if (!away.ship) {
    state.icarusLost = true;
    logPublic(state, undefined, "icarusLost", { planet: report.planet }, "warning");
  }
  for (const id of report.members) {
    const p = state.players.find((q) => q.id === id)!;
    if (p.alive && p.room === craft) killPlayer(state, p, "abandoned");
  }
  state.items = state.items.filter((i) => !sameContainer(i.at, { kind: "room", id: craft }));
}

/**
 * The ship left the planet: everyone lost on it dies there, Magnetic return or not (owner, 2026-11-08, #357), and
 * whatever is in their places (their items, their bodies) is gone with the planet. Mutates a cloned state.
 */
function abandonLost(state: GameState): void {
  for (const p of lostPlayers(state)) killPlayer(state, p, "abandoned");
  state.items = state.items.filter((i) => !(i.at.kind === "room" && isLostPlace(i.at.id)));
}

/** Everyone alive and lost on a planet, in seat order. They are all on the planet the ship orbits: leaving it kills them. */
export const lostPlayers = (state: Readonly<GameState>): PlayerState[] => state.players.filter((p) => p.alive && isLostPlace(p.room));

/** Whether a member is still with the crew: alive and in the Icarus, not lost on the planet. */
export const withCrew = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean => p.alive && p.room === expeditionCraft(state);


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
    return withCrew(state, p) && carries(state, p, type);
  });
};

/** When the expedition under way is back, if nothing ends it early: one `stepMs` per sector left after the next. */
export function expeditionReturnAt(state: Readonly<GameState>): number | null {
  const away = state.expedition;
  if (!away) return null;
  return away.nextAt + (away.sectors.length - 1) * stepMs(state);
}

/** Time between steps: the config's, or 2 seconds under the fastExpeditions development cheat. */
const stepMs = (state: Readonly<GameState>): number => (fastExpeditions(state) ? FAST_EXPEDITION_STEP_MS : state.config.expedition.stepMs);

interface Ctx {
  state: GameState;
  /** Every member, as the step began (the dead and the lost included: filter with `withCrew`). */
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
  // Sabotaged by a Traitor: only the negative events can be drawn, in the next sector only (owner, 2026-11-08, #358; 2026-11-17).
  const sabotaged = state.expedition?.sabotageNext ?? false;
  const weights = table.map((e) => (cancelled(ctx, sector, e) || (sabotaged && !e.negative) ? 0 : eventWeight(ctx, sector, e)));
  if (weights.every((w) => w === 0)) return { sector, kind: "nothing" };
  const rule = table[rollWeighted(state, weights)]!;
  const kind = rule.kind;
  const event: ExpeditionEvent = { sector, kind };
  const rules = state.config.expedition;
  const living = () => ctx.crew.filter((p) => withCrew(state, p));
  const amount = rule.amount ?? 0;
  switch (kind) {
    case "nothing":
    case "again":
    case "back":
      break;
    case "fatigue":
      hurt(ctx, event, new Map(living().map((p) => [p, rules.fatigue])), "exploration");
      break;
    case "accident": {
      const all = living();
      const victim = all[rollInt(state, all.length)]!;
      const hp = roll(state, rules.accident);
      // A rope spares its bearer in some sectors: the Accident happens, with no effect (owner, 2026-11-08).
      const { rope } = rules.gear;
      if (rope.tags.includes(sector) && carries(state, victim, rope.item)) event.avoided = { name: victim.character, item: rope.item };
      else hurt(ctx, event, new Map([[victim, hp]]), "exploration");
      break;
    }
    case "catastrophe":
      hurt(ctx, event, new Map(living().map((p) => [p, roll(state, rules.catastrophe)])), "exploration");
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
      // Polymath and Skilful count as a Botanist here (owner, 2026-11-08, #358; 2026-11-18).
      const bonus = living().some((p) => hasSkill(p, "botanic") || hasSkill(p, "polymath") || hasSkill(p, "skilful")) ? rules.botanistBonus : 0;
      const item = harvestFruit(state);
      event.item = item;
      event.amount = drop(state, item, amount + bonus);
      break;
    }
    case "provision": {
      // Survival: one more steak per living holder (owner, 2026-11-08).
      const bonus = living().filter((p) => hasSkill(p, "survival")).length * rules.survivalProvision;
      event.item = rules.loot.provision;
      event.amount = drop(state, rules.loot.provision, amount + bonus);
      break;
    }
    case "artifact": {
      const item = artifact(state);
      event.item = item;
      event.amount = drop(state, item, 1);
      break;
    }
    case "starmap":
      event.item = rules.loot.starmap;
      event.amount = drop(state, rules.loot.starmap, 1);
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
      const lost = removeItem(state, carried[rollInt(state, carried.length)]!.id);
      event.item = lost.type;
      // Kleptophobia (owner, 2026-11-26): its holder loses morale.
      const holder = state.players.find((p) => p.id === lost.at.id);
      if (holder) itemLost(state, holder, lost);
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
    case "disease":
      sicken(ctx, event, living());
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
 * Disease (owner, 2026-11-21): one member still with the crew, Mush included (they carry it without suffering it), picked
 * among those who can still catch one, catches a random disease from `config.diseases.expeditionDiseases` they don't
 * have yet. A Hygienist may resist (`addDisease`), silently. The report doesn't say who: the victim learns it from
 * their own statuses. Nobody left to catch one: Nothing.
 */
function sicken(ctx: Ctx, event: ExpeditionEvent, pool: PlayerState[]): void {
  const { state } = ctx;
  const catchable = (p: PlayerState) => state.config.diseases.expeditionDiseases.filter((d) => !p.modifiers.includes(d));
  const exposed = pool.filter((p) => catchable(p).length > 0);
  if (exposed.length === 0) {
    event.kind = "nothing";
    return;
  }
  const victim = exposed[rollInt(state, exposed.length)]!;
  const diseases = catchable(victim);
  addDisease(state, victim, diseases[rollInt(state, diseases.length)]!);
}

/**
 * Whether an event is cancelled for this crew (owner, 2026-11-08, #357, #358): a Tracker cancels Found dead; a compass
 * cancels Again, and Lost when every member who explores carries one; a white flag, a Diplomat or a Polymath cancels
 * Fight in the white flag's sector (Intelligent life) only.
 */
function cancelled(ctx: Ctx, sector: string, rule: ExpeditionEventRule): boolean {
  const { state } = ctx;
  const { gear } = state.config.expedition;
  const explorers = ctx.crew.filter((p) => withCrew(state, p));
  switch (rule.kind) {
    case "foundDead":
      return explorers.some((p) => hasSkill(p, "hunt"));
    case "again":
      return crewCarries(state, gear.compass);
    case "lost":
      return explorers.length > 0 && explorers.every((p) => carries(state, p, gear.compass));
    case "fight":
      return sector === gear.whiteFlag.tag && (crewCarries(state, gear.whiteFlag.item) || explorers.some((p) => hasSkill(p, "diplomacy") || hasSkill(p, "polymath") || hasSkill(p, "skilful")));
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
  board(state, p, lostPlace(p.id));
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
  const craft = expeditionCraft(state);
  const lost = lostPlayers(state);
  if (lost.length === 0) {
    event.kind = "nothing";
    return;
  }
  const p = lost[rollInt(state, lost.length)]!;
  const place = p.room;
  event.who = p.character;
  // Through `damage`, as Kill, so the dev infiniteHp cheat survives it (and is then found alive).
  if (event.kind === "foundDead") damage(state, p, p.hp, "exploration_lost");
  const left = (i: ItemState) => i.at.kind === "room" && i.at.id === place;
  if (!p.alive && !state.config.expedition.deadKeepItems) state.items = state.items.filter((i) => !left(i) || i.type === CORPSE_ITEM);
  for (const item of state.items) if (left(item)) item.at = { kind: "room", id: craft };
  if (!p.alive) return;
  board(state, p, craft);
  recoverShip(state, p);
  if (!report.members.includes(p.id)) {
    report.members.push(p.id);
    report.crew.push(p.character);
  }
  if (report.lostAt) delete report.lostAt[p.id];
  ctx.carried[p.id] = itemsIn(state, { kind: "player", id: p.id }).map((i) => i.id);
}

/**
 * A pilot found alive whose patrol ship waited on the planet: it is flown back to its bay, cargo and all, while the
 * pilot comes back with the crew that found them (Claude's reading of the owner's "flown back if they're found",
 * 2026-11-09, #359). The bay sees it come in.
 */
function recoverShip(state: GameState, pilot: Readonly<PlayerState>): void {
  for (const ship of PATROL_SHIPS) {
    const shipState = state.patrolShips[ship.id]!;
    if (shipState.onPlanet !== pilot.id) continue;
    shipState.onPlanet = null;
    shipState.out = false;
    for (const item of state.items) if (sameContainer(item.at, { kind: "room", id: ship.id })) item.at = { kind: "room", id: ship.bay };
    logPublic(state, ship.bay, "patrolRecovered", { room: ship.id });
  }
}

/** An alien fruit species picked uniformly for a Harvest event (#437). */
const harvestFruit = (state: GameState): ItemTypeId => {
  const list = state.config.expedition.loot.harvest;
  return list[rollInt(state, list.length)]!;
};

/** An artifact picked uniformly among the original's 9. */
const artifact = (state: GameState): ItemTypeId => {
  const list = state.config.expedition.loot.artifacts;
  return list[rollInt(state, list.length)]!;
};

/**
 * A fight against a creature (owner, 2026-11-08, #357). The crew's strength is 1 per living member plus each carried
 * weapon's `expoStrength`; a gun counts only with a charge left. Grenades (`consumed` weapons) are used up one at a
 * time while the crew is still weaker (eMush's Fight). The crew wins with a chance of 0 below half the creature's
 * strength (rounded down), then (crew − half + 1) / (creature − half + 1), capped at 1; a win brings the creature's
 * loot. Slice D (#358): each Shooter carrying a gun that counts adds `shooterBonus`, once each; with the Centauri
 * rebel base contacted, each blaster that counts adds `centauri.bonus`. Win or lose, the shortfall against the crew's strength with every grenade counted, spent or not, is dealt as
 * HP, each point to a random living member.
 */
function fight(ctx: Ctx, event: ExpeditionEvent, creature: string): void {
  const { state } = ctx;
  const foe = state.config.expedition.creatures[creature]!;
  const strength = foe.strength.length === 1 ? foe.strength[0]! : foe.strength[rollInt(state, foe.strength.length)]!;
  const weapons = state.config.weapons.types;
  const members = ctx.crew.filter((p) => withCrew(state, p));
  const gear = members.flatMap((p) => itemsIn(state, { kind: "player", id: p.id })).filter((i) => weapons[i.type] !== undefined && isWorking(i));
  const grenades = gear.filter((i) => weapons[i.type]!.consumed);
  let crew = members.length;
  const rules = state.config.expedition;
  const counted = gear.filter((i) => !weapons[i.type]!.consumed && usable(state, i));
  for (const item of counted) crew += weapons[item.type]!.expoStrength;
  const isGun = (i: ItemState) => weapons[i.type]!.gun === true;
  const shooters = members.filter((p) => hasSkill(p, "gunman") && counted.some((i) => isGun(i) && i.at.kind === "player" && i.at.id === p.id));
  crew += shooters.length * rules.shooterBonus;
  if (rebelContacted(state, "CENTAURI")) crew += counted.filter((i) => i.type === rules.centauri.item || i.type === "customized_blaster").length * rules.centauri.bonus;
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
  if (hits.size > 0) hurt(ctx, event, new Map([...hits].sort(([a], [b]) => members.indexOf(a) - members.indexOf(b))), "exploration_combat");
  if (!won) fightDiseases(ctx, members);
}

/**
 * A lost fight (owner, 2026-11-21): each member still with the crew, Mush included (they carry it), has
 * `combatDiseaseChance` to catch a random disease from `config.diseases.expeditionCombatDiseases` they don't have yet.
 * A Hygienist may resist (`addDisease`). Silent, like the Disease event: the report doesn't say who.
 */
function fightDiseases(ctx: Ctx, members: PlayerState[]): void {
  const { state } = ctx;
  for (const p of members) {
    if (!withCrew(state, p) || rollFloat(state) >= state.config.expedition.combatDiseaseChance) continue;
    const catchable = state.config.diseases.expeditionCombatDiseases.filter((d) => !p.modifiers.includes(d));
    if (catchable.length > 0) addDisease(state, p, catchable[rollInt(state, catchable.length)]!);
  }
}

/** The chance a crew of `crew` strength beats a creature of `strength` (owner, 2026-11-08; eMushpedia's `Combat`). */
export function winChance(crew: number, strength: number): number {
  const half = Math.floor(strength / 2);
  if (crew < half) return 0;
  return Math.min(1, (crew - half + 1) / (strength - half + 1));
}

/** A won fight's loot onto the Icarus's floor, grouped by item type. */
function fightLoot(state: GameState, loot: Readonly<CreatureLoot>): { item: ItemTypeId; count: number }[] {
  const rules = state.config.expedition;
  const found = new Map<ItemTypeId, number>();
  const add = (item: ItemTypeId) => found.set(item, (found.get(item) ?? 0) + drop(state, item, 1));
  for (let i = 0; i < (loot.provision ?? 0); i++) add(rules.loot.provision);
  for (let i = 0; i < (loot.artifact ?? 0); i++) add(artifact(state));
  for (let i = 0; i < (loot.starmap ?? 0); i++) add(rules.loot.starmap);
  return [...found].map(([item, count]) => ({ item, count }));
}

/** Kill and Kill all: these members die outright (Survival doesn't help), under the expedition's death rules. */
function kill(ctx: Ctx, event: ExpeditionEvent, members: PlayerState[]): void {
  for (const p of members) {
    damage(ctx.state, p, p.hp, "exploration");
    if (!p.alive) died(ctx, event, p);
  }
}

/** A weapon counts in a fight when it needs no charges or has one left. */
const usable = (state: Readonly<GameState>, item: Readonly<ItemState>): boolean =>
  state.config.weapons.types[item.type]!.charges === undefined || (item.charges ?? 0) > 0;

/**
 * Damage to members, each taking theirs as one hit, less `survivalReduction` with the Survival skill and, in a fight,
 * less Plastenite Armor's absorb (both stack; owner, 2026-11-17). Notes it on the
 * event. A member who dies leaves a body in the Icarus, which comes back with it (death.ts); without `deadKeepItems`,
 * what they set out with is lost (the items `killPlayer` dropped on the floor are taken away).
 */
function hurt(ctx: Ctx, event: ExpeditionEvent, amounts: Map<PlayerState, number>, cause: DeathCause): void {
  const { state } = ctx;
  const rules = state.config.expedition;
  for (const [p, amount] of amounts) {
    const survived = Math.max(0, amount - (hasSkill(p, "survival") ? rules.survivalReduction : 0));
    const hp = cause === "exploration_combat" ? afterArmor(state, p, survived) : survived;
    (event.hurt ??= []).push({ name: p.character, hp });
    damage(state, p, hp, cause);
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

/** `count` items of `type` on the floor of the craft, which unloads them in the bay on its return. Returns how many. */
function drop(state: GameState, type: ItemTypeId, count: number): number {
  spawnInRoom(state, expeditionCraft(state), type, count);
  return count;
}
