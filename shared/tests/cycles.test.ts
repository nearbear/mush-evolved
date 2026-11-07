import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.ts";
import { dailyMoraleLoss } from "../src/modifiers.ts";
import { applyInput, startGame } from "../src/replay.ts";
import { applyAction, createGame, legalActions, newCycle, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, must, nextCycle, nextDay, noIncidents, player } from "./support.ts";

// Cycles change on the server's UTC clock (#24, owner 2026-10-19); End cycle is kept for testing only.
const seats = makeSeats(4);
const config = noIncidents({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] });
const ship = (startCycle?: number): GameState => createGame(seats, config, 3, {}, startCycle);

describe("cycles on the clock", () => {
  it("has End cycle off by default", () => {
    expect(DEFAULT_CONFIG.manualCycles).toBe(false);
  });

  it("doesn't offer or accept ready unless End cycle is on, leaving state unchanged", () => {
    const s = ship();
    expect(legalActions(s, "p0").some((a) => a.type === "ready")).toBe(false);
    const before = clone(s);
    expect(applyAction(s, "p0", { type: "ready" }).ok).toBe(false);
    expect(s).toEqual(before);
    const manual = createGame(seats, { ...config, manualCycles: true }, 3);
    expect(legalActions(manual, "p0")).toContainEqual({ type: "ready" });
  });

  it("ends the cycle for everyone, ready or not, and refills AP", () => {
    const s = createGame(seats, { ...config, manualCycles: true }, 3);
    const readied = must(applyAction(s, "p0", { type: "ready" }));
    const next = must(applyInput(readied, { type: "cycle", at: 0 }));
    expect(next.cycle).toBe(s.cycle + 1);
    expect(next.players.every((p) => p.ap === config.startAp + config.apPerCycle && !p.ready)).toBe(true);
    expect(next.log.at(-1)).toMatchObject({ key: "cycleBegins", visibleTo: "all" });
  });

  it("refuses once the game is over", () => {
    const s = ship();
    s.phase = "ended";
    expect(newCycle(s).ok).toBe(false);
  });
});

describe("launching mid-day", () => {
  it("starts on the clock's cycle of day 1, and day 2 begins after the last cycle", () => {
    let s = ship(5);
    expect(viewFor(s, "p0")).toMatchObject({ day: 1, cycleOfDay: 5 });
    expect(s.log[0]).toMatchObject({ cycle: 5, key: "crewWakes" });
    const morale = player(s, "p0").morale;
    for (let i = 0; i < 3; i++) s = nextCycle(s);
    expect(viewFor(s, "p0")).toMatchObject({ day: 1, cycleOfDay: 8 });
    expect(player(s, "p0").morale).toBe(morale);
    s = nextCycle(s);
    expect(viewFor(s, "p0")).toMatchObject({ day: 2, cycleOfDay: 1 });
    expect(player(s, "p0").morale).toBeLessThan(morale);
    expect(s.log.at(-1)).toMatchObject({ key: "dayBegins", params: { day: 2 } });
  });

  it("counts hunger from the first cycle the ship had", () => {
    const humans = ship(5).players.filter((p) => p.role === "human");
    expect(humans.map((p) => p.satietyZeroSince)).toEqual(humans.map(() => 5));
  });

  it("comes from the setup, defaulting to cycle 1", () => {
    const setup = { seats, config, seed: 3, rulesVersion: "test" };
    expect(startGame(setup).cycle).toBe(1);
    expect(startGame({ ...setup, startCycle: 7 }).cycle).toBe(7);
  });

  it("rejects a cycle that isn't one of day 1", () => {
    for (const c of [0, config.cyclesPerDay + 1, 2.5]) expect(() => ship(c)).toThrow(/startCycle/);
  });
});

describe("cycle length (#230)", () => {
  // Anything counted in cycles stays in cycles; daily effects stay once per 24-hour day.
  for (const cycleHours of [1, 6]) {
    it(`with ${cycleHours}-hour cycles, costs morale once per day, after ${24 / cycleHours} cycles`, () => {
      const c = noIncidents({ ...resolveConfig({ cycleHours }), mushCount: 1, startItems: [], startSkills: [] });
      let s = createGame(seats, c, 3);
      s.hunters.since = null; // An idle crew's hull would fall to hunters within 24 cycles.
      const start = player(s, "p0").morale;
      for (let i = 1; i < c.cyclesPerDay; i++) s = nextCycle(s);
      expect(viewFor(s, "p0")).toMatchObject({ day: 1, cycleOfDay: c.cyclesPerDay });
      expect(player(s, "p0").morale).toBe(start);
      s = nextCycle(s);
      expect(viewFor(s, "p0")).toMatchObject({ day: 2, cycleOfDay: 1 });
      expect(player(s, "p0").morale).toBe(start - dailyMoraleLoss(s));
    });
  }
});

describe("daily healing", () => {
  it("heals every living player on day change, up to max HP, and not on other cycles", () => {
    const s = ship();
    const { dailyHeal } = s.config;
    player(s, "p0").hp = 5;
    player(s, "p1").hp = player(s, "p1").maxHp;
    player(s, "p2").hp = 5;
    player(s, "p2").alive = false;
    const mid = nextCycle(s);
    expect(player(mid, "p0").hp).toBe(5);
    const day = nextDay(mid);
    expect(player(day, "p0").hp).toBe(5 + dailyHeal);
    expect(player(day, "p1").hp).toBe(player(day, "p1").maxHp);
    expect(player(day, "p2").hp).toBe(5);
  });
});
