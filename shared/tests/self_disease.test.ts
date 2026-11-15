import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { nextInt } from "../src/rng.ts";
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

  it("is free, instant, private, and adds a configured random disease through addDisease", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(state, "p0").cheats.push("selfDisease");
    const diseases = state.config.diseases.allDiseases;
    const [selectedIndex] = nextInt(state.rng, diseases.length);
    const selectedDisease = diseases[selectedIndex];
    if (!selectedDisease) throw new Error("Expected a configured disease");
    const offered = viewFor(state, "p0").actions.find((option) => option.action.type === action.type);
    expect(offered?.cost).toEqual({ ap: 0, mp: 0 });

    const result = applyAction(state, "p0", action);
    if (!result.ok) throw new Error(result.error);

    expect(player(result.state, "p0").modifiers).toContain(selectedDisease);
    expect(player(result.state, "p0").statuses).toContain(selectedDisease);
    expect(viewFor(result.state, "p0").statuses).toContain(selectedDisease);
    expect(viewFor(result.state, "p1").players.find((p) => p.id === "p0")?.statuses).not.toContain(selectedDisease);
    // The name can appear in a view anyway (game data, like which diseases a fruit can carry), so what must not change
    // is how many times p1's view mentions it, not whether it does.
    const mentions = (s: typeof state) => JSON.stringify({ ...viewFor(s, "p1"), drugEffects: null }).split(selectedDisease).length - 1;
    expect(mentions(result.state)).toBe(mentions(state));
    expect(player(result.state, "p0").current).toBeNull();
  });

  it("uses the selected disease's configured duration and advances the RNG", () => {
    const allDiseaseStats = DEFAULT_CONFIG.diseases.allDiseases.map((label, index) => ({
      label,
      type: "disease",
      durationMin: 30 + index,
      durationMax: 30 + index,
    }));
    const config = {
      ...DEFAULT_CONFIG,
      diseases: { ...DEFAULT_CONFIG.diseases, allDiseaseStats },
    };
    const state = createGame(seats, config, 42, { p0: "human" });
    player(state, "p0").cheats.push("selfDisease");
    const diseases = state.config.diseases.allDiseases;
    const [selectedIndex] = nextInt(state.rng, diseases.length);
    const selectedDisease = diseases[selectedIndex];
    if (!selectedDisease) throw new Error("Expected a configured disease");

    const result = applyAction(state, "p0", action);
    if (!result.ok) throw new Error(result.error);

    expect(player(result.state, "p0").diseaseTrackers).toMatchObject([{ name: selectedDisease, duration: 30 + selectedIndex }]);
    expect(result.state.rng).not.toBe(state.rng);
  });

  it("is unavailable to bots and Mush, and when every configured disease is already held", () => {
    const state = createGame(makeSeats(4, "all"), DEFAULT_CONFIG, 42);
    player(state, "p0").cheats.push("selfDisease");
    expect(viewFor(state, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);

    const mushState = createGame(seats, DEFAULT_CONFIG, 42, { p0: "mush" });
    player(mushState, "p0").cheats.push("selfDisease");
    expect(viewFor(mushState, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(mushState, "p0", action).ok).toBe(false);

    const humanState = createGame(seats, DEFAULT_CONFIG, 42, { p0: "human" });
    player(humanState, "p0").cheats.push("selfDisease");
    player(humanState, "p0").modifiers.push(...DEFAULT_CONFIG.diseases.allDiseases);
    const before = JSON.stringify(humanState);

    expect(viewFor(humanState, "p0").actions.some((option) => option.action.type === action.type)).toBe(false);
    expect(applyAction(humanState, "p0", action).ok).toBe(false);
    expect(JSON.stringify(humanState)).toBe(before);
  });

  it("validates the action shape from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "unknown" } }))).toBeNull();
  });
});
