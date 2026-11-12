import { describe, expect, it } from "vitest";
import { runSurvival, survivalGame } from "../src/testing/survival.ts";

describe("survival harness", () => {
  it("has no Mush aboard and every seat a bot", () => {
    const game = survivalGame(1, { crew: 16 });
    expect(game.players).toHaveLength(16);
    expect(game.players.every((p) => p.isBot && p.role === "human")).toBe(true);
  });

  it("plays a seed the same way twice, with no refused steps", async () => {
    // A small crew for a day keeps this about a second; the harness's own runs use 16 seats.
    const opts = { days: 1, crew: 4 };
    const [a, b] = [await runSurvival(3, opts), await runSurvival(3, opts)];
    expect(a).toEqual(b);
    expect(a.refused).toBe(0);
    expect(a.end).not.toBe("stalled");
    expect(a.days.at(-1)!.day).toBe(1);
  });
});
