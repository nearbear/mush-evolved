import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { dailyMoraleLoss } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { SKILLS } from "../src/skills.ts";
import { overheadStatuses } from "../src/statuses.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, nextDay, player } from "./support.ts";

// Seat p1 is Chun.
const seats = makeSeats(3);
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] };
const ship = (): GameState => createGame(seats, config, 13);
const cut = config.mankindOnlyHope.moraleLossCut;

describe("Mankind's Only Hope", () => {
  it("is Chun's trait, not a pickable skill", () => {
    expect(player(ship(), "p1").modifiers).toContain("mankind_only_hope");
    expect(player(ship(), "p0").modifiers).not.toContain("mankind_only_hope");
    expect(SKILLS as readonly string[]).not.toContain("mankind_only_hope");
  });

  it("is a public status kept off the over-head badges", () => {
    const s = ship();
    for (const p of s.players) p.room = "LABORATORY";
    expect(viewFor(s, "p1").statuses).toContain("mankind_only_hope");
    expect(viewFor(s, "p0").players.find((p) => p.id === "p1")!.statuses).toContain("mankind_only_hope");
    expect(overheadStatuses(["mankind_only_hope"])).toEqual([]);
  });

  it("cuts everyone's daily morale loss while Chun is alive", () => {
    const s0 = ship();
    const start = s0.players.map((p) => p.morale);
    const s = nextDay(s0);
    expect(s.players.map((p) => p.morale)).toEqual(start.map((m) => m - (config.moralePerDay - cut)));
  });

  it("stops once Chun dies, human or Mush", () => {
    for (const role of ["human", "mush"] as const) {
      const s0 = ship();
      player(s0, "p1").role = role;
      killPlayer(s0, player(s0, "p1"));
      const before = player(s0, "p0").morale;
      const s = nextDay(s0);
      expect(player(s, "p0").morale).toBe(before - config.moralePerDay);
    }
  });

  it("is absent when Chun is not in the game", () => {
    const s = createGame(seats.filter((x) => x.character !== "chun"), config, 13);
    expect(dailyMoraleLoss(s)).toBe(config.moralePerDay);
  });

  it("never makes the loss negative", () => {
    const s = createGame(seats, { ...config, moralePerDay: 0 }, 7);
    expect(dailyMoraleLoss(s)).toBe(0);
  });
});
