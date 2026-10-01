import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { Action, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: i > 0 }));
const newGame = (seed = 42) => createGame(seats, DEFAULT_CONFIG, seed);

function mustApply(state: GameState, playerId: PlayerId, action: Action): GameState {
  const result = applyAction(state, playerId, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("createGame", () => {
  it("is deterministic for a given seed", () => {
    expect(newGame(7)).toEqual(newGame(7));
  });

  it("assigns the configured number of Mush", () => {
    const mush = newGame().players.filter((p) => p.role === "mush");
    expect(mush).toHaveLength(DEFAULT_CONFIG.mushCount);
  });
});

describe("applyAction", () => {
  it("moves along an edge and spends AP", () => {
    const next = mustApply(newGame(), "p0", { type: "move", to: "refectory" });
    const p0 = next.players.find((p) => p.id === "p0")!;
    expect(p0.room).toBe("refectory");
    expect(p0.ap).toBe(DEFAULT_CONFIG.apPerCycle - DEFAULT_CONFIG.moveCost);
  });

  it("rejects moves to non-adjacent rooms without changing state", () => {
    const moved = mustApply(newGame(), "p0", { type: "move", to: "refectory" });
    const result = applyAction(moved, "p0", { type: "move", to: "sick_bay" });
    expect(result.ok).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = newGame();
    const before = JSON.parse(JSON.stringify(state));
    mustApply(state, "p0", { type: "move", to: "refectory" });
    expect(state).toEqual(before);
  });

  it("advances the cycle and refills AP once everyone is ready", () => {
    let state = mustApply(newGame(), "p0", { type: "move", to: "refectory" });
    for (const s of seats) state = mustApply(state, s.id, { type: "ready" });
    expect(state.cycle).toBe(2);
    expect(state.players.every((p) => p.ap === DEFAULT_CONFIG.apPerCycle && !p.ready)).toBe(true);
  });
});

describe("viewFor (hidden information)", () => {
  it("never exposes other players' roles or the RNG state", () => {
    const state = newGame();
    for (const s of seats) {
      const view = viewFor(state, s.id);
      for (const other of view.players) expect(other).not.toHaveProperty("role");
      const json = JSON.stringify(view);
      expect(json).not.toContain('"rng"');
      // Only the viewer's own role appears anywhere in the serialized view.
      expect(json.match(/"role"/g)).toHaveLength(1);
    }
  });

  it("filters private log entries", () => {
    const state = newGame();
    state.log.push({ cycle: 1, text: "secret", visibleTo: ["p1"] });
    expect(viewFor(state, "p1").log.some((e) => e.text === "secret")).toBe(true);
    expect(viewFor(state, "p2").log.some((e) => e.text === "secret")).toBe(false);
  });
});
