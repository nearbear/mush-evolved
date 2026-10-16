import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG, SHIP_ROOMS } from "./config.ts";
import { apGain, moveCost, movementRules, MODIFIERS } from "./modifiers.ts";
import { logPrivate, logSecret } from "./log.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import { CHAT_HISTORY, MAX_CHAT_LENGTH, sendChat } from "./chat.ts";
import { ITRACKIE_ITEM } from "./items.ts";
import { parseGameMessage } from "./protocol.ts";
import { CHAT_CHANNELS, type Action, type ChatChannel, type GameState, type MovementRules, type PlayerId, type Seat } from "./types.ts";

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

  it("starts everyone at full HP and half morale", () => {
    for (const p of newGame().players) expect(p).toMatchObject({ hp: 14, morale: 7 });
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
    expect(p0.ap).toBe(DEFAULT_CONFIG.startAp - 1);
    expect(p0.mp).toBe(2);
  });

  it("spends MP before AP: three moves cost one AP, the fourth converts again", () => {
    let state = newGame();
    for (const to of ["CORRIDOR_A", "LABORATORY", "CORRIDOR_A"]) state = mustApply(state, "p0", move(to));
    expect(player(state, "p0")).toMatchObject({ ap: DEFAULT_CONFIG.startAp - 1, mp: 0 });
    state = mustApply(state, "p0", move("LABORATORY"));
    expect(player(state, "p0")).toMatchObject({ ap: DEFAULT_CONFIG.startAp - 2, mp: 2 });
  });

  it("offers no moves with neither MP nor AP left", () => {
    const state = newGame();
    Object.assign(player(state, "p0"), { ap: 0, mp: 0 });
    expect(viewFor(state, "p0").legalActions.some((a) => a.type === "move")).toBe(false);
  });

  describe("days", () => {
    const endCycle = (st: GameState) =>
      st.players.filter((p) => p.alive).reduce((s2, p) => mustApply(s2, p.id, { type: "ready" }), st);
    const morale = (st: GameState, id: PlayerId) => player(st, id).morale;

    it("starts on day 1, cycle 1 and derives the day from the cycle", () => {
      const v = viewFor(newGame(), "p0");
      expect([v.day, v.cycleOfDay]).toEqual([1, 1]);
    });

    it("costs every living player 1 morale only when a day ends", () => {
      let state = newGame();
      const start = morale(state, "p0");
      for (let i = 0; i < DEFAULT_CONFIG.cyclesPerDay - 1; i++) state = endCycle(state);
      expect(viewFor(state, "p0").cycleOfDay).toBe(DEFAULT_CONFIG.cyclesPerDay);
      expect(morale(state, "p0")).toBe(start);
      state = endCycle(state);
      const v = viewFor(state, "p0");
      expect([v.day, v.cycleOfDay]).toEqual([2, 1]);
      expect(state.players.every((p) => p.morale === start - 1)).toBe(true);
      expect(state.log.some((e) => e.key === "dayBegins" && e.params?.day === 2 && e.visibleTo === "all")).toBe(true);
    });

    it("never takes morale below 0 and skips the dead", () => {
      let state = newGame();
      player(state, "p0").morale = 0;
      player(state, "p1").alive = false;
      const dead = morale(state, "p1");
      for (let i = 0; i < DEFAULT_CONFIG.cyclesPerDay; i++) state = endCycle(state);
      expect(morale(state, "p0")).toBe(0);
      expect(morale(state, "p1")).toBe(dead);
    });
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

  it("advances the cycle once everyone is ready, adding 1 AP to what is left", () => {
    let state = mustApply(newGame(), "p0", { type: "move", to: "CORRIDOR_A" });
    for (const s of seats) state = mustApply(state, s.id, { type: "ready" });
    expect(state.cycle).toBe(2);
    expect(player(state, "p0").ap).toBe(8); // started 8, spent 1, gained 1
    expect(state.players.filter((p) => p.id !== "p0").every((p) => p.ap === 9 && !p.ready)).toBe(true);
  });

  it("never gains AP past the cap of 12", () => {
    let state = newGame();
    for (let cycle = 0; cycle < 6; cycle++) for (const s of seats) state = mustApply(state, s.id, { type: "ready" });
    expect(state.cycle).toBe(7);
    expect(state.players.every((p) => p.ap === 12)).toBe(true);
    expect(viewFor(state, "p0").maxAp).toBe(12);
  });

  it("gains 2 AP per cycle while lying down", () => {
    let state = newGame();
    player(state, "p0").modifiers.push("lying_down");
    for (const s of seats) state = mustApply(state, s.id, { type: "ready" });
    expect(player(state, "p0").ap).toBe(10);
    expect(player(state, "p1").ap).toBe(9);
    expect(apGain(state, player(state, "p0"))).toBe(2);
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
  const texts = (state: GameState, id: PlayerId) => viewFor(state, id).log.map((e) => e.key + (e.params ? ` ${JSON.stringify(e.params)}` : ""));

  it("shows a room's public history only to players in that room, including what happened before they came", () => {
    let state = mustApply(newGame(), "p1", move("CORRIDOR_A")); // p1: lab -> corridor
    expect(texts(state, "p0")).toContain('left {"name":"Player 1","room":"CORRIDOR_A"}');
    expect(texts(state, "p0")).not.toContain('entered {"name":"Player 1","room":"LABORATORY"}');
    state = mustApply(state, "p0", move("CORRIDOR_A"));
    expect(texts(state, "p0")).toContain('entered {"name":"Player 1","room":"LABORATORY"}');
    expect(texts(state, "p0")).not.toContain("Player 1 left for Corridor front.");
  });

  it("always shows ship-wide entries", () => {
    const state = mustApply(newGame(), "p0", move("CORRIDOR_A"));
    expect(texts(state, "p0")).toContain("crewWakes");
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

  it("keeps only the most recent history, per channel", () => {
    const r = sendChat(newGame(), "p0", "botany", "water the plants");
    if (!r.ok) throw new Error(r.error);
    let state = r.state;
    for (let i = 0; i < CHAT_HISTORY + 5; i++) state = mustChat(state, "p0", `m${i}`);
    const global = state.chat.filter((m) => m.channel === "global");
    expect(global).toHaveLength(CHAT_HISTORY);
    expect(global[0]!.text).toBe("m5");
    expect(state.chat.some((m) => m.channel === "botany")).toBe(true);
  });

  it("is closed to dead players", () => {
    const state = newGame();
    player(state, "p0").alive = false;
    expect(sendChat(state, "p0", "global", "boo").ok).toBe(false);
    expect(viewFor(state, "p0").chatChannels).toEqual([]);
  });
});

describe("iTrackie and feature threads", () => {
  const myITrackie = (state: GameState, id: PlayerId) =>
    viewFor(state, id).inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
  const mustChat = (state: GameState, id: PlayerId, channel: ChatChannel, text: string) => {
    const r = sendChat(state, id, channel, text);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it("starts everyone carrying an iTrackie in one of their slots", () => {
    const state = newGame();
    for (const s of seats) {
      const view = viewFor(state, s.id);
      expect(view.inventory.map((i) => i.type)).toEqual([ITRACKIE_ITEM]);
      expect(view.chatChannels.filter((c) => c !== "mush")).toEqual([...CHAT_CHANNELS]);
    }
  });

  it("posts to a feature thread that every iTrackie holder reads, tagged with its channel", () => {
    const state = mustChat(newGame(), "p1", "pilgred", "need a wrench");
    for (const s of seats) {
      expect(viewFor(state, s.id).chat).toEqual([
        { id: 1, cycle: 1, channel: "pilgred", from: "p1", name: "Player 1", isBot: true, text: "need a wrench" },
      ]);
    }
  });

  it("closes global chat and every thread, reading and posting, once you drop your iTrackie", () => {
    let state = mustChat(newGame(), "p1", "global", "hello");
    state = mustChat(state, "p1", "botany", "plants");
    state = mustApply(state, "p0", { type: "drop", item: myITrackie(state, "p0") });

    const view = viewFor(state, "p0");
    expect(view.chatChannels).toEqual([]);
    expect(view.chat).toEqual([]);
    for (const channel of CHAT_CHANNELS) expect(sendChat(state, "p0", channel, "hi").ok).toBe(false);
    expect(JSON.stringify(view)).not.toContain("plants");
    expect(JSON.stringify(view)).not.toContain("hello");
  });

  it("opens the full history to whoever picks an iTrackie up", () => {
    let state = mustChat(newGame(), "p1", "research", "old news");
    const dropped = myITrackie(state, "p0");
    state = mustApply(state, "p0", { type: "drop", item: dropped });
    state = mustApply(state, "p2", { type: "drop", item: myITrackie(state, "p2") });
    expect(viewFor(state, "p2").chat).toEqual([]);
    state = mustApply(state, "p2", { type: "take", item: dropped });
    expect(viewFor(state, "p2").chat.map((m) => m.text)).toEqual(["old news"]);
  });

  it("parses every channel and rejects unknown ones", () => {
    const chat = (channel: unknown) => parseGameMessage(JSON.stringify({ type: "chat", channel, text: "hi" }));
    for (const channel of [...CHAT_CHANNELS, "mush"]) expect(chat(channel)).toEqual({ type: "chat", channel, text: "hi" });
    for (const bad of ["private", "", 1, null, "__proto__"]) expect(chat(bad)).toBeNull();
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

  describe("ACTOPI", () => {
    // p1 and p2 share a room with p0; p3 and p4 are elsewhere, in different rooms; the rest stay put.
    const spread = (actopi: boolean): GameState => {
      const state = newGame();
      state.actopi = actopi;
      const rooms = Object.keys(DEFAULT_CONFIG.rooms);
      const here = player(state, "p0").room;
      const [a, b] = rooms.filter((r) => r !== here);
      for (const p of state.players) p.room = here;
      player(state, "p3").room = a!;
      player(state, "p4").room = b!;
      return state;
    };

    it("starts on and tells everyone where everyone is", () => {
      expect(newGame().actopi).toBe(true);
      const state = spread(true);
      const view = viewFor(state, "p0");
      expect(view.unidentified).toEqual([]);
      for (const other of view.players) expect(other.room).toBe(player(state, other.id).room);
    });

    it("off: shows room-only dots for people elsewhere, and who is in your own room", () => {
      const state = spread(false);
      const view = viewFor(state, "p0");
      const [a, b] = [player(state, "p3").room, player(state, "p4").room];
      expect(view.unidentified).toEqual([a, b].sort());
      for (const other of view.players) {
        if (other.id === "p3" || other.id === "p4") expect(other).not.toHaveProperty("room");
        else expect(other.room).toBe(player(state, "p0").room);
      }
    });

    it("off: nothing in the view links a far-away person to a room", () => {
      const state = spread(false);
      const json = JSON.stringify(viewFor(state, "p0"));
      const { room: a } = player(state, "p3");
      // Their room is only ever sent as a bare entry of `unidentified`, never next to their id, name or character.
      const entry = JSON.stringify(viewFor(state, "p0").players.find((p) => p.id === "p3"));
      expect(entry).not.toContain(a);
      expect(json).toContain(a);
    });

    it("off: the order of the dots doesn't follow seat order", () => {
      const state = spread(false);
      const [a, b] = [player(state, "p3").room, player(state, "p4").room];
      player(state, "p3").room = b;
      player(state, "p4").room = a;
      expect(viewFor(state, "p0").unidentified).toEqual([a, b].sort());
    });

    it("off: your own room's people stay identified, and you never appear as a dot", () => {
      const state = spread(false);
      const view = viewFor(state, "p3");
      // The six people in the original room, plus p4, all strangers to p3.
      expect(view.unidentified).toEqual([...Array(6).fill(player(state, "p0").room), player(state, "p4").room].sort());
      expect(view.players.filter((p) => p.room !== undefined)).toHaveLength(0);
    });
  });

  it("shows HP and morale only to their owner", () => {
    const state = newGame();
    for (const s of seats) {
      const view = viewFor(state, s.id);
      expect(view.you).toMatchObject({ hp: 14, morale: 7 });
      expect(view).toMatchObject({ maxHp: 14, maxMorale: 14 });
      for (const other of view.players) {
        expect(other).not.toHaveProperty("hp");
        expect(other).not.toHaveProperty("morale");
      }
      const json = JSON.stringify(view);
      expect(json.match(/"hp"/g)).toHaveLength(1);
      expect(json.match(/"morale"/g)).toHaveLength(1);
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
    state.log.push({ cycle: 1, key: "secret", visibleTo: ["p1"] });
    expect(viewFor(state, "p1").log.some((e) => e.key === "secret")).toBe(true);
    expect(viewFor(state, "p2").log.some((e) => e.key === "secret")).toBe(false);
  });
});
