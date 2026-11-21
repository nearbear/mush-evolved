import { describe, expect, it } from "vitest";
import { gainMorale } from "../src/adjustStats.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, player, testConfig } from "./support.ts";

describe("gainMorale", () => {
  it("logs a gain or a loss privately, with the amount as a positive number", () => {
    const state = createGame(makeSeats(4), testConfig(), 0);
    const p = player(state, "p0");
    p.morale = 7;
    const before = state.log.length;
    gainMorale(state, p, 2);
    gainMorale(state, p, -3);
    expect(p.morale).toBe(6);
    expect(state.log.slice(before)).toMatchObject([
      { key: "gainMorale", params: { amount: 2 }, visibleTo: ["p0"] },
      { key: "loseMorale", params: { amount: 3 }, visibleTo: ["p0"] },
    ]);
  });
});
