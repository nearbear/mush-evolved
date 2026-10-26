import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { makeSeats, player } from "./support.ts";

const action = { type: "self_injury" } as const;
const seats = makeSeats(4);

describe("Self Injury", () => {
  it("is unavailable unless the player has the selfDisease cheat", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    const before = JSON.stringify(state);

    expect(viewFor(state, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(state, "p0", action).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("is free, instant, private, and adds a configured injury through addDisease", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(state, "p0").cheats.push("selfDisease");
    const offered = viewFor(state, "p0").actions.find((option) => option.action.type === action.type);
    expect(offered?.cost).toEqual({ ap: 0, mp: 0 });

    const result = applyAction(state, "p0", action);
    if (!result.ok) throw new Error(result.error);

    expect(player(result.state, "p0").modifiers).toContain("broken_nose_injury");
    expect(player(result.state, "p0").statuses).toContain("broken_nose_injury");
    expect(player(result.state, "p0").diseaseTrackers).toMatchObject([{ name: "broken_nose_injury", forever: true }]);
    expect(viewFor(result.state, "p0").statuses).toContain("broken_nose_injury");
    expect(viewFor(result.state, "p1").players.find((p) => p.id === "p0")?.statuses).not.toContain("broken_nose_injury");
    expect(JSON.stringify(viewFor(result.state, "p1"))).not.toContain("broken_nose_injury");
    expect(player(result.state, "p0").current).toBeNull();
    expect(result.state.rng).not.toBe(state.rng);
  });

  it("is not offered to bots or when the player already has every configured injury", () => {
    const botState = createGame(makeSeats(4, "all"), DEFAULT_CONFIG, 42);
    player(botState, "p0").cheats.push("selfDisease");
    expect(viewFor(botState, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);

    const injuredState = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(injuredState, "p0").cheats.push("selfDisease");
    player(injuredState, "p0").modifiers.push(...DEFAULT_CONFIG.diseases.allInjuries);
    const before = JSON.stringify(injuredState);

    expect(viewFor(injuredState, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(injuredState, "p0", action).ok).toBe(false);
    expect(JSON.stringify(injuredState)).toBe(before);
  });

  it("validates the action shape from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "unknown" } }))).toBeNull();
  });
});
