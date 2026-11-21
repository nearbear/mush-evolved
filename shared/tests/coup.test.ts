import { describe, expect, it } from "vitest";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, nextCycle, offered, pickSkill, player, testConfig } from "./support.ts";

const base: GameConfig = testConfig({ startMp: 0 });
const coup: Action = { type: "coup", equipment: "NEXUS_ROOM:NERON_CORE" };

/** p0 is a Politician at the NERON core with p1; p2 elsewhere. */
function ship(config = base): GameState {
  const s = createGame(makeSeats(4), config, 3);
  player(s, "p0").room = player(s, "p1").room = "NEXUS_ROOM";
  return pickSkill(s, "p0", "politician");
}

const commander = (s: GameState) => s.titles.commander;

describe("Politician's Coup", () => {
  it("pins the confirmed numbers", () => {
    expect([base.coup.cost.ap, base.coup.dirtyChance]).toEqual([3, 0.5]);
  });

  it("is offered only to a Politician at the NERON core who is not Commander", () => {
    const s = ship();
    s.titles.commander = "p1";
    expect(offered(s, "p0")).toContainEqual(coup);
    expect(offered(s, "p1").some((a) => a.type === "coup")).toBe(false);
    s.titles.commander = "p0";
    expect(offered(s, "p0").some((a) => a.type === "coup")).toBe(false);
    s.titles.commander = "p1";
    player(s, "p0").room = "REFECTORY";
    expect(offered(s, "p0").some((a) => a.type === "coup")).toBe(false);
  });

  it("costs 3 AP, marks the coup pending and refuses a second while pending; illegal use leaves the state alone", () => {
    const s = ship();
    s.titles.commander = "p1";
    const ap = player(s, "p0").ap;
    const bad = applyAction(s, "p1", coup);
    expect(bad.ok).toBe(false);
    const r = applyAction(s, "p0", coup);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(ap - base.coup.cost.ap);
    expect(player(r.state, "p0").coupPending).toBe(true);
    expect(commander(r.state)).toBe("p1");
    expect(applyAction(r.state, "p0", coup).ok).toBe(false);
  });

  it("makes the Politician Commander at the next cycle change, announced in crew chat, and clears the flag", () => {
    const s = ship();
    s.titles.commander = "p1";
    const r = applyAction(s, "p0", coup);
    if (!r.ok) throw new Error(r.error);
    const next = nextCycle(r.state);
    expect(commander(next)).toBe("p0");
    expect(player(next, "p0").coupPending).toBeUndefined();
    expect(next.chat.some((m) => m.channel === "global" && m.system?.key === "titlePassed" && m.system.params?.title === "commander")).toBe(true);
  });

  it("does nothing if the Politician died before the cycle change", () => {
    const s = ship();
    s.titles.commander = "p1";
    const r = applyAction(s, "p0", coup);
    if (!r.ok) throw new Error(r.error);
    const dead = structuredClone(r.state);
    killPlayer(dead, player(dead, "p0"), "starvation");
    const next = nextCycle(dead);
    expect(commander(next)).toBe("p1");
    expect(player(next, "p0").coupPending).toBeUndefined();
  });

  it("can be repeated after the title is lost again", () => {
    let s = ship();
    s.titles.commander = "p1";
    s = nextCycle(must(applyAction(s, "p0", coup)));
    expect(commander(s)).toBe("p0");
    s.titles.commander = "p1";
    expect(offered(s, "p0")).toContainEqual(coup);
  });

  it("never shows a pending coup to anyone else", () => {
    const s = ship();
    s.titles.commander = "p1";
    const r = applyAction(s, "p0", coup);
    if (!r.ok) throw new Error(r.error);
    expect(JSON.stringify(viewFor(r.state, "p1").players)).not.toContain("coupPending");
    expect(viewFor(r.state, "p0").you.coupPending).toBe(true);
  });
});

function must(r: ReturnType<typeof applyAction>): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
