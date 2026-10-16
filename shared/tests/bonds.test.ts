import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS, contaminationCapacity } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] };

/** p0 is human, p1 is human, p2 is Mush, p3 is human; everyone in one room. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 2 ? "mush" : "human";
    p.alpha = i === 2;
  });
  return s;
}

function mustApply(state: GameState, id: PlayerId, ...actions: Action[]): GameState {
  for (const action of actions) {
    const r = applyAction(state, id, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const bondBoth = (s: GameState, a: PlayerId, b: PlayerId) =>
  mustApply(mustApply(s, a, { type: "bond", target: b }), b, { type: "bond", target: a });
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const dtt = (target: PlayerId): Action => ({ type: "dtt", target });
const stt = (target: PlayerId): Action => ({ type: "stt", target });

describe("bonding", () => {
  it("costs 1 AP, is one-way, and is offered only for living people in your room", () => {
    const s0 = ship();
    s0.players[3]!.room = "SICK_BAY";
    expect(viewFor(s0, "p0").legalActions).toContainEqual({ type: "bond", target: "p1" });
    expect(viewFor(s0, "p0").legalActions).not.toContainEqual({ type: "bond", target: "p3" });
    expect(viewFor(s0, "p0").legalActions).not.toContainEqual({ type: "bond", target: "p0" });
    const s = mustApply(s0, "p0", { type: "bond", target: "p1" });
    expect(player(s, "p0").ap).toBe(config.startAp - 1);
    expect(player(s, "p1").ap).toBe(config.startAp);
    expect(viewFor(s, "p0").bonds).toEqual({ to: ["p1"], from: [] });
    expect(viewFor(s, "p1").bonds).toEqual({ to: [], from: ["p0"] });
    expect(viewFor(s, "p0").legalActions).not.toContainEqual({ type: "bond", target: "p1" });
  });

  it("is the same for Mush and can't happen without the AP", () => {
    expect(bondBoth(ship(), "p0", "p2").bonds["p2"]).toEqual(["p0"]);
    const s = ship();
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", { type: "bond", target: "p1" }).ok).toBe(false);
  });

  it("is invisible to anyone else", () => {
    const s = bondBoth(ship(), "p0", "p1");
    for (const other of ["p2", "p3"]) {
      const v = viewFor(s, other);
      expect(v.bonds).toEqual({ to: [], from: [] });
      expect(JSON.stringify(v)).not.toMatch(/bonded/i);
    }
  });
});

describe("DTT and STT", () => {
  it("need a bond both ways, the same room, and 1 AP", () => {
    const one = mustApply(ship(), "p0", { type: "bond", target: "p1" });
    expect(applyAction(one, "p0", dtt("p1")).ok).toBe(false);
    expect(applyAction(one, "p1", stt("p0")).ok).toBe(false);
    const s = bondBoth(ship(), "p0", "p1");
    expect(viewFor(s, "p0").legalActions).toContainEqual(dtt("p1"));
    expect(viewFor(s, "p0").legalActions).toContainEqual(stt("p1"));
    expect(viewFor(s, "p0").legalActions).not.toContainEqual(dtt("p2"));
    const apart = clone(s);
    apart.players[1]!.room = "SICK_BAY";
    expect(applyAction(apart, "p0", dtt("p1")).ok).toBe(false);
    const broke = clone(s);
    player(broke, "p0").ap = 0;
    expect(applyAction(broke, "p0", stt("p1")).ok).toBe(false);
  });

  it("cost only the one who starts it, and give both 2 morale (capped)", () => {
    let s = bondBoth(ship(), "p0", "p1");
    player(s, "p1").morale = config.maxMorale - 1;
    const ap = [player(s, "p0").ap, player(s, "p1").ap];
    const morale = player(s, "p0").morale;
    s = mustApply(s, "p0", stt("p1"));
    expect(player(s, "p0").ap).toBe(ap[0]! - 1);
    expect(player(s, "p1").ap).toBe(ap[1]);
    expect(player(s, "p0").morale).toBe(morale + 2);
    expect(player(s, "p1").morale).toBe(config.maxMorale);
  });

  it("log privately to the two of them only", () => {
    const s = mustApply(bondBoth(ship(), "p0", "p1"), "p0", stt("p1"));
    expect(viewFor(s, "p0").log.at(-1)).toMatchObject({ key: "shareDid", params: { label: "STT", name: "Player 1" } });
    expect(viewFor(s, "p1").log.at(-1)).toMatchObject({ key: "shareDidToYou", params: { label: "STT", name: "Player 0" } });
    expect(JSON.stringify(viewFor(s, "p3").log)).not.toMatch(/STT/);
  });

  it("allow one per day for the pair: not twice, not both, and either partner is blocked", () => {
    let s = bondBoth(ship(), "p0", "p1");
    s = mustApply(s, "p0", stt("p1"));
    for (const [who, other] of [["p0", "p1"], ["p1", "p0"]] as const) {
      expect(applyAction(s, who, stt(other)).ok).toBe(false);
      expect(applyAction(s, who, dtt(other)).ok).toBe(false);
    }
    expect(viewFor(s, "p1").legalActions.some((a) => a.type === "dtt" || a.type === "stt")).toBe(false);
    // Blocked with anyone else for the day too.
    s = bondBoth(s, "p0", "p3");
    expect(applyAction(s, "p3", dtt("p0")).ok).toBe(false);
  });

  it("are available again when the next day begins", () => {
    let s = bondBoth(ship(), "p0", "p1");
    s = mustApply(s, "p0", dtt("p1"));
    expect(applyAction(s, "p0", dtt("p1")).ok).toBe(false);
    s = nextDay(s);
    expect(viewFor(s, "p0").day).toBe(2);
    expect(applyAction(s, "p0", dtt("p1")).ok).toBe(true);
  });
});

/** Everyone readies until the next day begins. */
function nextDay(state: GameState): GameState {
  const day = viewFor(state, "p0").day;
  while (viewFor(state, "p0").day === day) {
    for (const p of seats) state = mustApply(state, p.id, { type: "ready" });
  }
  return state;
}

describe("contamination", () => {
  it("rises by 1 for the human when a DTT includes exactly one Mush, whoever starts it", () => {
    let s = bondBoth(ship(), "p0", "p2");
    s = mustApply(s, "p2", dtt("p0"));
    expect(s.contamination).toEqual({ p0: 1 });
    s = mustApply(nextDay(s), "p0", dtt("p2"));
    expect(s.contamination).toEqual({ p0: 2 });
  });

  it("converts the human at the capacity", () => {
    let s = bondBoth(ship(), "p0", "p2");
    for (let i = 0; i < config.infection.capacity; i++) s = mustApply(i === 0 ? s : nextDay(s), "p0", dtt("p2"));
    expect(player(s, "p0").role).toBe("mush");
    expect(viewFor(s, "p0").log.at(-1)).toMatchObject({ key: "converted" });
    expect(s.contamination).toEqual({});
  });

  it("uses the capacity after modifiers", () => {
    MODIFIERS["test_resistant"] = { contaminationCapacity: (c) => c + 2 };
    try {
      const s = ship();
      player(s, "p0").modifiers.push("test_resistant");
      expect(contaminationCapacity(s, player(s, "p0"))).toBe(config.infection.capacity + 2);
      expect(contaminationCapacity(s, player(s, "p1"))).toBe(config.infection.capacity);
    } finally {
      delete MODIFIERS["test_resistant"];
    }
  });

  it("doesn't change for STT, human-human, or Mush-Mush", () => {
    const s0 = ship();
    player(s0, "p3").role = "mush";
    let s = bondBoth(s0, "p0", "p2");
    s = mustApply(s, "p0", stt("p2"));
    s = mustApply(bondBoth(nextDay(s), "p1", "p0"), "p1", dtt("p0"));
    s = mustApply(bondBoth(s, "p2", "p3"), "p2", dtt("p3"));
    expect(s.contamination).toEqual({});
  });

  it("is in no human's view, and Mush see it only as the human's level", () => {
    const s = mustApply(bondBoth(ship(), "p0", "p2"), "p2", dtt("p0"));
    expect(s.contamination).toEqual({ p0: 1 });
    for (const id of ["p0", "p1", "p3"]) expect(JSON.stringify(viewFor(s, id))).not.toMatch(/contamin/i);
    expect(viewFor(s, "p2").players.find((p) => p.id === "p0")!.contamination).toBe(1);
  });
});

describe("protocol", () => {
  it("parses bond, dtt, and stt and rejects a missing target", () => {
    for (const type of ["bond", "dtt", "stt"]) {
      expect(parseGameMessage(JSON.stringify({ type: "action", action: { type, target: "p1" } }))).toEqual({
        type: "action",
        action: { type, target: "p1" },
      });
      expect(parseGameMessage(JSON.stringify({ type: "action", action: { type } }))).toBeNull();
    }
  });
});

describe("legalCosts", () => {
  it("is index-aligned with legalActions and carries each action's cost", () => {
    const v = viewFor(ship(), "p0");
    expect(v.legalCosts).toHaveLength(v.legalActions.length);
    const i = v.legalActions.findIndex((a) => a.type === "bond");
    expect(v.legalCosts[i]).toEqual({ ap: 1, mp: 0 });
    const m = v.legalActions.findIndex((a) => a.type === "move");
    expect(v.legalCosts[m]).toEqual({ ap: 1, mp: -2 }); // 0 MP: 1 AP converts to 3 MP, then 1 is spent
  });
});
