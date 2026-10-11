import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG, SHIP_ROOMS } from "./config.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { Action, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: i > 0,
  character: CHARACTERS[i]!.id,
}));
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

  it("starts everyone in the laboratory", () => {
    expect(newGame().players.every((p) => p.room === "LABORATORY")).toBe(true);
  });

  it("assigns the configured number of Mush", () => {
    const mush = newGame().players.filter((p) => p.role === "mush");
    expect(mush).toHaveLength(DEFAULT_CONFIG.mushCount);
  });
});

describe("ship map", () => {
  const rooms = DEFAULT_CONFIG.rooms;

  it("has a way back through every door", () => {
    for (const [from, targets] of Object.entries(rooms)) {
      for (const to of targets) expect(rooms[to], `${from} -> ${to}`).toContain(from);
    }
  });

  it("can reach every room from the start room", () => {
    const seen = new Set([DEFAULT_CONFIG.startRoom]);
    for (const room of seen) for (const next of rooms[room] ?? []) seen.add(next);
    expect([...seen].sort()).toEqual(SHIP_ROOMS.map((r) => r.id).sort());
  });
});

describe("applyAction", () => {
  it("moves along an edge and spends AP", () => {
    const next = mustApply(newGame(), "p0", { type: "move", to: "CORRIDOR_A" });
    const p0 = next.players.find((p) => p.id === "p0")!;
    expect(p0.room).toBe("CORRIDOR_A");
    expect(p0.ap).toBe(DEFAULT_CONFIG.apPerCycle - DEFAULT_CONFIG.moveCost);
  });

  it("rejects moves to non-adjacent rooms without changing state", () => {
    const moved = mustApply(newGame(), "p0", { type: "move", to: "CORRIDOR_A" });
    const result = applyAction(moved, "p0", { type: "move", to: "REFECTORY" });
    expect(result.ok).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = newGame();
    const before = JSON.parse(JSON.stringify(state));
    mustApply(state, "p0", { type: "move", to: "CORRIDOR_A" });
    expect(state).toEqual(before);
  });

  it("advances the cycle and refills AP once everyone is ready", () => {
    let state = mustApply(newGame(), "p0", { type: "move", to: "CORRIDOR_A" });
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

  it("shows every other player's character", () => {
    const view = viewFor(newGame(), "p0");
    for (const other of view.players) {
      expect(other.character).toBe(seats.find((s) => s.id === other.id)!.character);
    }
  });

  it("filters private log entries", () => {
    const state = newGame();
    state.log.push({ cycle: 1, text: "secret", visibleTo: ["p1"] });
    expect(viewFor(state, "p1").log.some((e) => e.text === "secret")).toBe(true);
    expect(viewFor(state, "p2").log.some((e) => e.text === "secret")).toBe(false);
  });
});
