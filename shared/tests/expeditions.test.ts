import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { pickSectors, runExpedition } from "../src/expeditions.ts";
import { nextDue } from "../src/queue.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, ExpeditionEventRule, GameConfig, GameState, Planet, PlayerId } from "../src/types.ts";
import { clone, makeSeats, must, noHunters, noIncidents, offered, option, player } from "./support.ts";

const ICARUS = "ICARUS";
const takeoff: Action = { type: "icarus_takeoff", equipment: "ICARUS:ICARUS_COMMAND" };
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
function game(opts: { events?: Record<string, ExpeditionEventRule[]>; tags?: Planet["sectors"][number]["tag"][]; config?: Partial<GameConfig["expedition"]>; timed?: boolean } = {}): GameState {
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
  return s;
}

/** Only the given event, for the landing and every sector tag. */
const only = (rule: ExpeditionEventRule, landing: ExpeditionEventRule = { kind: "nothing", weight: 1 }): Record<string, ExpeditionEventRule[]> => ({
  LANDING: [landing],
  OXYGEN: [rule],
  HYDROCARBON: [rule],
  FRUIT_TREES: [rule],
  PREDATOR: [rule],
  RUINS: [rule],
  HOT: [rule],
});

const go = (s: GameState, by: PlayerId = "p0") => must(applyAction(s, by, takeoff));
const give = (s: GameState, id: PlayerId, type: string, charges?: number) =>
  s.items.push({ id: `item-test-${s.items.length}`, type, at: { kind: "player", id }, ...(charges !== undefined && { charges }) });
const floor = (s: GameState, type: string) => s.items.filter((i) => i.type === type && i.at.kind === "room" && i.at.id === ICARUS).length;

describe("expeditions, phase 1 (instant, as in single player)", () => {
  it("is offered to a Pilot at the Icarus in orbit of a planet with an unexplored sector, and to no one else", () => {
    const s = game();
    expect(offered(s, "p0")).toContainEqual(takeoff);
    expect(option(s, "p0", takeoff)?.cost.ap).toBe(expedition.cost.ap);
    expect(offered(s, "p1")).not.toContainEqual(takeoff);
    expect(applyAction(s, "p1", takeoff).ok).toBe(false);

    const away = structuredClone(s);
    player(away, "p0").room = "LABORATORY";
    expect(applyAction(away, "p0", takeoff).ok).toBe(false);

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
    const s = game();
    const before = JSON.stringify(s);
    expect(applyAction(s, "p1", takeoff).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("takes everyone in the bay, the launcher paying alone; a public takeoff line, then each member's private line", () => {
    const s = game({ events: only({ kind: "nothing", weight: 1 }) });
    const next = go(s);
    expect(player(next, "p0").ap).toBe(player(s, "p0").ap - expedition.cost.ap);
    for (const id of ["p1", "p2", "p3"]) expect(player(next, id).ap).toBe(player(s, id).ap);
    for (const id of ["p0", "p1", "p2", "p3"]) expect(player(next, id).room).toBe(ICARUS);
    const report = next.expeditions[0]!;
    expect(new Set(report.members)).toEqual(new Set(["p0", "p1", "p2", "p3"]));
    expect(report.members[0]).toBe("p0");
    expect(report.planet).toBe("Fugunys");

    const lines = next.log.slice(s.log.length);
    expect(lines[0]).toMatchObject({ key: "icarusTakeoff", room: ICARUS, visibleTo: "all", params: { name: player(s, "p0").character, planet: "Fugunys" } });
    const returned = lines.filter((e) => e.key === "expeditionReturned");
    expect(returned.map((e) => e.visibleTo)).toEqual(report.members.map((id) => [id]));
    expect(returned[0]!.params).toEqual({ planet: "Fugunys", report: report.id });
    // The return leaves nothing public.
    expect(lines.filter((e) => e.visibleTo === "all").map((e) => e.key)).toEqual(["icarusTakeoff"]);
  });

  it("takes at most maxCrew, the launcher always", () => {
    const s = game();
    player(s, "p4").room = ICARUS;
    player(s, "p5").room = ICARUS;
    for (let seed = 1; seed <= 5; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      const report = go(t).expeditions[0]!;
      expect(report.members).toHaveLength(expedition.maxCrew);
      expect(report.members[0]).toBe("p0");
    }
  });

  it("lands first, then explores each unexplored sector once, at most `sectors`, marking them explored", () => {
    const tags = Array.from({ length: 12 }, (_, i) => (i % 2 ? "FOREST" : "DESERT") as const);
    const s = game({ tags });
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
    expect(floor(harvest, expedition.loot.harvest)).toBe(3);
    const withBotanist = game({ tags: ["FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 3 }) });
    player(withBotanist, "p2").skills.push("botanic");
    expect(floor(go(withBotanist), expedition.loot.harvest)).toBe(3 + expedition.botanistBonus);
    expect(floor(go(game({ tags: ["PREDATOR"], events: only({ kind: "provision", weight: 1, amount: 3 }) })), expedition.loot.provision)).toBe(3);
    expect(floor(go(game({ tags: ["RUINS"], events: only({ kind: "artifact", weight: 1, amount: 1 }) })), expedition.loot.artifact)).toBe(1);
  });

  it("tags without a table are explored with nothing happening", () => {
    const next = go(game({ tags: ["FOREST", "DESERT"], events: { LANDING: [{ kind: "nothing", weight: 1 }] } }));
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
    const noPilot = structuredClone(crash);
    player(noPilot, "p0").skills = [];
    const report = runExpedition(noPilot, player(noPilot, "p0"));
    expect(report.events[0]!.kind).toBe("catastrophe");
    expect(report.events[0]!.hurt).toHaveLength(4);
  });

  it("wins a fight when the crew is strong enough, using a grenade only if it is needed", () => {
    const fight = (strength: number) => game({ tags: ["PREDATOR"], events: only({ kind: "fight", weight: 1, amount: strength }) });
    // 4 members + a knife (1) + a loaded blaster (1) + an empty blaster (0) = 6.
    const s = fight(6);
    give(s, "p1", "knife");
    give(s, "p2", "blaster", 3);
    give(s, "p3", "blaster", 0);
    give(s, "p3", "grenade");
    const won = go(s);
    expect(won.expeditions[0]!.events[1]!.fight).toEqual({ strength: 6, grenades: 0, won: true });
    expect(won.items.some((i) => i.type === "grenade")).toBe(true);

    const harder = fight(8);
    give(harder, "p1", "knife");
    give(harder, "p2", "blaster", 3);
    give(harder, "p3", "grenade");
    const next = go(harder);
    expect(next.expeditions[0]!.events[1]!.fight).toEqual({ strength: 6 + 3, grenades: 1, won: true });
    expect(next.items.some((i) => i.type === "grenade")).toBe(false);
    for (const id of ["p0", "p1", "p2", "p3"]) expect(player(next, id).hp).toBe(player(harder, id).hp);
  });

  it("loses a fight when weaker: the difference is dealt as HP among the members", () => {
    const s = game({ tags: ["PREDATOR"], events: only({ kind: "fight", weight: 1, amount: 12 }) });
    const next = go(s);
    const event = next.expeditions[0]!.events[1]!;
    expect(event.fight).toEqual({ strength: 4, grenades: 0, won: false });
    const lost = ["p0", "p1", "p2", "p3"].reduce((sum, id) => sum + player(s, id).hp - player(next, id).hp, 0);
    expect(lost).toBe(12 - 4);
    expect(event.hurt!.reduce((sum, h) => sum + h.hp, 0)).toBe(8);
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

  it("takes the crew into the Icarus, a room of its own, until the landing a step later", () => {
    const s = timed({ events: only({ kind: "nothing", weight: 1 }) });
    const next = go(s);
    for (const id of crewIds) expect(player(next, id).room).toBe(CRAFT);
    expect(next.config.rooms[CRAFT]).toEqual([]);
    expect(next.expeditions[0]!.events).toEqual([]);
    expect(next.expedition).toMatchObject({ landed: false, nextAt: T0 + step });
    expect(nextDue(next)).toBe(T0 + step);
    // Nothing is due before then.
    expect(applyInput(next, { type: "tick", at: T0 + step - 1 }).ok).toBe(false);
    const landed = tickAt(next, T0 + step);
    expect(landed.expeditions[0]!.events.map((e) => e.sector)).toEqual(["LANDING"]);
    expect(landed.expedition!.nextAt).toBe(T0 + 2 * step);
  });

  it("explores one sector per step and is back as the last one resolves, with the loot unloaded in the bay", () => {
    const s = timed({ tags: ["FRUIT_TREES", "FRUIT_TREES", "FRUIT_TREES"], events: only({ kind: "harvest", weight: 1, amount: 2 }) });
    let t = go(s);
    const returnAt = viewFor(t, "p4").expedition!.returnAt;
    expect(returnAt).toBe(T0 + 4 * step);
    t = tickAt(t, T0 + 2 * step); // landing and sector 1, caught up in one tick
    expect(t.expeditions[0]!.events).toHaveLength(2);
    expect(t.planets.p5![0]!.sectors.filter((x) => x.explored)).toHaveLength(1);
    // The loot is in the Icarus while away; members can take it.
    expect(t.items.filter((i) => i.type === expedition.loot.harvest && i.at.kind === "room" && i.at.id === CRAFT).length).toBeGreaterThan(0);
    expect(viewFor(t, "p4").expedition!.returnAt).toBe(returnAt);
    t = tickAt(t, T0 + 3 * step);
    expect(t.expedition).not.toBeNull();
    t = tickAt(t, returnAt);
    expect(t.expedition).toBeNull();
    for (const id of crewIds) expect(player(t, id).room).toBe(ICARUS);
    expect(t.items.some((i) => i.at.kind === "room" && i.at.id === CRAFT)).toBe(false);
    expect(floor(t, expedition.loot.harvest)).toBe(t.expeditions[0]!.events.reduce((n, e) => n + (e.kind === "harvest" ? e.amount! : 0), 0));
    expect(t.log.filter((e) => e.key === "expeditionReturned").map((e) => e.visibleTo)).toEqual(t.expeditions[0]!.members.map((id) => [id]));
  });

  it("everyone sees who is out, where and until when; members see the report live; nobody sees more", () => {
    const s = timed({ tags: ["OXYGEN", "PREDATOR"] });
    const t = tickAt(go(s), T0 + step);
    const report = t.expeditions[0]!;
    const status = { crew: report.crew, planet: "Fugunys", returnAt: T0 + 3 * step };
    for (const id of ["p4", "p5"]) {
      const view = viewFor(t, id);
      expect(view.expedition).toEqual(status);
      expect(view.expeditions).toEqual([]);
      const json = JSON.stringify(view);
      expect(json).not.toContain(report.id);
      expect(json).not.toContain("explored");
      for (const field of ["landed", "nextAt", "carried"]) expect(json).not.toContain(field);
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
    expect(offered(t, "p4")).not.toContainEqual(takeoff);
    expect(applyAction(t, "p4", takeoff).ok).toBe(false);
    expect(viewFor(s, "p4").roomEquipment.find((e) => e.type === "ICARUS_COMMAND")!.out).toBeUndefined();
  });

  it("aboard, members can act on items and each other but not leave or use the ship", () => {
    const s = timed();
    give(s, "p1", "bandage");
    player(s, "p2").hp -= 3;
    const t = go(s);
    const actions = offered(t, "p1");
    expect(actions.some((a) => a.type === "move")).toBe(false);
    expect(actions.some((a) => a.type === "install" || a.type === "build" || a.type === "ignite")).toBe(false);
    expect(actions).toContainEqual(expect.objectContaining({ type: "use_bandage" }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "drop" }));
  });

  it("a member who dies leaves a body in the Icarus, which comes back with it", () => {
    const s = timed({ tags: ["HOT", "HOT"], events: only({ kind: "fatigue", weight: 1 }) });
    player(s, "p1").hp = expedition.fatigue;
    const t = tickAt(go(s), T0 + 2 * step); // the landing, then the first sector
    expect(player(t, "p1").alive).toBe(false);
    expect(t.items.some((i) => i.of === "p1" && i.at.kind === "room" && i.at.id === CRAFT)).toBe(true);
    const back = runOut(t);
    expect(back.items.some((i) => i.of === "p1" && i.at.kind === "room" && i.at.id === ICARUS)).toBe(true);
  });

  it("comes back at once when every member is dead", () => {
    const s = timed({ tags: ["HOT", "HOT", "HOT"], events: only({ kind: "fatigue", weight: 1 }, { kind: "fatigue", weight: 1 }) });
    for (const id of crewIds) player(s, id).hp = expedition.fatigue;
    const t = tickAt(go(s), T0 + step);
    expect(t.expedition).toBeNull();
    expect(t.expeditions[0]!.events).toHaveLength(1);
    expect(t.items.filter((i) => i.type === "corpse" && i.at.kind === "room" && i.at.id === ICARUS)).toHaveLength(4);
    expect(viewFor(t, "p4").expedition).toBeNull();
  });

  it("living members may come back dirty", () => {
    const always = runOut(go(timed({ tags: ["FOREST"], config: { dirtyChance: 1 } })));
    for (const id of crewIds) expect(player(always, id).statuses).toContain("dirty");
    const never = runOut(go(timed({ tags: ["FOREST"], config: { dirtyChance: 0 } })));
    for (const id of crewIds) expect(player(never, id).statuses).not.toContain("dirty");
  });

  it("a step due before a bar ends happens first, in the same tick", () => {
    const s = timed({ tags: ["FOREST"], events: only({ kind: "nothing", weight: 1 }) });
    const t = go(s);
    // p4 starts a timed action that ends after the landing is due.
    player(t, "p4").current = { action: { type: "ready" }, adjustment: { ap: 0, mp: 0 }, since: T0, until: T0 + step + 5 };
    const after = tickAt(t, T0 + step + 5);
    expect(after.expeditions[0]!.events).toHaveLength(1);
    expect(player(after, "p4").current).toBeNull();
  });
});
