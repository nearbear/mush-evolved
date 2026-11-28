import { describe, expect, it } from "vitest";
import { MODIFIERS, contaminationCapacity } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, nextDay, offered, player, testConfig } from "./support.ts";

const seats = makeSeats(4);
// MP starts empty, so a move converts AP.
const config = testConfig({ startMp: 0 });

/** p0 is human, p1 is human, p2 is Mush, p3 is human; everyone in one room. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 2 ? "mush" : "human";
    p.alpha = i === 2;
  });
  return s;
}

const bondBoth = (s: GameState, a: PlayerId, b: PlayerId) =>
  mustApply(mustApply(s, a, { type: "bond", target: b }), b, { type: "bond", target: a });
const dtt = (target: PlayerId): Action => ({ type: "dtt", target });
const stt = (target: PlayerId): Action => ({ type: "stt", target });

describe("bonding", () => {
  it("costs 1 AP, is one-way, and is offered only for living people in your room", () => {
    const s0 = ship();
    s0.players[3]!.room = "SICK_BAY";
    expect(offered(s0, "p0")).toContainEqual({ type: "bond", target: "p1" });
    expect(offered(s0, "p0")).not.toContainEqual({ type: "bond", target: "p3" });
    expect(offered(s0, "p0")).not.toContainEqual({ type: "bond", target: "p0" });
    const s = mustApply(s0, "p0", { type: "bond", target: "p1" });
    expect(player(s, "p0").ap).toBe(config.startAp - 1);
    expect(player(s, "p1").ap).toBe(config.startAp);
    expect(viewFor(s, "p0").bonds).toEqual({ to: ["p1"], from: [] });
    expect(viewFor(s, "p1").bonds).toEqual({ to: [], from: ["p0"] });
    expect(offered(s, "p0")).not.toContainEqual({ type: "bond", target: "p1" });
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
    expect(offered(s, "p0")).toContainEqual(dtt("p1"));
    expect(offered(s, "p0")).toContainEqual(stt("p1"));
    expect(offered(s, "p0")).not.toContainEqual(dtt("p2"));
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
    expect(viewFor(s, "p0").log.at(-1)).toEqual(expect.objectContaining({ key: "shareDid", params: { name: "chun" } }));
    expect(viewFor(s, "p1").log.at(-1)).toEqual(expect.objectContaining({ key: "shareDidToYou", params: { name: "chao" } }));
    expect(viewFor(s, "p3").log.map((e) => e.key)).not.toContain("shareDid");
  });

  it("log DTT as one line naming both, to the two of them only (#506)", () => {
    const s = mustApply(bondBoth(ship(), "p0", "p1"), "p0", dtt("p1"));
    for (const who of ["p0", "p1"])
      expect(viewFor(s, who).log).toContainEqual(expect.objectContaining({ key: "dttDone", params: { name: "chao", target: "chun" } }));
    expect(viewFor(s, "p3").log.map((e) => e.key)).not.toContain("dttDone");
  });

  it("allow one per day for the pair: not twice, not both, and either partner is blocked", () => {
    let s = bondBoth(ship(), "p0", "p1");
    s = mustApply(s, "p0", stt("p1"));
    for (const [who, other] of [["p0", "p1"], ["p1", "p0"]] as const) {
      expect(applyAction(s, who, stt(other)).ok).toBe(false);
      expect(applyAction(s, who, dtt(other)).ok).toBe(false);
    }
    expect(offered(s, "p1").some((a) => a.type === "dtt" || a.type === "stt")).toBe(false);
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

describe("action costs in the view", () => {
  it("carries each offered action's cost", () => {
    const s = ship();
    expect(costOf(s, "p0", { type: "bond" })).toEqual({ ap: config.bond.cost.ap, mp: 0 });
    expect(costOf(s, "p0", { type: "move" })).toEqual({ ap: 1, mp: -2 }); // 0 MP: 1 AP converts to 3 MP, then 1 is spent
  });
});
