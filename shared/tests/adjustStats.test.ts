import { describe, expect, it } from "vitest";
import { changeAP, changeMP, gainMorale } from "../src/adjustStats.ts";
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

describe("changeAP and changeMP", () => {
  it("log the amount asked for privately, even when capped, unless the config turns the lines off", () => {
    const state = createGame(makeSeats(4), testConfig({ statLogs: true }), 0);
    const p = player(state, "p0");
    p.ap = p.maxAp - 1;
    p.mp = 1;
    const before = state.log.length;
    changeAP(state, p, 3);
    changeAP(state, p, -2);
    changeMP(state, p, -4);
    changeMP(state, p, 0);
    expect(p.ap).toBe(p.maxAp - 2);
    expect(p.mp).toBe(0);
    expect(state.log.slice(before)).toMatchObject([
      { key: "gainAp", params: { amount: 3 }, visibleTo: ["p0"], kind: "private" },
      { key: "loseAp", params: { amount: 2 }, visibleTo: ["p0"], kind: "private" },
      { key: "loseMp", params: { amount: 4 }, visibleTo: ["p0"], kind: "private" },
    ]);
    const quiet = createGame(makeSeats(4), testConfig(), 0);
    const count = quiet.log.length;
    changeAP(quiet, player(quiet, "p0"), -1);
    expect(quiet.log).toHaveLength(count);
  });
});
