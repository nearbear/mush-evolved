import { describe, expect, it } from "vitest";
import { bite, foaming, weakness } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, testConfig } from "./support.ts";

const config: GameConfig = testConfig();

describe("foaming and bite", () => {
  it("foams in public, for a human but not for a Mush without bacterial_contact", () => {
    const state = createGame(makeSeats(4), config, 7);
    foaming(state, state.players.find((p) => p.role === "mush")!);
    expect(state.log.some((e) => e.key === "foams")).toBe(false);
    foaming(state, state.players.find((p) => p.role === "human")!);
    expect(state.log.filter((e) => e.key === "foams")).toHaveLength(1);
  });

  it("bites another player in the room for 2 health, and does nothing alone", () => {
    const state = createGame(makeSeats(4), config, 7);
    const [a, b, c, d] = state.players;
    a!.room = b!.room = "BRIDGE";
    c!.room = "MEDLAB";
    d!.room = "REFECTORY";
    const hp = b!.hp;
    bite(state, a!);
    expect(b!.hp).toBe(hp - 2);
    expect(state.log.some((e) => e.key === "bites")).toBe(true);
    const lone = state.log.length;
    bite(state, c!);
    expect(state.log).toHaveLength(lone);
  });

  it("logs weakness in public, for a human but not for a Mush without bacterial_contact", () => {
    const state = createGame(makeSeats(4), config, 7);
    weakness(state, state.players.find((p) => p.role === "mush")!);
    expect(state.log.some((e) => e.key === "weakness")).toBe(false);
    weakness(state, state.players.find((p) => p.role === "human")!);
    expect(state.log.filter((e) => e.key === "weakness")).toHaveLength(1);
  });
});
