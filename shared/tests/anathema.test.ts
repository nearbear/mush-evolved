import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, nextDay, offered, player, pickSkill } from "./support.ts";

// MP starts empty, so each move converts AP.
const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], startMp: 0 };
const curse = (target: string): Action => ({ type: "anathema", target });
const work = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });
const pick = pickSkill;

/** p0 is a Persecutor; p0, p1 and p3 share the sick bay, p2 is in the refectory. */
function ship(config = base): GameState {
  const s = createGame(makeSeats(4), config, 3);
  player(s, "p0").room = player(s, "p1").room = player(s, "p3").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  return pick(s, "p0", "juge");
}

describe("Persecutor's Anathema", () => {
  it("pins the decided numbers: 1 AP, x0.8", () => {
    expect([base.anathema.cost.ap, base.anathema.successFactor]).toEqual([1, 0.8]);
  });

  it("is offered only to a Persecutor, once per roommate, never for people elsewhere", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "anathema")).toEqual([curse("p1"), curse("p3")]);
    expect(offered(s, "p1").some((a) => a.type === "anathema")).toBe(false);
    expect(applyAction(s, "p1", curse("p3")).ok).toBe(false);
    expect(applyAction(s, "p0", curse("p2")).ok).toBe(false);
    expect(applyAction(s, "p0", curse("p0")).ok).toBe(false);
  });

  it("costs 1 AP, makes the target an Outcast and writes public room history", () => {
    const s = ship();
    const ap = player(s, "p0").ap;
    const r = applyAction(s, "p0", curse("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(ap - base.anathema.cost.ap);
    expect(player(r.state, "p1").outcastBy).toBe("p0");
    expect(viewFor(r.state, "p3").log.some((e) => e.key === "anathema")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "anathema")).toBe(false);
    expect(offered(r.state, "p0").filter((a) => a.type === "anathema")).toEqual([curse("p3")]);
  });

  it("is public to the room, but nobody learns who cast it", () => {
    const r = applyAction(ship(), "p0", curse("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(viewFor(r.state, "p3").players.find((o) => o.id === "p1")?.statuses).toContain("outcast");
    expect(viewFor(r.state, "p1").statuses).toContain("outcast");
    expect(viewFor(r.state, "p2").players.find((o) => o.id === "p1")?.statuses ?? []).not.toContain("outcast");
    for (const id of ["p0", "p1", "p2", "p3"]) expect(JSON.stringify(viewFor(r.state, id))).not.toContain("outcastBy");
  });

  it("moves the curse when the Persecutor curses someone else", () => {
    const s = ship();
    const a = applyAction(s, "p0", curse("p1"));
    if (!a.ok) throw new Error(a.error);
    const b = applyAction(a.state, "p0", curse("p3"));
    if (!b.ok) throw new Error(b.error);
    expect(player(b.state, "p1").outcastBy).toBeUndefined();
    expect(player(b.state, "p3").outcastBy).toBe("p0");
  });

  it("has no daily limit", () => {
    let s = ship();
    for (const t of ["p1", "p3", "p1", "p3"]) {
      const r = applyAction(s, "p0", curse(t));
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(player(s, "p3").outcastBy).toBe("p0");
  });

  it("an Outcast's actions that roll succeed 20% less; certain ones stay certain", () => {
    const s = ship();
    const before = viewFor(s, "p1").actions.find((a) => a.action.type === "punch")!.chance;
    const r = applyAction(s, "p0", curse("p1"));
    if (!r.ok) throw new Error(r.error);
    const after = viewFor(r.state, "p1").actions.find((a) => a.action.type === "punch")!.chance;
    expect(after).toBeCloseTo(before! * base.anathema.successFactor);
    expect(viewFor(r.state, "p1").actions.find((a) => a.action.type === "take")?.chance ?? 1).toBe(1);
  });

  it("an Outcast's covert and secret actions become public room history", () => {
    const s = ship();
    const r = applyAction(s, "p0", curse("p1"));
    if (!r.ok) throw new Error(r.error);
    const st = r.state;
    player(st, "p1").role = "mush";
    player(st, "p1").spores = 1;
    const spiked = applyAction(st, "p1", { type: "spike", target: "p3" });
    if (!spiked.ok) throw new Error(spiked.error);
    expect(viewFor(spiked.state, "p0").log.some((e) => e.key === "spiked")).toBe(true);
  });

  it("without the curse, the same spike stays hidden from a bystander", () => {
    const st = ship();
    player(st, "p1").role = "mush";
    player(st, "p1").spores = 1;
    const spiked = applyAction(st, "p1", { type: "spike", target: "p3" });
    if (!spiked.ok) throw new Error(spiked.error);
    expect(viewFor(spiked.state, "p0").log.some((e) => e.key === "spiked")).toBe(false);
  });

  it("ends when the Outcast dies, and when the Persecutor dies", () => {
    const s = ship();
    const r = applyAction(s, "p0", curse("p1"));
    if (!r.ok) throw new Error(r.error);
    const a = structuredClone(r.state);
    killPlayer(a, player(a, "p1"));
    expect(player(a, "p1").outcastBy).toBeUndefined();
    const b = structuredClone(r.state);
    killPlayer(b, player(b, "p0"));
    expect(player(b, "p1").outcastBy).toBeUndefined();
    expect(viewFor(b, "p3").players.find((o) => o.id === "p1")?.statuses ?? []).not.toContain("outcast");
  });

  it("is a valid client message", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: curse("p1") }))).toEqual({ type: "action", action: curse("p1") });
  });
});

describe("Designer", () => {
  const nexus = (s: GameState, id: string) => {
    player(s, id).room = "NEXUS_ROOM";
    return s;
  };

  it("pins the decided numbers: 2 a day and when picked, up to 4", () => {
    expect([base.designer.pointsPerDay, base.designer.capPoints]).toEqual([2, 4]);
  });

  it("grants 2 Designer points when picked and 2 each day, up to 4", () => {
    let s = pick(createGame(makeSeats(2), base, 3), "p0", "designer");
    expect(player(s, "p0").resources.core).toBe(2);
    s = nextDay(s);
    expect(player(s, "p0").resources.core).toBe(4);
    s = nextDay(s);
    expect(player(s, "p0").resources.core).toBe(4);
    expect(player(s, "p1").resources.core).toBe(0);
  });

  it("makes a NERON project free and is spent before a Computer point", () => {
    let s = nexus(pick(createGame(makeSeats(2), base, 3), "p0", "designer"), "p0");
    player(s, "p0").resources.comp = 1;
    const ap = player(s, "p0").ap;
    const r = applyAction(s, "p0", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(ap);
    expect([player(r.state, "p0").resources.core, player(r.state, "p0").resources.comp]).toEqual([1, 1]);
  });

  it("does not make research free", () => {
    const s = pick(createGame(makeSeats(2), base, 3), "p0", "designer");
    player(s, "p0").room = "RESEARCH_LAB";
    const r = applyAction(s, "p0", { type: "research", equipment: "RESEARCH_LAB:RESEARCH_TERMINAL", research: "MUSHOPHAGE_BACTERIA" } as Action);
    if (r.ok) expect(player(r.state, "p0").ap).toBe(player(s, "p0").ap - base.research.cost.ap);
    expect(player(s, "p0").resources.core).toBe(2);
  });
});

describe("Sprinter", () => {
  it("each AP-to-MP conversion gives 2 MP more, still capped", () => {
    const plain = createGame(makeSeats(2), base, 3);
    const sprinter = pick(createGame(makeSeats(2), base, 3), "p0", "sprint");
    const move = (s: GameState) => {
      const to = viewFor(s, "p0").actions.find((a) => a.action.type === "move")!.action;
      const r = applyAction(s, "p0", to);
      if (!r.ok) throw new Error(r.error);
      return { mp: player(r.state, "p0").mp, ap: player(r.state, "p0").ap };
    };
    const a = move(plain);
    const b = move(sprinter);
    expect(b.mp - a.mp).toBe(base.sprinter.extraMpPerConversion);
    expect(b.ap).toBe(a.ap);
    expect(b.mp).toBeLessThanOrEqual(base.movement.mpCap);
  });
});
