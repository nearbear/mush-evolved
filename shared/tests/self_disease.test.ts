import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { makeSeats, player } from "./support.ts";

const action = { type: "self_disease" } as const;
const seats = makeSeats(4);

describe("Self Disease", () => {
  it("is unavailable unless the player has the selfDisease cheat", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    const before = JSON.stringify(state);

    expect(viewFor(state, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(state, "p0", action).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("is free, instant, private, and adds the cold disease through addDisease", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(state, "p0").cheats.push("selfDisease");
    const offered = viewFor(state, "p0").actions.find((option) => option.action.type === action.type);
    expect(offered?.cost).toEqual({ ap: 0, mp: 0 });

    const result = applyAction(state, "p0", action);
    if (!result.ok) throw new Error(result.error);

    expect(player(result.state, "p0").modifiers).toContain("cold_disease");
    expect(player(result.state, "p0").statuses).toContain("cold_disease");
    expect(viewFor(result.state, "p0").statuses).toContain("cold_disease");
    expect(viewFor(result.state, "p1").players.find((p) => p.id === "p0")?.statuses).not.toContain("cold_disease");
    expect(JSON.stringify(viewFor(result.state, "p1"))).not.toContain("cold_disease");
    expect(player(result.state, "p0").current).toBeNull();
  });

  it("is not offered to bots or offered again after the disease is applied", () => {
    const state = createGame(makeSeats(4, "all"), DEFAULT_CONFIG, 42);
    player(state, "p0").cheats.push("selfDisease");
    expect(viewFor(state, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);

    const humanState = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(humanState, "p0").cheats.push("selfDisease");
    const result = applyAction(humanState, "p0", action);
    if (!result.ok) throw new Error(result.error);
    const before = JSON.stringify(result.state);

    expect(viewFor(result.state, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(result.state, "p0", action).ok).toBe(false);
    expect(JSON.stringify(result.state)).toBe(before);
  });

  it("validates the action shape from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "unknown" } }))).toBeNull();
  });
});
