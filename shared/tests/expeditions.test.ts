import { describe, expect, it } from "vitest";
import { BLUEPRINTS } from "../src/blueprints.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { pickSectors, runExpedition, winChance } from "../src/expeditions.ts";
import { nextDue } from "../src/queue.ts";
import { projectStatus } from "../src/projects.ts";
import { PLANET_TAG_IDS } from "../src/planets.ts";
import { applyInput } from "../src/replay.ts";
import { FAST_EXPEDITION_STEP_MS } from "../src/cheats.ts";

import { applyAction, createGame, setCheat, viewFor } from "../src/rules.ts";
import { ACTIONS } from "../src/actions.ts";
import { commandId, ICARUS_CRAFT, lostPlace, patrolShip, shipsInFlight } from "../src/patrol.ts";
import type { Action, ExpeditionEventRule, GameConfig, GameState, Planet, PlayerId } from "../src/types.ts";
import { clone, costOf, makeSeats, must, noHunters, noIncidents, offered, option, player, rebelCallAt } from "./support.ts";

const ICARUS = "ICARUS";
const CRAFT = ICARUS_CRAFT;
const takeoff: Action = { type: "icarus_takeoff" };
const boardIcarus: Action = { type: "board_icarus", equipment: "ICARUS:ICARUS_COMMAND" };
const getOff: Action = { type: "leave_icarus" };
const { expedition } = DEFAULT_CONFIG;

const planet = (tags: Planet["sectors"][number]["tag"][]): Planet => ({
  id: "planet-1",
  name: "Fugunys",
  direction: "north",
  distance: 3,
  sectors: tags.map((tag) => ({ tag, known: false })),
});

/**
 * Six seats: p0 (a Pilot), p1, p2 and p3 in the Icarus Bay, p4 and p5 in the laboratory. p5 found the planet the ship
 * orbits. `events` replaces the event tables (so a test draws the event it needs), `tags` the planet's sectors.
 */
function game(opts: { events?: Record<string, ExpeditionEventRule[]>; tags?: Planet["sectors"][number]["tag"][]; config?: Partial<GameConfig["expedition"]>; timed?: boolean; suits?: boolean } = {}): GameState {
  const config = noIncidents(noHunters(structuredClone(DEFAULT_CONFIG)));
  config.startItems = [];
  // Phase 1's tests resolve at takeoff, as single player does; phase 2's are timed.
  config.instantExpeditions = !opts.timed;
  config.expedition = { ...config.expedition, ...opts.config, events: { ...config.expedition.events, ...opts.events } };
  const s = createGame(makeSeats(6), config, 11);
  for (const p of s.players) p.room = ["p0", "p1", "p2", "p3"].includes(p.id) ? ICARUS : "LABORATORY";
  player(s, "p0").skills.push("pilot");
  s.planets.p5 = [planet(opts.tags ?? ["OXYGEN", "FOREST", "DESERT"])];
  s.navigation.orbit = "planet-1";
  // Slice C: a planet with no Oxygen sector needs spacesuits, so everyone carries one unless a test says otherwise.
  if (opts.suits !== false) for (const p of s.players) s.items.push({ id: `item-suit-${p.id}`, type: "space_suit", at: { kind: "player", id: p.id } });
  return s;
}

/** Only the given event, for the landing and every sector tag. */
const only = (rule: ExpeditionEventRule, landing: ExpeditionEventRule = { kind: "nothing", weight: 1 }): Record<string, ExpeditionEventRule[]> => ({
  LANDING: [landing],
  ...Object.fromEntries(PLANET_TAG_IDS.map((tag) => [tag, [rule]])),
});

/** A crew fighting a test creature of `strength` in every sector. */
const fightGame = (strength: number, loot: GameConfig["expedition"]["creatures"][string]["loot"] = {}) =>
  game({ tags: ["PREDATOR"], events: only({ kind: "fight", weight: 1, creature: "TEST" }), config: { creatures: { ...expedition.creatures, TEST: { strength: [strength], loot } } } });

/** A timed game (phase 2) at server time 1,000,000. */
const timedGame = (opts: Parameters<typeof game>[0] = {}): GameState => {
  const s = game({ ...opts, timed: true });
  s.now = 1_000_000;
  return s;
};

/**
 * The crew boards (owner, 2026-11-17): `by` first, then everyone else in the bay who may (room aboard, a suit if one is
 * needed), in seat order. The rest stay in the bay.
 */
function aboard(s: GameState, by: PlayerId = "p0"): GameState {
  let t = must(applyAction(s, by, boardIcarus));
  for (const p of s.players) {
    if (p.id === by || p.room !== ICARUS) continue;
    const r = applyAction(t, p.id, boardIcarus);
    if (r.ok) t = r.state;
  }
  return t;
}
/** Why the action is refused, or null. */
const why = (s: GameState, id: PlayerId, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action as never);
/** Board (`aboard`), then `by` takes off from inside. */
const go = (s: GameState, by: PlayerId = "p0") => must(applyAction(aboard(s, by), by, takeoff));
const give = (s: GameState, id: PlayerId, type: string, charges?: number) =>
  s.items.push({ id: `item-test-${s.items.length}`, type, at: { kind: "player", id }, ...(charges !== undefined && { charges }) });
const floor = (s: GameState, type: string) => s.items.filter((i) => i.type === type && i.at.kind === "room" && i.at.id === ICARUS).length;
const harvested = (s: GameState, room = ICARUS) => s.items.filter((i) => expedition.loot.harvest.includes(i.type) && i.at.kind === "room" && i.at.id === room).length;

describe("expeditions, phase 1 (instant, as in single player)", () => {
  it("boarding: free, offered in the bay in orbit of a planet with an unexplored sector; a public line in the bay", () => {
    const s = game();
    for (const id of ["p0", "p1"]) {
      expect(offered(s, id)).toContainEqual(boardIcarus);
      expect(option(s, id, boardIcarus)?.cost).toEqual({ ap: 0, mp: 0 });
    }
    const next = must(applyAction(s, "p1", boardIcarus));
    expect(player(next, "p1").room).toBe(CRAFT);
    expect(player(next, "p1").ap).toBe(player(s, "p1").ap);
    expect(next.log.slice(s.log.length)).toEqual([expect.objectContaining({ key: "icarusBoarded", room: ICARUS, visibleTo: "all", params: { name: player(s, "p1").character } })]);
    // Takeoff is no longer offered from the bay, only from inside.
    expect(offered(s, "p0")).not.toContainEqual(takeoff);
    expect(why(s, "p0", takeoff)).toBe("not_in_icarus");
  });

  it("boarding is refused out of the bay, with the Icarus away or lost, out of orbit, all explored, full, or suitless on an airless planet", () => {
    const s = game({ tags: ["FOREST", "DESERT"] });
    const refused = (t: GameState, id: PlayerId, error: string) => {
      expect(offered(t, id)).not.toContainEqual(boardIcarus);
      expect(applyAction(t, id, boardIcarus).ok).toBe(false);
      expect(why(t, id, boardIcarus)).toBe(error);
    };
    refused(s, "p4", "no_icarus");

    const away = timedGame({ tags: ["FOREST", "DESERT"] });
    const out = must(applyAction(must(applyAction(away, "p0", boardIcarus)), "p0", takeoff));
    refused(out, "p1", "icarus_away");

    const lost = structuredClone(s);
    lost.icarusLost = true;
    refused(lost, "p1", "icarus_lost");

    const noOrbit = structuredClone(s);
    noOrbit.navigation.orbit = null;
    refused(noOrbit, "p1", "not_in_orbit");

    const done = structuredClone(s);
    for (const sector of done.planets.p5![0]!.sectors) sector.explored = true;
    refused(done, "p1", "explored");

    const full = structuredClone(s);
    for (const p of full.players) p.room = ICARUS;
    let t = full;
    for (const id of ["p0", "p1", "p2", "p3"]) t = must(applyAction(t, id, boardIcarus));
    expect(expedition.maxCrew).toBe(4);
    refused(t, "p4", "icarus_full");

    const suitless = structuredClone(s);
    suitless.items = suitless.items.filter((i) => i.id !== "item-suit-p1");
    refused(suitless, "p1", "no_spacesuit");
    const broken = structuredClone(s);
    broken.items.find((i) => i.id === "item-suit-p1")!.broken = true;
    refused(broken, "p1", "no_spacesuit");
  });

  it("boarding without a spacesuit is allowed on a planet with an Oxygen sector", () => {
    const s = game({ suits: false });
    expect(must(applyAction(s, "p1", boardIcarus)).players.find((p) => p.id === "p1")!.room).toBe(CRAFT);
  });

  it("leave_icarus: free, from inside the docked Icarus, a public line in the bay; the last to leave takes its floor with them", () => {
    const s = aboard(game());
    expect(offered(s, "p1")).toContainEqual(getOff);
    expect(offered(game(), "p1")).not.toContainEqual(getOff);
    const body = { id: "item-test-body", type: "ration", at: { kind: "room" as const, id: CRAFT } };
    s.items.push(body);
    let t = must(applyAction(s, "p1", getOff));
    expect(player(t, "p1").room).toBe(ICARUS);
    expect(player(t, "p1").ap).toBe(player(s, "p1").ap);
    expect(t.log.slice(s.log.length)).toEqual([expect.objectContaining({ key: "icarusLeft", room: ICARUS, visibleTo: "all", params: { name: player(s, "p1").character } })]);
    expect(t.items.find((i) => i.id === body.id)!.at).toEqual({ kind: "room", id: CRAFT });
    for (const id of ["p0", "p2", "p3"]) t = must(applyAction(t, id, getOff));
    expect(t.items.find((i) => i.id === body.id)!.at).toEqual({ kind: "room", id: ICARUS });
  });

  it("takeoff is offered aboard to anyone who can fly (not grounded), in orbit of a planet with an unexplored sector", () => {
    const s = aboard(game());
    for (const id of ["p0", "p1"]) {
      expect(offered(s, id)).toContainEqual(takeoff);
      expect(option(s, id, takeoff)?.cost.ap).toBe(expedition.cost.ap);
    }
    const grounded = structuredClone(s);
    const p1 = player(grounded, "p1");
    if (p1.role === "mush") p1.role = "human";
    addDisease(grounded, p1, "gastroenteritis_disease");
    expect(offered(grounded, "p1")).not.toContainEqual(takeoff);
    expect(applyAction(grounded, "p1", takeoff).ok).toBe(false);

    const noOrbit = structuredClone(s);
    noOrbit.navigation.orbit = null;
    expect(offered(noOrbit, "p0")).not.toContainEqual(takeoff);
    expect(applyAction(noOrbit, "p0", takeoff).ok).toBe(false);

    const leaving = structuredClone(s);
    leaving.navigation.arriving = { planet: null };
    expect(applyAction(leaving, "p0", takeoff).ok).toBe(false);

    const done = structuredClone(s);
    for (const sector of done.planets.p5![0]!.sectors) sector.explored = true;
    expect(offered(done, "p0")).not.toContainEqual(takeoff);
    expect(applyAction(done, "p0", takeoff).ok).toBe(false);
  });

  it("an illegal takeoff leaves the state unchanged", () => {
    const s = aboard(game());
    s.navigation.orbit = null;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p1", takeoff).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("takes everyone aboard, the launcher first and paying alone; a public takeoff line, then each member's private line", () => {
    const s = aboard(game({ events: only({ kind: "nothing", weight: 1 }) }), "p2");
    // p1 can launch too, and leads the crew though p2 boarded first.
    const next = must(applyAction(s, "p1", takeoff));
    expect(player(next, "p1").ap).toBe(player(s, "p1").ap - expedition.cost.ap);
    for (const id of ["p0", "p2", "p3"]) expect(player(next, id).ap).toBe(player(s, id).ap);
    for (const id of ["p0", "p1", "p2", "p3"]) expect(player(next, id).room).toBe(ICARUS);
    const report = next.expeditions[0]!;
    expect(new Set(report.members)).toEqual(new Set(["p0", "p1", "p2", "p3"]));
    expect(report.members[0]).toBe("p1");
    expect(report.planet).toBe("Fugunys");

    const lines = next.log.slice(s.log.length);
    expect(lines[0]).toMatchObject({ key: "icarusTakeoff", room: ICARUS, visibleTo: "all", params: { name: player(s, "p1").character, planet: "Fugunys" } });
    const returned = lines.filter((e) => e.key === "expeditionReturned");
    expect(returned.map((e) => e.visibleTo)).toEqual(report.members.map((id) => [id]));
    expect(returned[0]!.params).toEqual({ planet: "Fugunys", report: report.id });
    // The return leaves nothing public.
    expect(lines.filter((e) => e.visibleTo === "all").map((e) => e.key)).toEqual(["icarusTakeoff"]);
  });

  it("leaves behind whoever stayed in the bay", () => {
    const s = game({ events: only({ kind: "nothing", weight: 1 }) });
    const t = must(applyAction(must(applyAction(s, "p0", boardIcarus)), "p1", boardIcarus));
    const report = must(applyAction(t, "p0", takeoff)).expeditions[0]!;
    expect(report.members).toEqual(["p0", "p1"]);
  });

  it("lands first, then explores each unexplored sector once, at most `sectors`, marking them explored", () => {
    const tags = Array.from({ length: 12 }, (_, i) => (i % 2 ? "FOREST" : "DESERT") as const);
    const s = game({ tags, events: only({ kind: "nothing", weight: 1 }) });
    const first = go(s);
    const report = first.expeditions[0]!;
    expect(report.events[0]!.sector).toBe("LANDING");
    expect(report.events).toHaveLength(1 + expedition.sectors);
    const sectors = first.planets.p5![0]!.sectors;
    expect(sectors.filter((x) => x.explored)).toHaveLength(expedition.sectors);
    // Unknown stays unknown: exploring reveals nothing to the finder.
    expect(sectors.every((x) => !x.known)).toBe(true);

    player(first, "p0").ap = 12;
    const second = go(first);
    expect(second.expeditions[1]!.events).toHaveLength(1 + tags.length - expedition.sectors);
    expect(second.planets.p5![0]!.sectors.every((x) => x.explored)).toBe(true);
  });

  it("draws sectors by their tag's explo weight, never one already explored", () => {
    const s = game({ tags: ["CRISTAL_FIELD", "PREDATOR", "FOREST"] });
    s.planets.p5![0]!.sectors[1]!.explored = true;
    const picks = pickSectors(s, s.planets.p5![0]!);
    expect([...picks].sort()).toEqual([0, 2]);
  });

  it("adds oxygen and fuel to the ship, capped", () => {
    const s = game({ tags: ["OXYGEN", "HYDROCARBON"], events: { OXYGEN: [{ kind: "oxygen", weight: 1, amount: 24 }], HYDROCARBON: [{ kind: "fuel", weight: 1, amount: 6 }], LANDING: [{ kind: "nothing", weight: 1 }] } });
    s.ship.oxygen = s.config.ship.oxygen.max - 5;
    s.ship.fuel = 1;
    const next = go(s);
    expect(next.ship.oxygen).toBe(s.config.ship.oxygen.max);
    expect(next.ship.fuel).toBe(7);
    const events = next.expeditions[0]!.events;
    expect(events.find((e) => e.kind === "oxygen")!.amount).toBe(5);
    expect(events.find((e) => e.kind === "fuel")!.amount).toBe(6);
  });

  it("leaves the loot on the bay's floor: fruit (one more with a Botanist), rations, a starmap", () => {
    const harvest = go(game({ tags: ["FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 3 }) }));
    expect(harvested(harvest)).toBe(3);
    expect(expedition.loot.harvest).toContain(harvest.expeditions[0]!.events[1]!.item);
    const withBotanist = game({ tags: ["FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 3 }) });
    player(withBotanist, "p2").skills.push("botanic");
    expect(harvested(go(withBotanist))).toBe(3 + expedition.botanistBonus);
    expect(floor(go(game({ tags: ["PREDATOR"], events: only({ kind: "provision", weight: 1, amount: 3 }) })), expedition.loot.provision)).toBe(3);
    const artifact = go(game({ tags: ["RUINS"], events: only({ kind: "artifact", weight: 1 }) }));
    expect(expedition.loot.artifacts).toContain(artifact.expeditions[0]!.events[1]!.item);
    expect(floor(artifact, artifact.expeditions[0]!.events[1]!.item!)).toBe(1);
  });

  it("tags with an empty table are explored with nothing happening", () => {
    const next = go(game({ tags: ["FOREST", "DESERT"], events: { LANDING: [{ kind: "nothing", weight: 1 }], FOREST: [], DESERT: [] } }));
    expect(next.expeditions[0]!.events.slice(1).map((e) => e.kind)).toEqual(["nothing", "nothing"]);
  });

  it("fatigue hurts every member; Survival takes 1 off each hit", () => {
    const s = game({ tags: ["HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    player(s, "p1").skills.push("survival");
    const next = go(s);
    expect(player(next, "p0").hp).toBe(player(s, "p0").hp - expedition.fatigue);
    expect(player(next, "p1").hp).toBe(player(s, "p1").hp - (expedition.fatigue - expedition.survivalReduction));
    expect(next.expeditions[0]!.events[1]!.hurt).toContainEqual({ name: player(s, "p1").character, hp: 1 });
  });

  it("Plastenite Armor takes 1 off each member's fight damage, stacking with Survival, but not off fatigue", () => {
    const armor = (s: GameState, ids: PlayerId[]) => {
      for (const id of ids) s.items.push({ id: `item-armor-${id}`, type: "plastenite_armor", at: { kind: "player", id } });
      return s;
    };
    const plain = go(fightGame(20));
    const armed = fightGame(20);
    armor(armed, ["p0", "p1", "p2"]);
    armed.items.find((i) => i.id === "item-armor-p2")!.broken = true;
    player(armed, "p1").skills.push("survival");
    const next = go(armed);
    const lost = (s: GameState, id: PlayerId) => player(armed, id).hp - player(s, id).hp;
    const off = { p0: DEFAULT_CONFIG.plasteniteArmor.absorb, p1: DEFAULT_CONFIG.plasteniteArmor.absorb + expedition.survivalReduction, p2: 0, p3: 0 };
    for (const [id, reduction] of Object.entries(off)) expect(lost(next, id)).toBe(Math.max(0, lost(plain, id) - reduction));
    expect(lost(plain, "p0")).toBeGreaterThan(off.p0); // the seed hurts p0 and p1 enough to show it
    expect(lost(plain, "p1")).toBeGreaterThan(off.p1);
    expect(next.expeditions[0]!.events.filter((e) => e.kind === "fight")).toHaveLength(1);

    const tired = armor(game({ tags: ["HOT"], events: only({ kind: "fatigue", weight: 1 }) }), ["p0"]);
    expect(player(go(tired), "p0").hp).toBe(player(tired, "p0").hp - expedition.fatigue);
  });

  it("an accident hurts one member; a Pilot aboard avoids the landing's catastrophe", () => {
    const s = game({ tags: ["RUINS"], events: only({ kind: "accident", weight: 1 }) });
    const next = go(s);
    const hurt = next.expeditions[0]!.events[1]!.hurt!;
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.hp).toBeGreaterThanOrEqual(expedition.accident[0]);
    expect(hurt[0]!.hp).toBeLessThanOrEqual(expedition.accident[1]);

    const crash = game({ tags: ["FOREST"], events: only({ kind: "nothing", weight: 1 }, { kind: "catastrophe", weight: 1 }) });
    expect(go(crash).expeditions[0]!.events[0]!.kind).toBe("nothing");
    // Without a Pilot aboard (as once the launch is open to anyone), everyone is hurt.
    const noPilot = aboard(crash);
    player(noPilot, "p0").skills = [];
    const report = runExpedition(noPilot, player(noPilot, "p0"));
    expect(report.events[0]!.kind).toBe("catastrophe");
    expect(report.events[0]!.hurt).toHaveLength(4);
  });

  it("wins a fight when the crew is strong enough, using a grenade only if it is needed", () => {
    // 4 members + a knife (1) + a loaded blaster (1) + an empty blaster (0) = 6.
    const s = fightGame(6);
    give(s, "p1", "knife");
    give(s, "p2", "blaster", 3);
    give(s, "p3", "blaster", 0);
    give(s, "p3", "grenade");
    const won = go(s);
    expect(won.expeditions[0]!.events[1]!.fight).toEqual({ strength: 6, grenades: 0, won: true });
    expect(won.items.some((i) => i.type === "grenade")).toBe(true);

    const harder = fightGame(8);
    give(harder, "p1", "knife");
    give(harder, "p2", "blaster", 3);
    give(harder, "p3", "grenade");
    const next = go(harder);
    expect(next.expeditions[0]!.events[1]!.fight).toEqual({ strength: 6 + 3, grenades: 1, won: true });
    expect(next.items.some((i) => i.type === "grenade")).toBe(false);
    for (const id of ["p0", "p1", "p2", "p3"]) expect(player(next, id).hp).toBe(player(harder, id).hp);
  });

  it("win chance: 0 below half the creature's strength, then linear to 1 at its full strength", () => {
    // eMushpedia's tables: against 10, 5 wins 1 in 6; against 32, 16 wins 1 in 17.
    expect([winChance(4, 10), winChance(5, 10), winChance(9, 10), winChance(10, 10), winChance(12, 10)]).toEqual([0, 1 / 6, 5 / 6, 1, 1]);
    expect([winChance(15, 32), winChance(16, 32), winChance(31, 32)]).toEqual([0, 1 / 17, 16 / 17]);
    // Odd strengths round half down.
    expect([winChance(6, 15), winChance(7, 15)]).toEqual([0, 1 / 9]);
    // A crew below half always loses: no roll.
    const s = fightGame(12);
    const lost = go(s);
    expect(lost.expeditions[0]!.events[1]!.fight).toEqual({ strength: 4, grenades: 0, won: false });
    expect(lost.expeditions[0]!.events[1]!.found).toBeUndefined();
  });

  it("deals the shortfall as HP, win or lose, counting every grenade carried, spent or not", () => {
    const s = fightGame(12);
    const next = go(s);
    const event = next.expeditions[0]!.events[1]!;
    const lost = ["p0", "p1", "p2", "p3"].reduce((sum, id) => sum + player(s, id).hp - player(next, id).hp, 0);
    expect(lost).toBe(12 - 4);
    expect(event.hurt!.reduce((sum, h) => sum + h.hp, 0)).toBe(8);

    // 4 members + 2 grenades (6) = 10 against 11: both grenades go; the shortfall counts them, 1 HP.
    const close = fightGame(11);
    give(close, "p1", "grenade");
    give(close, "p2", "grenade");
    const after = go(close);
    expect(after.expeditions[0]!.events[1]!.fight).toMatchObject({ strength: 10, grenades: 2 });
    expect(after.expeditions[0]!.events[1]!.hurt!.reduce((sum, h) => sum + h.hp, 0)).toBe(1);

    // 4 members + 2 grenades against 7: one grenade is enough, but the unspent one still counts: no damage.
    const easy = fightGame(7);
    give(easy, "p1", "grenade");
    give(easy, "p2", "grenade");
    const won = go(easy);
    expect(won.expeditions[0]!.events[1]!.fight).toEqual({ strength: 7, grenades: 1, won: true });
    expect(won.expeditions[0]!.events[1]!.hurt).toBeUndefined();
  });

  it("names the creature, and a win brings its loot: steaks, artifacts, starmap fragments", () => {
    const s = fightGame(4, { provision: 2, artifact: 1, starmap: 1 });
    const next = go(s);
    const event = next.expeditions[0]!.events[1]!;
    expect(event.creature).toBe("TEST");
    expect(event.fight!.won).toBe(true);
    expect(floor(next, expedition.loot.provision)).toBe(2);
    const artifacts = next.items.filter((i) => expedition.loot.artifacts.includes(i.type) && i.at.kind === "room" && i.at.id === ICARUS);
    // The starmap fragment is one of the artifacts too.
    expect(artifacts).toHaveLength(2);
    expect(event.found!.reduce((sum, f) => sum + f.count, 0)).toBe(4);
  });

  it("the Wreck's creature has one of its random strengths; the confirmed creatures and loot", () => {
    const { creatures } = expedition;
    expect(creatures.WRECK!.strength).toEqual([8, 10, 12, 15, 18, 32]);
    expect(Object.fromEntries(Object.entries(creatures).map(([id, c]) => [id, [c.strength, c.loot]]))).toEqual({
      CHAB_CHAB: [[8], { provision: 2 }],
      BEETLETHUG: [[10], { provision: 1 }],
      SKINNER: [[12], { provision: 2 }],
      CORTIC: [[12], { artifact: 1 }],
      ZOMBI: [[15], { artifact: 1 }],
      MINDBENDER: [[18], { starmap: 1 }],
      WRECK: [[8, 10, 12, 15, 18, 32], { artifact: 1 }],
      MANKAROG: [[32], { provision: 4, artifact: 1 }],
    });
    const wreck = game({ tags: ["WRECK"], events: only({ kind: "fight", weight: 1, creature: "WRECK" }) });
    expect(creatures.WRECK!.strength).toContain(go(wreck).expeditions[0]!.events[1]!.amount);
  });

  it("a member who dies comes back as a body in the bay, with their items by default", () => {
    const s = game({ tags: ["HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    player(s, "p1").hp = expedition.fatigue;
    give(s, "p1", "knife");
    const next = go(s);
    expect(player(next, "p1").alive).toBe(false);
    expect(next.items.find((i) => i.type === "knife")!.at).toEqual({ kind: "room", id: ICARUS });
    expect(next.items.some((i) => i.of === "p1" && i.at.kind === "room" && i.at.id === ICARUS)).toBe(true);
    expect(next.expeditions[0]!.events[1]!.died).toEqual([player(s, "p1").character]);

    const lose = game({ tags: ["HOT"], events: only({ kind: "fatigue", weight: 1 }), config: { deadKeepItems: false } });
    player(lose, "p1").hp = expedition.fatigue;
    give(lose, "p1", "knife");
    const gone = go(lose);
    expect(gone.items.some((i) => i.type === "knife")).toBe(false);
    expect(gone.items.some((i) => i.of === "p1")).toBe(true);
  });

  it("stops exploring once the whole crew is dead", () => {
    const s = game({ tags: ["HOT", "HOT", "HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    for (const id of ["p0", "p1", "p2", "p3"]) player(s, id).hp = expedition.fatigue;
    const next = go(s);
    expect(next.expeditions[0]!.events).toHaveLength(2);
    expect(next.planets.p5![0]!.sectors.filter((x) => x.explored)).toHaveLength(1);
  });

  it("shows the report to its living members only; the finder and the others see nothing of it or the sectors", () => {
    const s = game({ tags: ["OXYGEN", "PREDATOR"] });
    const finderBefore = viewFor(s, "p5").planets;
    const next = go(s);
    const report = next.expeditions[0]!;
    for (const id of report.members) {
      const view = viewFor(next, id);
      expect(view.expeditions).toEqual([{ id: report.id, crew: report.crew, planet: report.planet, events: report.events }]);
      expect(JSON.stringify(view.expeditions)).not.toContain('"members"');
    }
    for (const id of ["p4", "p5"]) {
      const view = viewFor(next, id);
      expect(view.expeditions).toEqual([]);
      expect(JSON.stringify(view)).not.toContain(report.id);
      expect(view.log.some((e) => e.key === "expeditionReturned")).toBe(false);
    }
    expect(viewFor(next, "p5").planets).toEqual(finderBefore);
    expect(JSON.stringify(viewFor(next, "p5"))).not.toContain("explored");
  });
});

describe("expeditions, phases 3 and 4, slice A: events and fights", () => {
  const event = (s: GameState, i = 1) => s.expeditions[0]!.events[i]!;
  const crewIds = ["p0", "p1", "p2", "p3"];

  it("pins the confirmed tables and numbers", () => {
    const tables = Object.fromEntries(
      Object.entries(expedition.events).map(([tag, table]) => [tag, table.map((e) => [e.kind, e.weight, e.amount ?? e.creature ?? null])]),
    );
    expect(tables).toMatchObject({
      FOREST: [["harvest", 4, 2], ["again", 3, null], ["disease", 2, null], ["lost", 1, null]],
      MOUNTAIN: [["accident", 4, null], ["fuel", 3, 1], ["fatigue", 2, null], ["harvest", 1, 1]],
      SWAMP: [["disease", 4, null], ["harvest", 3, 2], ["fatigue", 2, null], ["nothing", 1, null]],
      DESERT: [["again", 4, null], ["fatigue", 3, null], ["nothing", 2, null], ["nothing", 1, null]],
      OCEAN: [["nothing", 4, null], ["provision", 3, 3], ["nothing", 2, null], ["lost", 1, null]],
      CAVE: [["fuel", 4, 2], ["accident", 3, null], ["again", 2, null], ["artifact", 1, null]],
      RUMINANT: [["provision", 4, 4], ["provision", 3, 2], ["accident", 2, null], ["fight", 1, "CHAB_CHAB"]],
      PREDATOR: [["fight", 4, "SKINNER"], ["accident", 3, null], ["nothing", 2, null], ["provision", 1, 3]],
      INTELLIGENT: [["fight", 4, "CORTIC"], ["provision", 3, 2], ["artifact", 2, null], ["lostItem", 1, null]],
      INSECT: [["accident", 4, null], ["disease", 3, null], ["provision", 2, 1], ["fight", 1, "BEETLETHUG"]],
      MANKAROG: [["kill", 4, null], ["fight", 3, "MANKAROG"], ["back", 2, null], ["artifact", 1, null]],
      COLD: [["nothing", 4, null], ["fatigue", 3, null], ["lost", 2, null], ["accident", 1, null]],
      STRONG_WIND: [["nothing", 4, null], ["fatigue", 3, null], ["nothing", 2, null], ["lostItem", 1, null]],
      SISMIC_ACTIVITY: [["nothing", 4, null], ["back", 3, null], ["accident", 2, null], ["kill", 1, null]],
      VOLCANIC_ACTIVITY: [["nothing", 4, null], ["nothing", 3, null], ["back", 2, null], ["killAll", 1, null]],
      RUINS: [["artifact", 4, null], ["nothing", 3, null], ["fight", 2, "ZOMBI"], ["accident", 1, null]],
      WRECK: [["artifact", 4, null], ["fuel", 3, 3], ["nothing", 2, null], ["fight", 1, "WRECK"]],
      CRISTAL_FIELD: [["mushTrap", 4, null], ["starmap", 3, null], ["fight", 2, "MINDBENDER"], ["lost", 1, null]],
    });
    // Every tag has a table now.
    for (const tag of PLANET_TAG_IDS) expect(expedition.events[tag]).toHaveLength(tag === "FRUIT_TREES" ? 3 : 4);
    expect([expedition.survivalProvision, expedition.mushTrapChance, expedition.loot.artifacts.length]).toEqual([1, 0.5, 9]);
  });

  it("an ungrounded living Pilot or the Antigrav propeller makes the landing Nothing", () => {
    const crash = only({ kind: "nothing", weight: 1 }, { kind: "catastrophe", weight: 1 });
    expect(event(go(game({ tags: ["FOREST"], events: crash })), 0).kind).toBe("nothing");
    const groundedPilot = game({ tags: ["FOREST"], events: crash });
    const p0 = player(groundedPilot, "p0");
    if (p0.role === "mush") p0.role = "human";
    addDisease(groundedPilot, p0, "gastroenteritis_disease");
    expect(runExpedition(structuredClone(groundedPilot), player(groundedPilot, "p1")).events[0]!.kind).toBe("catastrophe");
    const noPilot = game({ tags: ["FOREST"], events: crash });
    player(noPilot, "p0").skills = [];
    expect(runExpedition(structuredClone(noPilot), player(noPilot, "p0")).events[0]!.kind).toBe("catastrophe");
    const xxlOnly = structuredClone(noPilot);
    xxlOnly.projects.BAY_DOOR_XXL = 100;
    expect(runExpedition(xxlOnly, player(xxlOnly, "p0")).events[0]!.kind).toBe("catastrophe");
    noPilot.projects.ICARUS_ANTIGRAV_PROPELLER = 100;
    const s = structuredClone(noPilot);
    expect(runExpedition(s, player(s, "p0")).events[0]!.kind).toBe("nothing");
  });

  it("Again uses the step but leaves the sector unexplored", () => {
    const next = go(game({ tags: ["DESERT", "DESERT"], events: only({ kind: "again", weight: 1 }) }));
    expect(next.expeditions[0]!.events.map((e) => e.kind)).toEqual(["nothing", "again", "again"]);
    expect(next.planets.p5![0]!.sectors.some((x) => x.explored)).toBe(false);
  });

  it("Back ends the expedition at once, with what it found", () => {
    const s = timedGame({ tags: ["SISMIC_ACTIVITY", "SISMIC_ACTIVITY", "SISMIC_ACTIVITY"], events: only({ kind: "back", weight: 1 }) });
    // The landing is at takeoff (owner, 2026-11-17); the first sector a step later sends the crew home.
    const launched = go(s);
    const back = must(applyInput(launched, { type: "tick", at: launched.expedition!.nextAt }));
    expect(back.expedition).toBeNull();
    expect(back.expeditions[0]!.events.map((e) => e.kind)).toEqual(["nothing", "back"]);
    for (const id of crewIds) expect(player(back, id).room).toBe(ICARUS);
    expect(back.planets.p5![0]!.sectors.filter((x) => x.explored)).toHaveLength(1);
  });

  it("Lost item destroys one item carried by the crew, never a spacesuit; with nothing carried it is Nothing", () => {
    const s = game({ tags: ["STRONG_WIND"], events: only({ kind: "lostItem", weight: 1 }) });
    // Only the spacesuits everyone carries, and a knife.
    s.items = s.items.filter((i) => i.at.kind !== "player" || i.type === "space_suit");
    give(s, "p2", "knife");
    const next = go(s);
    expect(event(next)).toMatchObject({ kind: "lostItem", item: "knife" });
    expect(next.items.some((i) => i.type === "knife")).toBe(false);
    expect(next.items.some((i) => i.type === "space_suit")).toBe(true);
    // A member who stayed aboard keeps theirs.
    const empty = game({ tags: ["STRONG_WIND"], events: only({ kind: "lostItem", weight: 1 }) });
    empty.items = empty.items.filter((i) => i.at.kind !== "player" || i.type === "space_suit");
    give(empty, "p4", "knife");
    expect(event(go(empty)).kind).toBe("nothing");
  });

  it("Kill takes one member, Survival holders last; Kill all takes everyone", () => {
    const s = game({ tags: ["MANKAROG"], events: only({ kind: "kill", weight: 1 }) });
    for (const id of ["p0", "p1", "p2"]) player(s, id).skills.push("survival");
    const next = go(s);
    expect(crewIds.filter((id) => !player(next, id).alive)).toEqual(["p3"]);
    expect(event(next).died).toEqual([player(s, "p3").character]);
    const all = game({ tags: ["VOLCANIC_ACTIVITY"], events: only({ kind: "killAll", weight: 1 }) });
    for (const id of crewIds) player(all, id).skills.push("survival");
    const dead = go(all);
    expect(crewIds.every((id) => !player(dead, id).alive)).toBe(true);
    expect(dead.items.filter((i) => i.type === "corpse" && i.at.kind === "room" && i.at.id === ICARUS)).toHaveLength(4);
  });

  it("Disease reads as Nothing for now, and the sector is explored", () => {
    for (const kind of ["disease"] as const) {
      const next = go(game({ tags: ["FOREST"], events: only({ kind, weight: 1 }) }));
      expect(event(next).kind).toBe("nothing");
      expect(next.planets.p5![0]!.sectors[0]!.explored).toBe(true);
    }
  });

  it("a starmap fragment in a Crystal field; an Artifact is one of the 9; Provision gives Survival holders a steak each", () => {
    const map = go(game({ tags: ["CRISTAL_FIELD"], events: only({ kind: "starmap", weight: 1 }) }));
    expect(floor(map, expedition.loot.starmap)).toBe(1);
    const s = game({ tags: ["OCEAN"], events: only({ kind: "provision", weight: 1, amount: 3 }) });
    player(s, "p1").skills.push("survival");
    player(s, "p2").skills.push("survival");
    player(s, "p4").skills.push("survival"); // not on the expedition
    expect(floor(go(s), expedition.loot.provision)).toBe(3 + 2 * expedition.survivalProvision);
  });

  it("a Mush trap gives human members a spore each at its chance, secretly; Mush and the immune are untouched", () => {
    const s = game({ tags: ["CRISTAL_FIELD"], events: only({ kind: "mushTrap", weight: 1 }), config: { mushTrapChance: 1 } });
    for (const id of crewIds) Object.assign(player(s, id), { modifiers: [], role: "human" });
    player(s, "p1").role = "mush";
    player(s, "p2").immuneUntil = s.cycle + 2;
    for (const p of s.players) delete s.contamination[p.id];
    const next = go(s);
    expect(event(next)).toEqual({ sector: "CRISTAL_FIELD", kind: "mushTrap" });
    const spores = (id: PlayerId) => next.contamination[id] ?? 0;
    expect([spores("p0"), spores("p2"), spores("p3")]).toEqual([1, 0, 1]);
    expect(player(next, "p1").role).toBe("mush");
    // Nobody's view shows who caught a spore: not the report, not the victims' own.
    for (const id of crewIds) {
      const view = viewFor(next, id);
      expect(JSON.stringify(view.expeditions)).not.toMatch(/spore|contamin/i);
      if (player(next, id).role === "human") expect(view.you).not.toHaveProperty("contamination");
    }
    const never = game({ tags: ["CRISTAL_FIELD"], events: only({ kind: "mushTrap", weight: 1 }), config: { mushTrapChance: 0 } });
    for (const p of never.players) delete never.contamination[p.id];
    expect(Object.values(go(never).contamination).filter((n) => n > 0)).toHaveLength(0);
  });
});

describe("expeditions, phase 2: time away", () => {
  const CRAFT = expedition.craft;
  const T0 = 1_000_000;
  const step = expedition.stepMs;
  const crewIds = ["p0", "p1", "p2", "p3"];

  /** A timed game at server time T0. */
  function timed(opts: Parameters<typeof game>[0] = {}): GameState {
    const s = game({ ...opts, timed: true });
    s.now = T0;
    return s;
  }
  const tickAt = (s: GameState, at: number) => must(applyInput(s, { type: "tick", at }));
  /** Every step, one tick each, until the crew is back. */
  function runOut(s: GameState): GameState {
    while (s.expedition) s = tickAt(s, s.expedition.nextAt);
    return s;
  }

  it("pins the confirmed numbers", () => {
    expect([expedition.stepMs, expedition.dirtyChance, expedition.sectors]).toEqual([10 * 60 * 1000, 0.1, 9]);
  });

  it("takes the crew in the Icarus, a room of its own; it lands at takeoff, the first sector a step later", () => {
    const s = timed({ events: only({ kind: "nothing", weight: 1 }) });
    const next = go(s);
    for (const id of crewIds) expect(player(next, id).room).toBe(CRAFT);
    expect(next.config.rooms[CRAFT]).toEqual([]);
    // The landing is in the report at once (owner, 2026-11-17).
    expect(next.expeditions[0]!.events.map((e) => e.sector)).toEqual(["LANDING"]);
    expect(next.expedition!.nextAt).toBe(T0 + step);
    expect(nextDue(next)).toBe(T0 + step);
    // Nothing is due before then.
    expect(applyInput(next, { type: "tick", at: T0 + step - 1 }).ok).toBe(false);
    const first = tickAt(next, T0 + step);
    expect(first.expeditions[0]!.events).toHaveLength(2);
    expect(first.expedition!.nextAt).toBe(T0 + 2 * step);
  });

  it("fastExpeditions (dev cheat): 2 seconds a step, also when switched on mid-expedition", () => {
    const s = timed({ events: only({ kind: "nothing", weight: 1 }) });
    const fast = must(setCheat(s, "p4", "fastExpeditions", true));
    let t = go(fast);
    expect(t.expedition!.nextAt).toBe(T0 + FAST_EXPEDITION_STEP_MS);
    expect(viewFor(t, "p4").expedition!.returnAt).toBe(T0 + 3 * FAST_EXPEDITION_STEP_MS);
    t = runOut(t);
    expect(t.expeditions[0]!.events).toHaveLength(4);
    // Normal speed, then the cheat: the next step comes 2 seconds after the latest input, not 10 minutes after takeoff.
    let slow = go(s);
    slow = tickAt(slow, T0 + step); // the first sector
    slow = must(setCheat(slow, "p4", "fastExpeditions", true));
    expect(slow.expedition!.nextAt).toBe(T0 + step + FAST_EXPEDITION_STEP_MS);
  });

  it("explores one sector per step and is back as the last one resolves, with the loot unloaded in the bay", () => {
    const s = timed({ tags: ["FRUIT_TREES", "FRUIT_TREES", "FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 2 }) });
    let t = go(s);
    const returnAt = viewFor(t, "p4").expedition!.returnAt;
    expect(returnAt).toBe(T0 + 3 * step);
    t = tickAt(t, T0 + step); // sector 1, after the landing at takeoff
    expect(t.expeditions[0]!.events).toHaveLength(2);
    expect(t.planets.p5![0]!.sectors.filter((x) => x.explored)).toHaveLength(1);
    // The loot is in the Icarus while away; members can take it.
    expect(harvested(t, CRAFT)).toBeGreaterThan(0);
    expect(viewFor(t, "p4").expedition!.returnAt).toBe(returnAt);
    t = tickAt(t, T0 + 2 * step);
    expect(t.expedition).not.toBeNull();
    t = tickAt(t, returnAt);
    expect(t.expedition).toBeNull();
    for (const id of crewIds) expect(player(t, id).room).toBe(ICARUS);
    expect(t.items.some((i) => i.at.kind === "room" && i.at.id === CRAFT)).toBe(false);
    expect(harvested(t)).toBe(t.expeditions[0]!.events.reduce((n, e) => n + (e.kind === "harvest" ? e.amount! : 0), 0));
    expect(t.log.filter((e) => e.key === "expeditionReturned").map((e) => e.visibleTo)).toEqual(t.expeditions[0]!.members.map((id) => [id]));
  });

  it("everyone sees who is out, where and until when; members see the report live; nobody sees more", () => {
    const s = timed({ tags: ["OXYGEN", "PREDATOR"] });
    const t = tickAt(go(s), T0 + step);
    const report = t.expeditions[0]!;
    const status = { crew: report.crew, planet: "Fugunys", returnAt: T0 + 2 * step };
    for (const id of ["p4", "p5"]) {
      const view = viewFor(t, id);
      expect(view.expedition).toEqual(status);
      expect(view.expeditions).toEqual([]);
      const json = JSON.stringify(view);
      expect(json).not.toContain(report.id);
      expect(json).not.toContain("explored");
      for (const field of ["sabotaged", "sabotageNext", "nextAt", "carried"]) expect(json).not.toContain(field);
    }
    // The planet goes by name; its id stays its finder's (p5).
    expect(JSON.stringify(viewFor(t, "p4"))).not.toContain(t.expedition!.planet);
    for (const id of report.members) {
      const view = viewFor(t, id);
      expect(view.expedition).toEqual({ ...status, report: report.id });
      expect(view.expeditions).toEqual([{ id: report.id, crew: report.crew, planet: report.planet, events: report.events, away: true }]);
    }
    // The dead get the public status, never the report.
    const dead = clone(t);
    player(dead, "p1").alive = false;
    expect(viewFor(dead, "p1").expedition).toEqual(status);
    expect(viewFor(dead, "p1").expeditions).toEqual([]);
  });

  it("the Icarus is missing from its bay and can't take off again while away", () => {
    const s = timed();
    const t = go(s);
    // A Pilot walks into the bay after the takeoff.
    for (const state of [s, t]) {
      player(state, "p4").room = ICARUS;
      player(state, "p4").skills.push("pilot");
    }
    const icarus = viewFor(t, "p4").roomEquipment.find((e) => e.type === "ICARUS_COMMAND")!;
    expect(icarus.out).toBe(true);
    expect(offered(t, "p4")).not.toContainEqual(boardIcarus);
    expect(applyAction(t, "p4", boardIcarus).ok).toBe(false);
    expect(viewFor(s, "p4").roomEquipment.find((e) => e.type === "ICARUS_COMMAND")!.out).toBeUndefined();
  });

  it("aboard, members can act on items and each other but not leave, drop things or use the ship", () => {
    const s = timed();
    give(s, "p1", "bandage");
    player(s, "p2").hp -= 3;
    const t = go(s);
    const actions = offered(t, "p1");
    expect(actions.some((a) => a.type === "move")).toBe(false);
    expect(actions.some((a) => a.type === "install" || a.type === "build" || a.type === "ignite")).toBe(false);
    expect(actions).toContainEqual(expect.objectContaining({ type: "use_bandage" }));
    // Phase 5 (owner, #359): nothing can be dropped on an expedition.
    expect(actions.some((a) => a.type === "drop")).toBe(false);
  });

  it("a member who dies leaves a body in the Icarus, which comes back with it", () => {
    const s = timed({ tags: ["HOT", "HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    player(s, "p1").hp = expedition.fatigue;
    const t = tickAt(go(s), T0 + step); // the first sector
    expect(player(t, "p1").alive).toBe(false);
    expect(t.items.some((i) => i.of === "p1" && i.at.kind === "room" && i.at.id === CRAFT)).toBe(true);
    const back = runOut(t);
    expect(back.items.some((i) => i.of === "p1" && i.at.kind === "room" && i.at.id === ICARUS)).toBe(true);
  });

  it("comes back at once when every member is dead", () => {
    const s = timed({ tags: ["HOT", "HOT", "HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    for (const id of crewIds) player(s, id).hp = expedition.fatigue;
    const t = tickAt(go(s), T0 + step);
    expect(t.expedition).toBeNull();
    expect(t.expeditions[0]!.events).toHaveLength(2);
    expect(t.items.filter((i) => i.type === "corpse" && i.at.kind === "room" && i.at.id === ICARUS)).toHaveLength(4);
    expect(viewFor(t, "p4").expedition).toBeNull();
  });

  it("a landing that kills the whole crew brings it back at once, the bodies in the bay", () => {
    const s = timed({ tags: ["FOREST", "DESERT"], events: only({ kind: "nothing", weight: 1 }, { kind: "killAll", weight: 1 }) });
    player(s, "p0").skills = []; // no Pilot, so the landing isn't safe
    const t = go(s);
    expect(t.expedition).toBeNull();
    expect(t.expeditions[0]!.events.map((e) => e.kind)).toEqual(["killAll"]);
    expect(t.items.filter((i) => i.type === "corpse" && i.at.kind === "room" && i.at.id === ICARUS)).toHaveLength(4);
    expect(t.planets.p5![0]!.sectors.every((x) => !x.explored)).toBe(true);
  });

  it("living members may come back dirty", () => {
    const always = runOut(go(timed({ tags: ["FOREST"], config: { dirtyChance: 1 } })));
    for (const id of crewIds) expect(player(always, id).statuses).toContain("dirty");
    const never = runOut(go(timed({ tags: ["FOREST"], config: { dirtyChance: 0 } })));
    for (const id of crewIds) expect(player(never, id).statuses).not.toContain("dirty");
  });

  describe("stranded when the ship jumps", () => {
    const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
    const leave: Action = { type: "leave_orbit", equipment: TERMINAL };
    const travel: Action = { type: "travel", equipment: TERMINAL };
    /** Out and landed, with loot in the Icarus and a starmap on p1; p4 is Commander at the Command terminal with fuel loaded. */
    function out(magnetic = false): GameState {
      const s = timed({ tags: ["FRUIT_TREES", "FRUIT_TREES", "FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 2 }) });
      give(s, "p1", "starmap");
      if (magnetic) s.projects.AUTO_RETURN_ICARUS = 100;
      player(s, "p4").room = "COMMAND_CENTER";
      s.titles.commander = "p4";
      s.ship.combustion = 3;
      return tickAt(go(s), T0 + step); // one sector
    }
    const inCraft = (s: GameState) => s.items.filter((i) => i.at.kind === "room" && i.at.id === CRAFT);

    it("with the Icarus docked, everyone aboard is put off in its bay, each told why", () => {
      for (const action of [leave, travel]) {
        const s = timed();
        player(s, "p4").room = "COMMAND_CENTER";
        s.titles.commander = "p4";
        s.ship.combustion = 3;
        const t = aboard(s);
        if (action === travel) t.navigation.orbit = null; // travel is offered out of orbit only
        const next = must(applyAction(t, "p4", action));
        for (const id of crewIds) expect(player(next, id)).toMatchObject({ room: ICARUS, alive: true });
        const lines = next.log.slice(t.log.length);
        expect(lines.filter((e) => e.key === "icarusDisembarked").map((e) => e.visibleTo)).toEqual(crewIds.map((id) => [id]));
        expect(lines.some((e) => e.key === "icarusLeft" || e.key === "icarusLost")).toBe(false);
        expect(next.icarusLost).toBe(false);
      }
    });

    it("without Magnetic return: the crew dies, the Icarus is lost with everything in it, and never takes off again", () => {
      for (const action of [leave, travel]) {
        const before = out();
        if (action === travel) before.navigation.orbit = null; // travel is offered out of orbit only
        expect(inCraft(before).length).toBeGreaterThan(0);
        const t = must(applyAction(before, "p4", action));
        for (const id of crewIds) expect(player(t, id).alive).toBe(false);
        expect(t.expedition).toBeNull();
        expect(t.icarusLost).toBe(true);
        expect(inCraft(t)).toEqual([]);
        // Nothing came back: no bodies, loot or the members' items anywhere.
        expect(t.items.some((i) => i.type === "corpse" || i.type === "starmap" || expedition.loot.harvest.includes(i.type))).toBe(false);
        const line = t.log.find((e) => e.key === "icarusLost")!;
        expect(line).toMatchObject({ visibleTo: "all", params: { planet: "Fugunys" }, level: "warning" });
        expect(t.log.some((e) => e.key === "expeditionReturned")).toBe(false);
        expect(viewFor(t, "p5").expedition).toBeNull();
      }
    });

    it("once lost, the bay shows no Icarus and nobody can take off, even in orbit of a new planet", () => {
      const t = must(applyAction(out(), "p4", leave));
      t.navigation = { ...t.navigation, orbit: "planet-2", arriving: null };
      t.planets.p5 = [{ ...planet(["FOREST"]), id: "planet-2" }];
      const pilot = player(t, "p5");
      pilot.room = ICARUS;
      pilot.skills.push("pilot");
      expect(offered(t, "p5")).not.toContainEqual(boardIcarus);
      expect(why(t, "p5", boardIcarus)).toBe("icarus_lost");
      // The loss alone stops it: the same ship with its Icarus offers boarding, then the takeoff.
      const control = clone(t);
      control.icarusLost = false;
      expect(offered(control, "p5")).toContainEqual(boardIcarus);
      expect(offered(must(applyAction(control, "p5", boardIcarus)), "p5")).toContainEqual(takeoff);
      expect(viewFor(t, "p5").roomEquipment.find((e) => e.type === "ICARUS_COMMAND")!.out).toBe(true);
    });

    it("with Magnetic return: the crew is back at once, the sectors left skipped, the loot in the bay", () => {
      const before = out(true);
      const loot = inCraft(before).length;
      const t = must(applyAction(before, "p4", leave));
      expect(t.expedition).toBeNull();
      expect(t.icarusLost).toBe(false);
      for (const id of crewIds) {
        expect(player(t, id).alive).toBe(true);
        expect(player(t, id).room).toBe(ICARUS);
      }
      expect(t.expeditions[0]!.events).toHaveLength(2);
      expect(harvested(t)).toBe(loot);
      expect(t.items.find((i) => i.type === "starmap")!.at).toEqual({ kind: "player", id: "p1" });
      expect(t.log.find((e) => e.key === "icarusRecalled")).toMatchObject({ visibleTo: "all", params: { planet: "Fugunys" } });
      expect(t.log.filter((e) => e.key === "expeditionReturned")).toHaveLength(crewIds.length);
    });

    it("a jump with no crew out changes nothing for the Icarus", () => {
      const s = timed();
      player(s, "p4").room = "COMMAND_CENTER";
      s.titles.commander = "p4";
      s.ship.combustion = 3;
      const t = must(applyAction(s, "p4", leave));
      expect(t.icarusLost).toBe(false);
      expect(t.log.some((e) => e.key === "icarusLost" || e.key === "icarusRecalled")).toBe(false);
    });
  });

  it("a step due before a bar ends happens first, in the same tick", () => {
    const s = timed({ tags: ["FOREST"], events: only({ kind: "nothing", weight: 1 }) });
    const t = go(s);
    // p4 starts a timed action that ends after the first sector is due.
    player(t, "p4").current = { action: { type: "ready" }, adjustment: { ap: 0, mp: 0 }, since: T0, until: T0 + step + 5 };
    const after = tickAt(t, T0 + step + 5);
    expect(after.expeditions[0]!.events).toHaveLength(2);
    expect(player(after, "p4").current).toBeNull();
  });
});

describe("expeditions, phase 3, slice B: getting lost", () => {
  const T0 = 1_000_000;
  const crewIds = ["p0", "p1", "p2", "p3"];
  const lostRule: ExpeditionEventRule = { kind: "lost", weight: 1 };
  const event = (s: GameState, i = 1) => s.expeditions[0]!.events[i]!;
  const rule = (kind: ExpeditionEventRule["kind"]): ExpeditionEventRule[] => [{ kind, weight: 1 }];
  const tickAt = (s: GameState, at: number) => must(applyInput(s, { type: "tick", at }));
  const lostIn = (s: GameState) => s.players.filter((p) => p.alive && p.room.startsWith("LOST:")).map((p) => p.id);
  const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
  const leave: Action = { type: "leave_orbit", equipment: TERMINAL };

  /** p3 already lost on the planet (with a knife on the ground), which has a Lost sector; p0, p1 and p2 in the bay. */
  function withLost(lostEvents: ExpeditionEventRule[], opts: Parameters<typeof game>[0] = {}): GameState {
    const s = game({ tags: ["LOST"], ...opts, events: { LOST: lostEvents, ...opts.events } });
    player(s, "p3").room = lostPlace("p3");
    s.planets.p5![0]!.sectors[0]!.known = true;
    s.items.push({ id: "item-dropped", type: "knife", at: { kind: "room", id: lostPlace("p3") } });
    return s;
  }

  it("pins the Lost sector's table and weight", () => {
    expect(expedition.events.LOST).toEqual([
      { kind: "found", weight: 4 },
      { kind: "found", weight: 3 },
      { kind: "again", weight: 2 },
      { kind: "foundDead", weight: 1, negative: true },
    ]);
    expect(PLANET_TAG_IDS).toContain("LOST");
  });

  it("one member stays on the planet in a place of their own; the planet gains a revealed Lost sector; NERON tells everyone", () => {
    const next = go(game({ tags: ["COLD"], events: { ...only(lostRule), LOST: rule("again") } }));
    const lost = lostIn(next);
    expect(lost).toHaveLength(1);
    const p = player(next, lost[0]!);
    expect(p.room).toBe(lostPlace(p.id));
    for (const id of crewIds.filter((id) => id !== p.id)) expect(player(next, id).room).toBe(ICARUS);
    expect(event(next)).toEqual({ sector: "COLD", kind: "lost", who: p.character });
    expect(next.planets.p5![0]!.sectors).toContainEqual({ tag: "LOST", known: true });
    expect(viewFor(next, "p5").planets[0]!.sectors).toContain("LOST");
    expect(next.log.find((e) => e.key === "crewLost")).toMatchObject({ visibleTo: "all", params: { name: p.character, planet: "Fugunys" }, level: "warning" });
    // A public alert while they are lost, to everyone; they are not back, so no return line for them.
    for (const id of ["p0", "p4", "p5"]) expect(viewFor(next, id).lost).toEqual([{ name: p.character, planet: "Fugunys" }]);
    const returned = next.log.filter((e) => e.key === "expeditionReturned").map((e) => e.visibleTo);
    expect(returned).toHaveLength(3);
    expect(returned.flat()).not.toContain(p.id);
  });

  it("a lost member's report stops at the line where they got lost; lostAt never goes out", () => {
    const s = timedGame({ tags: ["COLD", "DESERT"], events: { ...only({ kind: "nothing", weight: 1 }), COLD: [lostRule], LOST: rule("again") } });
    const launched = go(s);
    launched.expedition!.sectors = [0, 1];
    let t = tickAt(launched, launched.expedition!.nextAt); // COLD: someone gets lost
    const lost = lostIn(t)[0]!;
    // Away still, with the rest of the crew; the lost member has no report id and their report isn't "under way".
    expect(t.expedition).not.toBeNull();
    expect(viewFor(t, lost).expedition!.report).toBeUndefined();
    expect(viewFor(t, lost).expeditions[0]!.away).toBeUndefined();
    t = tickAt(t, t.expedition!.nextAt);
    expect(t.expedition).toBeNull();
    expect(t.expeditions[0]!.events).toHaveLength(3);
    expect(viewFor(t, lost).expeditions[0]!.events).toHaveLength(2);
    expect(viewFor(t, lost).expeditions[0]!.events[1]!.kind).toBe("lost");
    for (const id of crewIds.filter((id) => id !== lost)) expect(viewFor(t, id).expeditions[0]!.events).toHaveLength(3);
    for (const p of t.players) expect(JSON.stringify(viewFor(t, p.id))).not.toContain("lostAt");
    // Nor their place, which names them, in anyone's `unidentified`.
    for (const p of t.players) expect(viewFor(t, p.id).unidentified.filter((r) => r.startsWith("LOST"))).toEqual([]);
  });

  it("the lost can act on their own items only: no doors, nothing aboard the ship", () => {
    const next = go(game({ tags: ["COLD"], events: { ...only(lostRule), LOST: rule("again") } }));
    const id = lostIn(next)[0]!;
    const types = new Set(offered(next, id).map((a) => a.type));
    for (const type of ["move", "icarus_takeoff", "ignite", "build", "install"]) expect(types.has(type as Action["type"])).toBe(false);
    expect(viewFor(next, id).roomEquipment).toEqual([]);
    // Nobody else is there, so their room speech and room log reach nobody.
    expect(viewFor(next, id).players.filter((p) => p.room === player(next, id).room)).toEqual([]);
  });

  it("the last member to get lost ends the expedition: the Icarus comes back with the loot", () => {
    const s = timedGame({ tags: ["COLD", "COLD"], events: { ...only(lostRule), LOST: rule("again") } });
    for (const id of ["p1", "p2", "p3"]) player(s, id).room = "LABORATORY";
    const launched = go(s);
    const t = tickAt(launched, launched.expedition!.nextAt);
    expect(t.expedition).toBeNull();
    expect(lostIn(t)).toEqual(["p0"]);
    expect(t.expeditions[0]!.events).toHaveLength(2);
  });

  it("Found: the lost member joins the crew, over the cap, with what they left on the ground, and comes back", () => {
    const s = withLost(rule("found"));
    player(s, "p4").room = ICARUS; // a full crew of 4 without p3
    const next = go(s);
    const p3 = player(next, "p3");
    expect(event(next)).toEqual({ sector: "LOST", kind: "found", who: p3.character });
    expect(p3.alive).toBe(true);
    expect(p3.room).toBe(ICARUS);
    expect(next.expeditions[0]!.members).toHaveLength(5);
    expect(next.expeditions[0]!.members.at(-1)).toBe("p3");
    expect(next.expeditions[0]!.crew).toContain(p3.character);
    expect(next.items.find((i) => i.id === "item-dropped")!.at).toEqual({ kind: "room", id: ICARUS });
    expect(viewFor(next, "p5").lost).toEqual([]);
    // They are now a member, so they see this report (whole) and get the return line.
    expect(viewFor(next, "p3").expeditions.at(-1)!.events).toEqual(next.expeditions[0]!.events);
    expect(next.planets.p5![0]!.sectors[0]!.explored).toBe(true);
  });

  it("Found dead: they die there, and the crew brings back the body; a Tracker cancels it", () => {
    const next = go(withLost(rule("foundDead")));
    expect(event(next)).toMatchObject({ kind: "foundDead", who: player(next, "p3").character });
    expect(player(next, "p3").alive).toBe(false);
    expect(next.items.find((i) => i.type === "corpse" && i.of === "p3")!.at).toEqual({ kind: "room", id: ICARUS });
    expect(next.items.find((i) => i.id === "item-dropped")!.at).toEqual({ kind: "room", id: ICARUS });
    expect(next.expeditions[0]!.members).not.toContain("p3");
    // Without deadKeepItems only the body comes back.
    const bare = go(withLost(rule("foundDead"), { config: { deadKeepItems: false } }));
    expect(bare.items.some((i) => i.id === "item-dropped")).toBe(false);
    expect(bare.items.some((i) => i.type === "corpse" && i.of === "p3")).toBe(true);
    // A Tracker with the crew: Found dead can't be drawn, so the sector rolls among the others, or is Nothing.
    const tracked = withLost([{ kind: "foundDead", weight: 100 }, { kind: "found", weight: 1 }]);
    player(tracked, "p1").skills.push("hunt");
    expect(event(go(tracked)).kind).toBe("found");
    const onlyDead = withLost(rule("foundDead"));
    player(onlyDead, "p1").skills.push("hunt");
    const safe = go(onlyDead);
    expect(event(safe).kind).toBe("nothing");
    expect(player(safe, "p3").alive).toBe(true);
  });

  it("a Lost sector with nobody lost is Nothing", () => {
    const s = withLost(rule("found"));
    player(s, "p3").alive = false;
    expect(event(go(s)).kind).toBe("nothing");
  });

  it("a later step of the same expedition can find them: the steps left are drawn again with the Lost sector", () => {
    const s = timedGame({ tags: ["COLD", "DESERT"], events: { ...only({ kind: "nothing", weight: 1 }), COLD: [lostRule], LOST: rule("found") } });
    const launched = go(s);
    launched.planets.p5![0]!.sectors[1]!.explored = true;
    launched.expedition!.sectors = [0, 1]; // two steps; DESERT is already explored, so the second is drawn again
    let t = tickAt(launched, launched.expedition!.nextAt);
    const lost = lostIn(t)[0]!;
    expect(t.expedition!.sectors).toEqual([2]); // the new Lost sector
    t = tickAt(t, t.expedition!.nextAt);
    expect(t.expedition).toBeNull();
    expect(t.expeditions[0]!.events.map((e) => e.kind)).toEqual(["nothing", "lost", "found"]);
    expect(player(t, lost).room).toBe(ICARUS);
    // Found by their own expedition: they see the whole report again.
    expect(viewFor(t, lost).expeditions[0]!.events).toHaveLength(3);
    expect(t.expeditions[0]!.lostAt).toEqual({});
  });

  it("when the ship leaves orbit the lost die there, Magnetic return or not, and nothing of theirs comes back", () => {
    for (const magnetic of [false, true]) {
      const s = withLost(rule("again"));
      if (magnetic) s.projects.AUTO_RETURN_ICARUS = 100;
      player(s, "p4").room = "COMMAND_CENTER";
      s.titles.commander = "p4";
      s.ship.combustion = 3;
      give(s, "p3", "blaster", 3);
      const t = must(applyAction(s, "p4", leave));
      expect(player(t, "p3").alive).toBe(false);
      expect(t.items.some((i) => i.id === "item-dropped" || i.type === "blaster" || (i.type === "corpse" && i.of === "p3"))).toBe(false);
      expect(viewFor(t, "p5").lost).toEqual([]);
      expect(t.icarusLost).toBe(false); // the Icarus wasn't out
    }
  });
});

describe("expeditions, phase 3, slice C: gear and spacesuits", () => {
  const event = (s: GameState, i = 1) => s.expeditions[0]!.events[i]!;
  const rule = (kind: ExpeditionEventRule["kind"], amount?: number): ExpeditionEventRule => ({ kind, weight: 1, ...(amount !== undefined && { amount }) });
  const strip = (s: GameState, type: string) => (s.items = s.items.filter((i) => !(i.type === type && i.at.kind === "player")));
  const { gear } = expedition;
  /** How often, over `runs` fixed seeds (so deterministic), `hit` holds on the state after a takeoff. */
  function rate(s: GameState, hit: (next: GameState) => boolean, runs: number): number {
    let hits = 0;
    for (let seed = 1; seed <= runs; seed++) {
      if (hit(go({ ...s, rng: seed * 7919 }))) hits++;
    }
    return hits / runs;
  }

  it("pins the confirmed gear, its numbers, the start list and the recipes", () => {
    expect(gear).toEqual({
      spacesuit: "space_suit",
      compass: "quad_compass",
      rope: { item: "rope", tags: ["CAVE", "MOUNTAIN", "SISMIC_ACTIVITY"] },
      drill: { item: "drill", fuelFactor: 2 },
      finders: [
        { item: "echo_sounder", tags: ["HYDROCARBON"], factor: 5 },
        { item: "thermosensor", tags: ["INSECT", "MANKAROG", "LOST", "PREDATOR", "RUMINANT", "INTELLIGENT"], factor: 5 },
      ],
      babel: { item: "trad_module", tag: "INTELLIGENT", artifactFactor: 2 },
      whiteFlag: { item: "white_flag", tag: "INTELLIGENT" },
    });
    const count = (type: string, pool: "storage" | "daedalus") =>
      DEFAULT_CONFIG.startItems.filter((i) => i.type === type && "pool" in i && i.pool === pool).length;
    expect(count("space_suit", "daedalus")).toBe(6);
    expect([count("quad_compass", "storage"), count("rope", "storage"), count("drill", "storage")]).toEqual([1, 2, 1]);
    expect(count("old_shirt", "daedalus")).toBe(1);
    const randomBp = DEFAULT_CONFIG.startItems.find((i) => i.type === "blueprint" && i.buildsWeights);
    for (const b of ["ECHO_SOUNDER", "HEAT_SEEKER", "TRAD_MODULE", "WHITE_FLAG"]) expect(randomBp?.buildsWeights?.[b]).toBeGreaterThan(0);
    expect(BLUEPRINTS.ECHO_SOUNDER).toEqual({ needs: ["metal_scraps", "plastic_scraps"], makes: { item: "echo_sounder" } });
    expect(BLUEPRINTS.HEAT_SEEKER).toEqual({ needs: ["metal_scraps", "plastic_scraps"], makes: { item: "thermosensor" } });
    expect(BLUEPRINTS.TRAD_MODULE).toEqual({ needs: ["metal_scraps", "plastic_scraps"], makes: { item: "trad_module" } });
    expect(BLUEPRINTS.WHITE_FLAG).toEqual({ needs: ["old_shirt", "soap"], makes: { item: "white_flag" } });
  });

  it("with no Oxygen sector, the takeoff puts off in the bay anyone aboard without a working spacesuit, each told why", () => {
    const s = aboard(game({ tags: ["HOT"], events: only(rule("fatigue")) }));
    // After boarding, p2's spacesuit breaks (green jelly, say) and p3 hands theirs to p4.
    s.items.find((i) => i.id === "item-suit-p2")!.broken = true;
    s.items.find((i) => i.id === "item-suit-p3")!.at = { kind: "player", id: "p4" };
    const next = must(applyAction(s, "p0", takeoff));
    const report = next.expeditions[0]!;
    expect(report.members).toEqual(["p0", "p1"]);
    const names = (ids: string[]) => ids.map((id) => player(s, id).character);
    expect(report.events.find((e) => e.sector === "HOT")!.hurt!.map((h) => h.name).sort()).toEqual(names(["p0", "p1"]).sort());
    for (const id of ["p2", "p3"]) {
      expect(player(next, id).room).toBe(ICARUS);
      expect(player(next, id).hp).toBe(player(s, id).hp);
    }
    const lines = next.log.slice(s.log.length);
    expect(lines.filter((e) => e.key === "icarusNoSpacesuit")).toEqual(["p2", "p3"].map((id) => expect.objectContaining({ visibleTo: [id], params: { planet: "Fugunys" } })));
    // Quietly: no public line for them, and no report line either.
    expect(lines.filter((e) => e.visibleTo === "all").map((e) => e.key)).toEqual(["icarusTakeoff"]);
    expect(report.events.some((e) => e.kind === "noSpacesuit" || e.kind === "grounded")).toBe(false);
    // An Oxygen sector anywhere on the planet, revealed or not: no spacesuit needed, nobody is put off.
    const air = go(game({ tags: ["OXYGEN", "HOT"], suits: false }));
    expect(air.expeditions[0]!.members).toHaveLength(4);
    expect(air.log.some((e) => e.key === "icarusNoSpacesuit")).toBe(false);
  });

  it("with no Oxygen sector, a launcher without a working spacesuit is refused; someone else aboard can launch", () => {
    const s = aboard(game({ tags: ["HOT", "FOREST"] }));
    s.items.find((i) => i.id === "item-suit-p0")!.broken = true;
    expect(offered(s, "p0")).not.toContainEqual(takeoff);
    expect(why(s, "p0", takeoff)).toBe("no_spacesuit");
    const next = must(applyAction(s, "p1", takeoff));
    expect(next.expeditions[0]!.members).toEqual(["p1", "p2", "p3"]);
    expect(player(next, "p0").room).toBe(ICARUS);
  });

  it("a spacesuit that breaks once the expedition is under way changes nothing", () => {
    const s = timedGame({ tags: ["HOT", "COLD"], events: only(rule("fatigue")) });
    const t = go(s);
    t.items.find((i) => i.id === "item-suit-p1")!.broken = true;
    const next = must(applyInput(t, { type: "tick", at: t.expedition!.nextAt }));
    expect(player(next, "p1").room).toBe(CRAFT);
    expect(next.expeditions[0]!.events[1]!.hurt!.map((h) => h.name)).toContain(player(s, "p1").character);
  });

  it("a fight counts only the crew's weapons, not those of someone left in the bay without a spacesuit", () => {
    const s = fightGame(6);
    strip(s, "space_suit");
    give(s, "p0", "space_suit");
    give(s, "p1", "knife");
    expect(go(s).expeditions[0]!.events.find((e) => e.kind === "fight")!.fight!.strength).toBe(1);
  });

  it("a compass cancels Again; its bearer can't get lost, and Lost is cancelled when everyone has one", () => {
    const again = game({ tags: ["DESERT"], events: { DESERT: [rule("again"), rule("fatigue")] } });
    give(again, "p2", "quad_compass");
    expect(event(go(again)).kind).toBe("fatigue");
    const alone = game({ tags: ["DESERT"], events: { DESERT: [rule("again")] } });
    give(alone, "p2", "quad_compass");
    const next = go(alone);
    expect(event(next).kind).toBe("nothing");
    expect(next.planets.p5![0]!.sectors[0]!.explored).toBe(true);

    const lost = game({ tags: ["COLD"], events: { COLD: [rule("lost")], LOST: [rule("nothing")] } });
    for (const id of ["p0", "p1", "p2"]) give(lost, id, "quad_compass");
    expect(event(go(lost)).who).toBe(player(lost, "p3").character);
    give(lost, "p3", "quad_compass");
    expect(event(go(lost)).kind).toBe("nothing");
  });

  it("a rope spares its bearer an Accident in a Cave, Mountain or Seismic sector, and nowhere else", () => {
    const s = game({ tags: ["CAVE"], events: only(rule("accident")) });
    for (const id of ["p0", "p1", "p2", "p3"]) give(s, id, "rope");
    const next = go(s);
    expect(event(next).avoided).toMatchObject({ item: "rope" });
    expect(event(next).hurt).toBeUndefined();
    expect(next.players.every((p) => p.hp === player(s, p.id).hp)).toBe(true);
    const ruins = game({ tags: ["RUINS"], events: only(rule("accident")) });
    for (const id of ["p0", "p1", "p2", "p3"]) give(ruins, id, "rope");
    expect(event(go(ruins)).hurt).toHaveLength(1);
  });

  it("a drill doubles the fuel found; copies don't stack", () => {
    const s = game({ tags: ["HYDROCARBON"], events: { HYDROCARBON: [rule("fuel", 3)] } });
    s.ship.fuel = 0;
    give(s, "p1", "drill");
    give(s, "p2", "drill");
    expect(go(s).ship.fuel).toBe(3 * gear.drill.fuelFactor);
  });

  it("an echolocator or thermosensor makes its sectors 5x as likely to be picked", () => {
    const pick = (tags: Planet["sectors"][number]["tag"][], item?: string) => {
      const s = game({ tags, config: { sectors: 1 } });
      if (item) give(s, "p1", item);
      return rate(s, (n) => n.planets.p5![0]!.sectors[0]!.explored === true, 200);
    };
    // Equal explo weights: 1/2 without, 5/6 with.
    expect(pick(["HYDROCARBON", "FOREST"])).toBeLessThan(0.6);
    expect(pick(["HYDROCARBON", "FOREST"], "echo_sounder")).toBeGreaterThan(0.75);
    expect(pick(["INSECT", "FOREST"], "thermosensor")).toBeGreaterThan(0.75);
    expect(pick(["INSECT", "FOREST"], "echo_sounder")).toBeLessThan(0.6);
  });

  it("a Babel module doubles Artifact's odds in Intelligent life; a white flag cancels Fight there only", () => {
    const babel = (item?: string) => {
      const s = game({ tags: ["INTELLIGENT"], events: { INTELLIGENT: [rule("artifact"), rule("nothing")] } });
      if (item) give(s, "p1", item);
      return rate(s, (n) => event(n).kind === "artifact", 400);
    };
    // 1/2 without, 2/3 with.
    expect(babel()).toBeLessThan(0.58);
    expect(babel("trad_module")).toBeGreaterThan(0.6);

    const fight: ExpeditionEventRule = { kind: "fight", weight: 1, creature: "CORTIC" };
    const flag = game({ tags: ["INTELLIGENT", "PREDATOR"], events: { INTELLIGENT: [fight], PREDATOR: [fight] } });
    give(flag, "p1", "white_flag");
    const events = go(flag).expeditions[0]!.events;
    expect(events.find((e) => e.sector === "INTELLIGENT")!.kind).toBe("nothing");
    expect(events.find((e) => e.sector === "PREDATOR")!.kind).toBe("fight");
  });
});

describe("expeditions, phase 4, slice D: skills", () => {
  const T0 = 1_000_000;
  const crewIds = ["p0", "p1", "p2", "p3"];
  const event = (s: GameState, i = 1) => s.expeditions[0]!.events[i]!;
  const rule = (kind: ExpeditionEventRule["kind"], extra: Partial<ExpeditionEventRule> = {}): ExpeditionEventRule => ({ kind, weight: 1, ...extra });
  const tickAt = (s: GameState, at: number) => must(applyInput(s, { type: "tick", at }));
  const strengthIn = (s: GameState) => go(s).expeditions[0]!.events.find((e) => e.kind === "fight")!.fight!.strength;
  const uTurn: Action = { type: "u_turn" };
  const sabotage: Action = { type: "sabotage_expedition" };
  const contactCentauri = (s: GameState) => rebelCallAt(s, "CENTAURI", 100);

  it("pins the confirmed numbers and the negative events", () => {
    expect([expedition.shooterBonus, expedition.sprinterSectors, expedition.centauri, expedition.uTurn.cost.ap]).toEqual([1, 1, { item: "blaster", bonus: 1 }, 2]);
    const negative = Object.fromEntries(Object.entries(expedition.events).map(([tag, table]) => [tag, table.filter((e) => e.negative).map((e) => [e.kind, e.amount ?? e.creature ?? null])]));
    expect(negative).toEqual({
      LANDING: [["fatigue", null], ["accident", null], ["catastrophe", null]],
      OXYGEN: [["oxygen", 8], ["nothing", null]],
      HYDROCARBON: [["fuel", 3]],
      FRUIT_TREES: [],
      HOT: [["fatigue", null], ["accident", null]],
      FOREST: [["disease", null], ["lost", null]],
      MOUNTAIN: [["accident", null], ["fatigue", null]],
      SWAMP: [["disease", null], ["fatigue", null]],
      DESERT: [["fatigue", null]],
      OCEAN: [["lost", null]],
      CAVE: [["accident", null]],
      RUMINANT: [["accident", null], ["fight", "CHAB_CHAB"]],
      PREDATOR: [["fight", "SKINNER"], ["accident", null]],
      INTELLIGENT: [["fight", "CORTIC"], ["lostItem", null]],
      INSECT: [["accident", null], ["disease", null], ["fight", "BEETLETHUG"]],
      MANKAROG: [["kill", null], ["fight", "MANKAROG"]],
      COLD: [["fatigue", null], ["lost", null], ["accident", null]],
      STRONG_WIND: [["fatigue", null], ["lostItem", null]],
      SISMIC_ACTIVITY: [["accident", null], ["kill", null]],
      VOLCANIC_ACTIVITY: [["killAll", null]],
      RUINS: [["accident", null]],
      WRECK: [["fight", "WRECK"]],
      CRISTAL_FIELD: [["mushTrap", null]],
      LOST: [["foundDead", null]],
    });
  });

  it("a Diplomat, Polymath or Polyvant cancels Fight in Intelligent life only", () => {
    const fight = rule("fight", { creature: "CORTIC" });
    for (const skill of ["diplomacy", "polymath", "skilful"] as const) {
      const s = game({ tags: ["INTELLIGENT", "PREDATOR"], events: { INTELLIGENT: [fight], PREDATOR: [fight] } });
      player(s, "p2").skills.push(skill);
      const events = go(s).expeditions[0]!.events;
      expect(events.find((e) => e.sector === "INTELLIGENT")!.kind).toBe("nothing");
      expect(events.find((e) => e.sector === "PREDATOR")!.kind).toBe("fight");
    }
  });

  it("a Polymath or Polyvant (skilful) harvests as a Botanist: one more fruit, not stacking", () => {
    const harvest = (skills: ("botanic" | "polymath" | "skilful")[]) => {
      const s = game({ tags: ["FRUIT_TREES"], events: { FRUIT_TREES: [rule("harvest", { amount: 2 })] } });
      skills.forEach((skill, i) => player(s, `p${i + 1}`).skills.push(skill));
      return event(go(s)).amount;
    };
    expect([harvest([]), harvest(["polymath"]), harvest(["skilful"]), harvest(["botanic", "polymath"]), harvest(["botanic", "skilful"])]).toEqual([
      2,
      2 + expedition.botanistBonus,
      2 + expedition.botanistBonus,
      2 + expedition.botanistBonus,
      2 + expedition.botanistBonus,
    ]);
  });

  it("each Shooter carrying a working gun adds 1, once each; not with a knife, an empty gun or a gun someone else carries", () => {
    // Four members: strength 4 before weapons.
    const s = fightGame(30);
    player(s, "p1").skills.push("gunman");
    expect(strengthIn(clone(s))).toBe(4);
    const knife = clone(s);
    give(knife, "p1", "knife");
    expect(strengthIn(knife)).toBe(5);
    const empty = clone(s);
    give(empty, "p1", "blaster", 0);
    expect(strengthIn(empty)).toBe(4);
    const other = clone(s);
    give(other, "p2", "blaster", 3);
    expect(strengthIn(other)).toBe(5);
    const two = clone(s);
    give(two, "p1", "blaster", 3);
    give(two, "p1", "blaster", 3);
    expect(strengthIn(two)).toBe(4 + 2 + expedition.shooterBonus);
    const pair = clone(two);
    player(pair, "p2").skills.push("gunman");
    give(pair, "p2", "machine_gun", 12);
    expect(strengthIn(pair)).toBe(4 + 2 + 2 + 2 * expedition.shooterBonus);
  });

  it("the guns are every weapon but the knife (melee) and the grenade (thrown)", () => {
    const guns = Object.entries(DEFAULT_CONFIG.weapons.types).filter(([, w]) => w.gun).map(([type]) => type);
    expect(guns.sort()).toEqual(["blaster", "customized_blaster", "machine_gun", "missile_launcher", "natamy_riffle", "sniper_riffle"]);
  });

  it("with the Centauri base contacted, each working blaster adds 1", () => {
    const s = fightGame(30);
    give(s, "p1", "blaster", 3);
    give(s, "p2", "blaster", 3);
    give(s, "p3", "blaster", 0);
    expect(strengthIn(clone(s))).toBe(6);
    contactCentauri(s);
    expect(strengthIn(clone(s))).toBe(6 + 2 * expedition.centauri.bonus);
    // A call not decoded to the end does nothing.
    const partial = fightGame(30);
    give(partial, "p1", "blaster", 3);
    rebelCallAt(partial, "CENTAURI", 99);
    expect(strengthIn(partial)).toBe(5);
  });

  it("each Sprinter aboard adds a sector; one left in the bay without a spacesuit doesn't", () => {
    const tags = Array.from({ length: 14 }, () => "HOT" as const);
    const sectors = (s: GameState) => go(s).expeditions[0]!.events.filter((e) => e.sector === "HOT").length;
    const s = game({ tags, events: only(rule("nothing")) });
    expect(sectors(clone(s))).toBe(expedition.sectors);
    player(s, "p1").skills.push("sprint");
    player(s, "p2").skills.push("sprint");
    expect(sectors(clone(s))).toBe(expedition.sectors + 2 * expedition.sprinterSectors);
    s.items = s.items.filter((i) => i.id !== "item-suit-p2");
    expect(sectors(s)).toBe(expedition.sectors + expedition.sprinterSectors);
  });

  it("U-turn: a holder with the crew ends the expedition for 2 AP; the crew comes back with what it found; a report line, nothing public", () => {
    const s = timedGame({ tags: ["OXYGEN", "FRUIT_TREES", "HOT"], events: only(rule("harvest", { amount: 1 })) });
    player(s, "p1").skills.push("fast_backward");
    const out = go(s);
    // Only the holder, only while away.
    expect(offered(s, "p1")).not.toContainEqual(uTurn);
    expect(offered(out, "p2")).not.toContainEqual(uTurn);
    expect(applyAction(out, "p2", uTurn).ok).toBe(false);
    expect(option(out, "p1", uTurn)?.cost.ap).toBe(expedition.uTurn.cost.ap);
    const first = tickAt(out, T0 + expedition.stepMs);
    const back = must(applyAction(first, "p1", uTurn));
    expect(back.expedition).toBeNull();
    expect(player(back, "p1").ap).toBe(player(first, "p1").ap - expedition.uTurn.cost.ap);
    for (const id of crewIds) expect(player(back, id).room).toBe(ICARUS);
    expect(harvested(back)).toBe(1);
    expect(back.planets.p5![0]!.sectors.filter((x) => x.explored)).toHaveLength(1);
    expect(back.expeditions[0]!.events.at(-1)).toEqual({ sector: "U_TURN", kind: "uTurn", who: player(s, "p1").character });
    expect(back.log.slice(first.log.length).filter((e) => e.visibleTo === "all")).toEqual([]);
    expect(offered(back, "p1")).not.toContainEqual(uTurn);
  });

  it("U-turn: anyone lost stays lost, and the lost holder can't turn the crew back", () => {
    const s = timedGame({ tags: ["COLD", "HOT", "HOT"], events: { ...only(rule("nothing")), COLD: [rule("lost")] } });
    for (const id of crewIds) player(s, id).skills.push("fast_backward");
    let t = tickAt(go(s), T0 + expedition.stepMs);
    while (!t.players.some((p) => p.room.startsWith("LOST:"))) t = tickAt(t, t.expedition!.nextAt);
    const lost = t.players.find((p) => p.room.startsWith("LOST:"))!;
    expect(offered(t, lost.id)).not.toContainEqual(uTurn);
    const by = crewIds.find((id) => id !== lost.id)!;
    const back = must(applyAction(t, by, uTurn));
    expect(player(back, lost.id).room).toBe(lostPlace(lost.id));
  });

  it("Traitor: a free, secret Sabotage once per expedition; only the next sector draws negative events", () => {
    // Harvest is all but certain unless sabotaged.
    const s = timedGame({ tags: ["HOT", "HOT"], events: { ...only(rule("nothing")), HOT: [rule("harvest", { amount: 1, weight: 1_000_000 }), rule("fatigue", { negative: true })] } });
    for (const p of s.players) p.role = "human";
    player(s, "p1").role = "mush";
    player(s, "p1").skills.push("traitor");
    expect(offered(s, "p1")).not.toContainEqual(sabotage);
    const out = go(s);
    expect(offered(out, "p2")).not.toContainEqual(sabotage);
    expect(option(out, "p1", sabotage)?.cost).toEqual({ ap: 0, mp: 0 });
    const done = must(applyAction(out, "p1", sabotage));
    // Nothing records it anywhere but the flags: no log line, no AP, no action history.
    expect(done.expedition).toMatchObject({ sabotaged: true, sabotageNext: true });
    const unflagged = clone(done);
    unflagged.expedition!.sabotaged = false;
    unflagged.expedition!.sabotageNext = false;
    expect(unflagged).toEqual(out);
    // No view shows a trace of it, the Traitor's included (but for the action no longer offered).
    for (const p of done.players) {
      const before = { ...viewFor(out, p.id), actions: [] };
      const after = { ...viewFor(done, p.id), actions: [] };
      expect(after).toEqual(before);
      expect(JSON.stringify(viewFor(done, p.id))).not.toMatch(/sabotaged|sabotageNext/);
    }
    // Once per expedition.
    expect(offered(done, "p1")).not.toContainEqual(sabotage);
    expect(applyAction(done, "p1", sabotage).ok).toBe(false);
    const one = tickAt(done, done.expedition!.nextAt);
    expect(one.expedition).toMatchObject({ sabotaged: true, sabotageNext: false });
    expect(offered(one, "p1")).not.toContainEqual(sabotage);
    const t = tickAt(one, one.expedition!.nextAt);
    expect(t.expeditions[0]!.events.filter((e) => e.sector === "HOT").map((e) => e.kind)).toEqual(["fatigue", "harvest"]);
  });

  it("U-turn and Traitor holders still with the crew see the next sector's tag, only while it is next; nobody else does", () => {
    const s = timedGame({ tags: ["HOT", "COLD", "FOREST"], events: only(rule("nothing")) });
    player(s, "p1").skills.push("fast_backward");
    player(s, "p2").skills.push("traitor");
    player(s, "p5").skills.push("fast_backward"); // not aboard
    const out = go(s);
    const tagOf = (t: GameState) => t.planets.p5![0]!.sectors[t.expedition!.sectors[0]!]!.tag;
    for (const id of ["p1", "p2"]) expect(viewFor(out, id).expedition!.next).toBe(tagOf(out));
    for (const id of ["p0", "p3", "p4", "p5"]) expect(viewFor(out, id).expedition).not.toHaveProperty("next");
    // It follows the expedition: the next one after a step.
    const one = tickAt(out, out.expedition!.nextAt);
    expect(viewFor(one, "p1").expedition!.next).toBe(tagOf(one));
    expect(tagOf(one)).not.toBe(tagOf(out));
    // A dead holder sees nothing of it.
    const dead = clone(one);
    player(dead, "p1").alive = false;
    expect(viewFor(dead, "p1").expedition).not.toHaveProperty("next");
    // Gone once the crew is back.
    let back = one;
    while (back.expedition) back = tickAt(back, back.expedition.nextAt);
    expect(viewFor(back, "p1").expedition).toBeNull();
  });

  it("a lost holder doesn't see the next sector; it follows the redraw after someone gets lost", () => {
    const s = timedGame({ tags: ["COLD", "DESERT", "DESERT"], events: { ...only(rule("nothing")), COLD: [rule("lost")], LOST: [rule("again")] } });
    for (const id of crewIds) player(s, id).skills.push("fast_backward");
    const out = go(s);
    out.expedition!.sectors = [0, 1, 2];
    const t = tickAt(out, out.expedition!.nextAt);
    const lost = t.players.find((p) => p.room.startsWith("LOST:"))!;
    const left = crewIds.find((id) => id !== lost.id)!;
    expect(viewFor(t, lost.id).expedition).not.toHaveProperty("next");
    const next = t.planets.p5![0]!.sectors[t.expedition!.sectors[0]!]!.tag;
    expect(viewFor(t, left).expedition!.next).toBe(next);
  });

  it("sabotaged: a sector with no negative event is Nothing; a Crystal field is always a Mush trap; cancelled events stay cancelled", () => {
    const sabotaged = (tags: Planet["sectors"][number]["tag"][], events?: Record<string, ExpeditionEventRule[]>) => {
      const s = timedGame({ tags, ...(events && { events }) });
      player(s, "p1").skills.push("traitor");
      let t = must(applyAction(go(s), "p1", sabotage));
      while (t.expedition) t = tickAt(t, t.expedition.nextAt);
      return t.expeditions[0]!.events;
    };
    expect(sabotaged(["FRUIT_TREES"]).map((e) => e.kind)).toEqual(["nothing", "nothing"]);
    expect(sabotaged(["CRISTAL_FIELD", "CRISTAL_FIELD"]).find((e) => e.sector === "CRISTAL_FIELD")!.kind).toBe("mushTrap");
    // The Lost sector's only negative event is Found dead, which a Tracker cancels.
    const s = timedGame({ tags: ["LOST"] });
    player(s, "p1").skills.push("traitor");
    player(s, "p2").skills.push("hunt");
    let t = must(applyAction(go(s), "p1", sabotage));
    while (t.expedition) t = tickAt(t, t.expedition.nextAt);
    expect(t.expeditions[0]!.events.at(-1)!.kind).toBe("nothing");
  });
});

describe("expeditions, phase 5: hold extension, patrol-ship landings, no dropping", () => {
  const T0 = 1_000_000;
  const LONGANE = patrolShip("PATROL_SHIP_A_0")!;
  const landOn: Action = { type: "land_on_planet", equipment: commandId(LONGANE) };
  const NINE: Planet["sectors"][number]["tag"][] = ["FOREST", "DESERT", "COLD", "HOT", "OCEAN", "SWAMP", "CAVE", "MOUNTAIN", "RUINS"];
  const tickAt = (s: GameState, at: number) => must(applyInput(s, { type: "tick", at }));
  const runOut = (s: GameState): GameState => {
    while (s.expedition) s = tickAt(s, s.expedition.nextAt);
    return s;
  };
  const refusal = (s: GameState, id: PlayerId, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action);
  const inShip = (s: GameState) => s.items.filter((i) => i.at.kind === "room" && i.at.id === LONGANE.id);

  /** p0, a Pilot, flies the Longane over the planet; the others are in the Icarus Bay or the laboratory as in `game`. */
  function flying(opts: Parameters<typeof game>[0] = {}): GameState {
    const s = game({ tags: NINE, ...opts, timed: true });
    s.now = T0;
    player(s, "p0").room = LONGANE.id;
    s.patrolShips[LONGANE.id]!.out = true;
    return s;
  }

  it("pins the confirmed numbers", () => {
    expect([expedition.maxCrew, expedition.largerBayCrew, expedition.patrol.cost.ap, expedition.patrol.sectorDivisor, DEFAULT_CONFIG.patrol.takeoff.cost.ap]).toEqual([4, 6, 2, 2, 2]);
  });

  it("the hold extension takes up to six aboard the Icarus", () => {
    const s = game({ events: only({ kind: "nothing", weight: 1 }) });
    for (const p of s.players) p.room = ICARUS;
    expect(go(s).expeditions[0]!.members).toHaveLength(expedition.maxCrew);
    s.projects.ICARUS_LARGER_BAY = 100;
    expect(go(s).expeditions[0]!.members).toHaveLength(expedition.largerBayCrew);
  });

  it("a pilot lands their patrol ship alone for 2 AP, exploring half the Icarus's sectors, rounded down", () => {
    const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
    expect(offered(s, "p0")).toContainEqual(landOn);
    expect(costOf(s, "p0", landOn)).toMatchObject({ ap: expedition.patrol.cost.ap });
    const next = must(applyAction(s, "p0", landOn));
    expect(player(next, "p0").ap).toBe(player(s, "p0").ap - expedition.patrol.cost.ap);
    expect(player(next, "p0").room).toBe(LONGANE.id);
    expect(next.patrolShips[LONGANE.id]!.onPlanet).toBe("p0");
    expect(next.expedition).toMatchObject({ ship: LONGANE.id, sectors: expect.any(Array) });
    expect(next.expedition!.sectors).toHaveLength(Math.floor(expedition.sectors / expedition.patrol.sectorDivisor));
    expect(next.expeditions[0]).toMatchObject({ members: ["p0"], ship: LONGANE.id });
    // The landing is in the report at once (owner, 2026-11-17); the first sector a step later.
    expect(next.expeditions[0]!.events.map((e) => e.sector)).toEqual(["LANDING"]);
    expect(next.expedition!.nextAt).toBe(T0 + expedition.stepMs);
    // Public: who is out, in which ship; the Icarus is still in its bay, but can't take off meanwhile.
    expect(viewFor(next, "p5").expedition).toMatchObject({ crew: [player(s, "p0").character], ship: LONGANE.id });
    expect(viewFor(next, "p1").roomEquipment.find((e) => e.id === "ICARUS:ICARUS_COMMAND")!.out).toBeUndefined();
    // Boarding the Icarus is allowed meanwhile; only its takeoff is refused.
    const pilot1 = must(applyAction(next, "p1", boardIcarus));
    player(pilot1, "p1").skills.push("pilot");
    expect(refusal(pilot1, "p1", takeoff)).toBe("expedition_away");
    // The ship's own actions wait until it docks.
    for (const type of ["land", "patrol_attack", "collect_scrap", "land_on_planet"]) expect(offered(next, "p0").some((a) => a.type === type)).toBe(false);
    expect(refusal(next, "p0", { type: "land", equipment: commandId(LONGANE) })).toBe("on_planet");
  });

  it("a pilot with U-turn or Traitor sees the next sector of their solo landing", () => {
    for (const skill of ["fast_backward", "traitor"]) {
      const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
      player(s, "p0").skills.push(skill);
      const next = must(applyAction(s, "p0", landOn));
      expect(viewFor(next, "p0").expedition!.next).toBe(NINE[next.expedition!.sectors[0]!]);
    }
  });

  it("never sends who landed a ship on the planet as such, the pilot included", () => {
    const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
    const next = must(applyAction(s, "p0", landOn));
    for (const p of next.players) expect(JSON.stringify(viewFor(next, p.id))).not.toContain("onPlanet");
  });

  it("a Sprinter pilot's extra sector counts before halving", () => {
    const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
    player(s, "p0").skills.push("sprint");
    const next = must(applyAction(s, "p0", landOn));
    expect(next.expedition!.sectors).toHaveLength(Math.floor((expedition.sectors + expedition.sprinterSectors) / expedition.patrol.sectorDivisor));
  });

  it("is refused while another expedition is out, and the Icarus can't land a second one", () => {
    const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
    const t = clone(s);
    player(t, "p1").skills.push("pilot");
    const away = go(t, "p1");
    expect(refusal(away, "p0", landOn)).toBe("expedition_away");
    expect(offered(away, "p0")).not.toContainEqual(landOn);
  });

  it("hunters aiming at the ship pick another target at once, and can't aim at it on the planet", () => {
    const s = flying({ events: only({ kind: "nothing", weight: 1 }) });
    s.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.8, target: { kind: "patrol", id: LONGANE.id }, type: "hunter", countdown: null });
    const next = must(applyAction(s, "p0", landOn));
    expect(next.hunters.list[0]!.target).toEqual({ kind: "ship" });
    expect(shipsInFlight(next)).toEqual([]);
  });

  it("docks in its bay at the end, with the pilot and the loot", () => {
    const s = flying({ events: only({ kind: "harvest", weight: 1, amount: 2 }) });
    const t = runOut(must(applyAction(s, "p0", landOn)));
    expect(t.expedition).toBeNull();
    expect(player(t, "p0").room).toBe(LONGANE.bay);
    expect(t.patrolShips[LONGANE.id]).toMatchObject({ out: false, onPlanet: null, destroyed: false });
    expect(harvested(t, LONGANE.bay)).toBeGreaterThan(0);
    expect(inShip(t)).toEqual([]);
    expect(viewFor(t, "p0").log.some((e) => e.key === "expeditionReturned")).toBe(true);
  });

  it("a non-pilot landing a patrol ship still rolls LANDING even with Antigrav propeller", () => {
    const crash = only({ kind: "nothing", weight: 1 }, { kind: "catastrophe", weight: 1 });
    const s = flying({ tags: ["FOREST"], events: crash });
    player(s, "p0").skills = [];
    s.projects.ICARUS_ANTIGRAV_PROPELLER = 100;
    const next = runOut(must(applyAction(s, "p0", landOn)));
    expect(next.expeditions[0]!.events[0]!.kind).toBe("catastrophe");
  });

  it("without a spacesuit the pilot never sets down: the ship docks in its bay and the pilot is told why", () => {
    const s = flying({ tags: ["FOREST", "DESERT"], suits: false, events: only({ kind: "nothing", weight: 1 }) });
    const t = must(applyAction(s, "p0", landOn));
    expect(t.expedition).toBeNull();
    expect(t.expeditions).toEqual([]);
    expect(player(t, "p0").room).toBe(LONGANE.bay);
    expect(t.patrolShips[LONGANE.id]).toMatchObject({ out: false, onPlanet: null });
    expect(shipsInFlight(t)).toEqual([]);
    expect(t.log.find((e) => e.key === "patrolNoSpacesuit")).toMatchObject({ visibleTo: ["p0"], params: { room: LONGANE.id } });
    expect(t.log.some((e) => e.key === "patrolPlanetLanding")).toBe(false);
  });

  it("is lost for good, with everything in it, if the pilot dies", () => {
    const s = flying({ events: only({ kind: "kill", weight: 1 }) });
    give(s, "p0", "blaster", 3);
    const t = runOut(must(applyAction(s, "p0", landOn)));
    expect(player(t, "p0").alive).toBe(false);
    expect(t.patrolShips[LONGANE.id]).toMatchObject({ destroyed: true, onPlanet: null });
    expect(inShip(t)).toEqual([]);
    expect(t.items.some((i) => i.type === "blaster" || (i.type === "corpse" && i.of === "p0"))).toBe(false);
    expect(t.log.find((e) => e.key === "patrolLeftOnPlanet")).toMatchObject({ visibleTo: "all", params: { room: LONGANE.id }, level: "warning" });
  });

  it("says nothing of the lost ship when the BIOS has death announcements off", () => {
    const s = flying({ events: only({ kind: "kill", weight: 1 }) });
    s.bios.death_announcements = false;
    const t = runOut(must(applyAction(s, "p0", landOn)));
    expect(t.patrolShips[LONGANE.id]).toMatchObject({ destroyed: true });
    expect(t.log.some((e) => e.key === "patrolLeftOnPlanet")).toBe(false);
  });

  describe("a lost pilot", () => {
    /** The pilot got lost on the first sector: the expedition is over and the Longane waits on the planet. */
    function lostPilot(): GameState {
      const s = flying({ tags: ["COLD", "COLD"], events: { ...only({ kind: "lost", weight: 1 }), LOST: [{ kind: "found", weight: 1 }] } });
      return runOut(must(applyAction(s, "p0", landOn)));
    }

    it("leaves the ship on the planet, out of the hunters' reach", () => {
      const t = lostPilot();
      expect(player(t, "p0").room).toBe(lostPlace("p0"));
      expect(t.expedition).toBeNull();
      expect(t.patrolShips[LONGANE.id]).toMatchObject({ out: true, onPlanet: "p0", destroyed: false });
      expect(shipsInFlight(t)).toEqual([]);
    });

    it("found by a later expedition: the ship is back in its bay, and the pilot comes home with that crew", () => {
      const t = lostPilot();
      // Nobody else gets lost on the way, so p0 is the only one the Lost sector can find.
      t.config.expedition.events = { ...t.config.expedition.events, ...only({ kind: "nothing", weight: 1 }), LOST: [{ kind: "found", weight: 1 }] };
      player(t, "p1").skills.push("pilot");
      const back = runOut(go(t, "p1"));
      expect(player(back, "p0").room).toBe(ICARUS);
      expect(back.patrolShips[LONGANE.id]).toMatchObject({ out: false, onPlanet: null, destroyed: false });
      expect(back.log.some((e) => e.key === "patrolRecovered" && e.room === LONGANE.bay)).toBe(true);
    });

    it("dies with the ship when the Daedalus leaves orbit", () => {
      const t = lostPilot();
      player(t, "p4").room = "COMMAND_CENTER";
      t.titles.commander = "p4";
      t.ship.combustion = 3;
      const left = must(applyAction(t, "p4", { type: "leave_orbit", equipment: "COMMAND_CENTER:PILOT_MODULE" }));
      expect(player(left, "p0").alive).toBe(false);
      expect(left.patrolShips[LONGANE.id]).toMatchObject({ destroyed: true, onPlanet: null });
    });
  });

  it("stranded by a jump: Magnetic return docks it; otherwise the pilot dies and the ship is lost, not the Icarus", () => {
    for (const magnetic of [false, true]) {
      const s = flying({ events: only({ kind: "harvest", weight: 1, amount: 2 }) });
      if (magnetic) s.projects.AUTO_RETURN_ICARUS = 100;
      player(s, "p4").room = "COMMAND_CENTER";
      s.titles.commander = "p4";
      s.ship.combustion = 3;
      const out = tickAt(must(applyAction(s, "p0", landOn)), T0 + 2 * expedition.stepMs);
      const t = must(applyAction(out, "p4", { type: "leave_orbit", equipment: "COMMAND_CENTER:PILOT_MODULE" }));
      expect(t.expedition).toBeNull();
      expect(t.icarusLost).toBe(false);
      if (magnetic) {
        expect(player(t, "p0")).toMatchObject({ alive: true, room: LONGANE.bay });
        expect(t.patrolShips[LONGANE.id]).toMatchObject({ out: false, onPlanet: null, destroyed: false });
        expect(t.log.some((e) => e.key === "patrolRecalled")).toBe(true);
      } else {
        expect(player(t, "p0").alive).toBe(false);
        expect(t.patrolShips[LONGANE.id]).toMatchObject({ destroyed: true });
        expect(inShip(t)).toEqual([]);
        expect(t.log.some((e) => e.key === "icarusLost")).toBe(false);
      }
    }
  });

  it("nothing can be dropped on an expedition, aboard its craft or lost on the planet", () => {
    const s = timedGame({ events: only({ kind: "nothing", weight: 1 }) });
    give(s, "p1", "knife");
    const knife = s.items.at(-1)!.id;
    const drop: Action = { type: "drop", item: knife };
    expect(offered(s, "p1")).toContainEqual(drop);
    // Aboard the docked Icarus too (owner, 2026-11-17), so nothing is left in it.
    const docked = aboard(s);
    expect(offered(docked, "p1")).not.toContainEqual(drop);
    expect(refusal(docked, "p1", drop)).toBe("on_expedition");
    const away = go(s);
    expect(offered(away, "p1")).not.toContainEqual(drop);
    expect(refusal(away, "p1", drop)).toBe("on_expedition");
    const lost = clone(s);
    player(lost, "p1").room = lostPlace("p1");
    expect(refusal(lost, "p1", drop)).toBe("on_expedition");
    // Back aboard, dropping works again.
    const back = runOut(away);
    expect(offered(back, "p1")).toContainEqual(drop);
  });

  it("ICARUS_LAVATORY keeps Icarus crews clean on return silently, not patrol-ship solo landings", () => {
    const s = timedGame({ tags: ["FOREST"], config: { dirtyChance: 1 }, events: only({ kind: "nothing", weight: 1 }) });
    s.projects.ICARUS_LAVATORY = 100;
    const back = runOut(go(s));
    for (const id of ["p0", "p1", "p2", "p3"] as const) {
      expect(player(back, id).statuses).not.toContain("dirty");
      expect(back.log.some((e) => e.visibleTo !== "all" && e.visibleTo.includes(id) && e.key !== "expeditionReturned" && e.key !== "expeditionTakeoff")).toBe(false);
    }

    const solo = flying({ tags: ["FOREST"], config: { dirtyChance: 1 }, events: only({ kind: "nothing", weight: 1 }) });
    solo.projects.ICARUS_LAVATORY = 100;
    const landed = runOut(must(applyAction(solo, "p0", landOn)));
    expect(player(landed, "p0").statuses).toContain("dirty");
  });

  it("marks ICARUS_ANTIGRAV_PROPELLER, ICARUS_LARGER_BAY, ICARUS_LAVATORY and AUTO_RETURN_ICARUS as fully implemented", () => {
    expect(projectStatus("ICARUS_ANTIGRAV_PROPELLER")).toBe("full");
    expect(projectStatus("ICARUS_LARGER_BAY")).toBe("full");
    expect(projectStatus("ICARUS_LAVATORY")).toBe("full");
    expect(projectStatus("AUTO_RETURN_ICARUS")).toBe("full");
  });
});
