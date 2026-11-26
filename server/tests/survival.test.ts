import { describe, expect, it } from "vitest";
import { runSurvival, survivalGame } from "../src/testing/survival.ts";
import { lossReport } from "../src/testing/survivalReport.ts";

describe("survival harness", () => {
  it("has no Mush aboard and every seat a bot", () => {
    const game = survivalGame(1, { crew: 16 });
    expect(game.players).toHaveLength(16);
    expect(game.players.every((p) => p.isBot && p.role === "human")).toBe(true);
  });

  it("plays a seed the same way twice, with no refused steps", { timeout: 60_000 }, async () => {
    // A small crew for a day keeps this about a second; the harness's own runs use 16 seats.
    const opts = { days: 1, crew: 4 };
    const [a, b] = [await runSurvival(3, opts), await runSurvival(3, opts)];
    expect(a).toEqual(b);
    expect(a.refused).toBe(0);
    expect(a.end).not.toBe("stalled");
    expect(a.days.at(-1)!.day).toBe(1);
    // One report row per cycle played, and a report that reads them.
    expect(a.cycles!.map((c) => c.cycle)).toEqual(Array.from({ length: a.cycles!.length }, (_, i) => i + 1));
    expect(a.cycles!.every((c) => c.alive <= 4 && c.hull <= 100)).toBe(true);
    expect(lossReport([a], 50, 0.42)[0]).toContain("loss report, 1 runs");
  });

  it("can take one killer out: no oxygen burn, no hunter waves", () => {
    expect(survivalGame(1, { crew: 4, noOxygen: true }).config.ship.oxygen.perCycle).toBe(0);
    expect(survivalGame(1, { crew: 4, noHunters: true }).config.hunters.waveChance).toBe(0);
    // The crew and the seed's draws are the same with a switch on.
    expect(survivalGame(1, { crew: 4, noOxygen: true }).players.map((p) => p.character)).toEqual(survivalGame(1, { crew: 4 }).players.map((p) => p.character));
  });
});
