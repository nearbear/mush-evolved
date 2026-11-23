import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { activityOverload, scaleByActivity } from "../src/difficulty.ts";
import { huntersPerCyclePoints } from "../src/hunters.ts";
import { incidentPointsForDay } from "../src/incidents.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { type DeepPartial, makeSeats, must, nextCycle, player, testConfig } from "./support.ts";

/** `n` players, no waves or incidents rolled; no pre-selection, so the seats are the players. */
const ship = (n = 4, config: DeepPartial<GameConfig> = {}): GameState => createGame(makeSeats(n), testConfig(config), 3);
const threshold = (s: GameState, seats: number) => s.config.difficulty.apPerSeat * seats;

describe("activity overload (#241)", () => {
  it("weighs the day's AP against 7 a seat", () => {
    expect(DEFAULT_CONFIG.difficulty.apPerSeat).toBe(7);
  });

  it("at or under the threshold, is the living share of the seats; the dead don't count", () => {
    const s = ship(4);
    expect(activityOverload(s)).toBe(1);
    s.apSpentToday = threshold(s, 4);
    expect(activityOverload(s)).toBe(1);
    player(s, "p3").alive = false;
    expect(activityOverload(s)).toBe(3 / 4);
  });

  it("over the threshold, is the AP spent over the threshold, dead or not", () => {
    const s = ship(4);
    s.apSpentToday = 2 * threshold(s, 4);
    player(s, "p3").alive = false;
    expect(activityOverload(s)).toBe(2);
  });

  it("counts the ship's seats, not the players, when there was a pre-selection", () => {
    const s = createGame(makeSeats(8), testConfig({ preselection: PRESELECTION }), 3);
    const seats = PRESELECTION.seats;
    expect(activityOverload(s)).toBe(8 / seats);
    s.apSpentToday = threshold(s, seats) + seats;
    expect(activityOverload(s)).toBeCloseTo((threshold(s, seats) + seats) / threshold(s, seats));
  });

  it("rounds the scaled points, a half up", () => {
    const s = ship(4);
    player(s, "p2").alive = player(s, "p3").alive = false;
    expect(scaleByActivity(7, s)).toBe(4);
    expect(scaleByActivity(9, s)).toBe(5);
  });

  it("scales the hunter points of a cycle change", () => {
    const s = ship(4);
    const full = huntersPerCyclePoints(s, 1);
    player(s, "p3").alive = false;
    expect(huntersPerCyclePoints(s, 1)).toBe(Math.round((full * 3) / 4));
  });

  it("scales the incident points of a cycle change", () => {
    let s = ship(4);
    s.apSpentToday = 2 * threshold(s, 4);
    const before = s.incidentPoints;
    s = nextCycle(s);
    expect(s.incidentPoints).toBe(before + 2 * incidentPointsForDay(s.config, 1));
  });
});

describe("AP spent today (#241)", () => {
  const repair = (item: string): Action => ({ type: "repair_hull", item });
  /** p0 with two scraps in hand and a damaged hull. */
  function damaged(chance: number): GameState {
    const s = ship(4, { hullRepair: { chance } });
    s.ship.hull = 50;
    for (const id of ["a", "b"]) s.items.push({ id, type: "metal_scraps", at: { kind: "player", id: "p0" } });
    return s;
  }

  it("counts the AP paid for actions, failed or not", () => {
    for (const chance of [1, 0]) {
      let s = damaged(chance);
      s = must(applyAction(s, "p0", repair("a")));
      expect(s.apSpentToday).toBe(s.config.hullRepair.cost.ap);
    }
  });

  it("counts an action paid with a skill point at the AP it would have cost", () => {
    let s = damaged(1);
    player(s, "p0").resources.eng = 1;
    s = must(applyAction(s, "p0", repair("a")));
    expect([player(s, "p0").resources.eng, s.apSpentToday]).toEqual([0, s.config.hullRepair.cost.ap]);
  });

  it("goes back to 0 after a new day's first cycle change, which still weighs the whole day before", () => {
    let s = ship(4);
    while (s.cycle % s.config.cyclesPerDay !== 0) s = nextCycle(s);
    s.apSpentToday = 2 * threshold(s, 4);
    const before = s.incidentPoints;
    s = nextCycle(s);
    expect(s.incidentPoints).toBe(before + 2 * incidentPointsForDay(s.config, 2));
    expect(s.apSpentToday).toBe(0);
    s.apSpentToday = 5;
    s = nextCycle(s);
    expect(s.apSpentToday).toBe(5);
  });
});
