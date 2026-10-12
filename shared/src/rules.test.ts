import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG, SHIP_ROOMS } from "./config.ts";
import { moveCost, movementRules, MODIFIERS } from "./modifiers.ts";
import { applyAction, CHAT_HISTORY, createGame, logPrivate, logSecret, MAX_CHAT_LENGTH, sendChat, viewFor } from "./rules.ts";
import type { Action, GameState, MovementRules, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: i > 0,
  character: CHARACTERS[i]!.id,
}));
const newGame = (seed = 42) => createGame(seats, DEFAULT_CONFIG, seed);

const player = (state: GameState, id: PlayerId) => state.players.find((p) => p.id === id)!;
const move = (to: string): Action => ({ type: "move", to });

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
  it("moves along an edge, converting 1 AP into 3 MP when MP is empty", () => {
    const next = mustApply(newGame(), "p0", move("CORRIDOR_A"));
    const p0 = player(next, "p0");
    expect(p0.room).toBe("CORRIDOR_A");
    expect(p0.ap).toBe(DEFAULT_CONFIG.apPerCycle - 1);
    expect(p0.mp).toBe(2);
  });

  it("spends MP before AP: three moves cost one AP, the fourth converts again", () => {
    let state = newGame();
    for (const to of ["CORRIDOR_A", "LABORATORY", "CORRIDOR_A"]) state = mustApply(state, "p0", move(to));
    expect(player(state, "p0")).toMatchObject({ ap: DEFAULT_CONFIG.apPerCycle - 1, mp: 0 });
    state = mustApply(state, "p0", move("LABORATORY"));
    expect(player(state, "p0")).toMatchObject({ ap: DEFAULT_CONFIG.apPerCycle - 2, mp: 2 });
  });

  it("offers no moves with neither MP nor AP left", () => {
    const state = newGame();
    Object.assign(player(state, "p0"), { ap: 0, mp: 0 });
    expect(viewFor(state, "p0").legalActions.some((a) => a.type === "move")).toBe(false);
  });

  it("keeps MP across cycles", () => {
    let state = mustApply(newGame(), "p0", move("CORRIDOR_A"));
    for (const s of seats) state = mustApply(state, s.id, { type: "ready" });
    expect(player(state, "p0").mp).toBe(2);
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

describe("moveCost", () => {
  const rules: MovementRules = { mpPerMove: 1, apPerConversion: 1, mpPerConversion: 3, mpCap: 12 };

  it("uses MP when there is enough", () => {
    expect(moveCost(rules, { ap: 0, mp: 1 })).toEqual({ ap: 0, mpAfter: 0 });
  });

  it("converts AP when MP is short", () => {
    expect(moveCost(rules, { ap: 1, mp: 0 })).toEqual({ ap: 1, mpAfter: 2 });
  });

  it("never converts past the MP cap", () => {
    expect(moveCost({ ...rules, mpPerMove: 2, mpCap: 2 }, { ap: 1, mp: 1 })).toEqual({ ap: 1, mpAfter: 0 });
  });

  it("is unaffordable without MP or enough AP", () => {
    expect(moveCost(rules, { ap: 0, mp: 0 })).toBeNull();
    expect(moveCost({ ...rules, mpPerMove: 5, mpPerConversion: 3 }, { ap: 4, mp: 0 })).toBeNull();
  });
});

describe("modifiers", () => {
  it("fold a player's modifiers over the base movement rules, in order", () => {
    const state = newGame();
    player(state, "p0").modifiers = ["double", "plusOne"];
    const registry = {
      double: { movement: (r: MovementRules) => ({ ...r, mpPerConversion: r.mpPerConversion * 2 }) },
      plusOne: { movement: (r: MovementRules) => ({ ...r, mpPerConversion: r.mpPerConversion + 1 }) },
    };
    expect(movementRules(state, player(state, "p0"), registry).mpPerConversion).toBe(7);
    expect(movementRules(state, player(state, "p1"), registry)).toEqual(DEFAULT_CONFIG.movement);
  });

  it("change what a move actually costs", () => {
    MODIFIERS["test:richConversion"] = { movement: (r) => ({ ...r, mpPerConversion: 5 }) };
    try {
      const state = newGame();
      player(state, "p0").modifiers = ["test:richConversion"];
      expect(player(mustApply(state, "p0", move("CORRIDOR_A")), "p0").mp).toBe(4);
    } finally {
      delete MODIFIERS["test:richConversion"];
    }
  });
});

describe("room log", () => {
  const texts = (state: GameState, id: PlayerId) => viewFor(state, id).log.map((e) => e.text);

  it("shows a room's public history only to players in that room, including what happened before they came", () => {
    let state = mustApply(newGame(), "p1", move("CORRIDOR_A")); // p1: lab -> corridor
    expect(texts(state, "p0")).toContain("Player 1 left for Corridor front.");
    expect(texts(state, "p0")).not.toContain("Player 1 entered from Laboratory.");
    state = mustApply(state, "p0", move("CORRIDOR_A"));
    expect(texts(state, "p0")).toContain("Player 1 entered from Laboratory.");
    expect(texts(state, "p0")).not.toContain("Player 1 left for Corridor front.");
  });

  it("always shows ship-wide entries", () => {
    const state = mustApply(newGame(), "p0", move("CORRIDOR_A"));
    expect(texts(state, "p0")).toContain("The crew wakes up aboard the ship.");
  });

  it("never shows private entries to anyone else", () => {
    const state = newGame();
    logPrivate(state, "p0", "you feel watched");
    expect(texts(state, "p0")).toContain("you feel watched");
    expect(texts(state, "p1")).not.toContain("you feel watched");
  });

  it("makes secret actions room history only when someone else witnessed them", () => {
    let state = newGame(); // everyone in the lab
    logSecret(state, "p0", "witnessed");
    expect(texts(state, "p1")).toContain("witnessed");

    state = mustApply(state, "p0", move("CORRIDOR_A")); // p0 alone in the corridor
    logSecret(state, "p0", "unseen");
    expect(texts(state, "p0")).toContain("unseen");
    state = mustApply(state, "p1", move("CORRIDOR_A")); // arriving later doesn't reveal it
    expect(texts(state, "p1")).not.toContain("unseen");
  });
});

describe("chat", () => {
  const mustChat = (state: GameState, id: PlayerId, text: string) => {
    const r = sendChat(state, id, "global", text);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it("posts trimmed global messages that everyone sees, labeled with sender and bot status", () => {
    const state = mustChat(newGame(), "p1", "  hello  ");
    for (const s of seats) {
      expect(viewFor(state, s.id).chat).toEqual([
        { id: 1, cycle: 1, channel: "global", from: "p1", name: "Player 1", isBot: true, text: "hello" },
      ]);
    }
  });

  it("rejects empty and over-long messages without changing state", () => {
    const state = newGame();
    expect(sendChat(state, "p0", "global", "   ").ok).toBe(false);
    expect(sendChat(state, "p0", "global", "x".repeat(MAX_CHAT_LENGTH + 1)).ok).toBe(false);
    expect(state.chat).toEqual([]);
  });

  it("keeps only the most recent history", () => {
    let state = newGame();
    for (let i = 0; i < CHAT_HISTORY + 5; i++) state = mustChat(state, "p0", `m${i}`);
    expect(state.chat).toHaveLength(CHAT_HISTORY);
    expect(state.chat[0]!.text).toBe("m5");
  });

  it("is closed to dead players", () => {
    const state = newGame();
    player(state, "p0").alive = false;
    expect(sendChat(state, "p0", "global", "boo").ok).toBe(false);
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
