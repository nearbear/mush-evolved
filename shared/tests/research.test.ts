import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { RESEARCH_IDS } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: i > 0, character: CHARACTERS[i]!.id }));
const work = (research: string): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research });
const AP = DEFAULT_CONFIG.research.cost.ap;

function game(room = "LABORATORY") {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("research", () => {
  it("starts with nothing done and every research offered at the research lab", () => {
    const s = game();
    expect(s.research).toEqual({});
    const offered = viewFor(s, "p0").legalActions.flatMap((a) => (a.type === "research" ? [a.research] : []));
    expect(offered.sort()).toEqual([...RESEARCH_IDS].sort());
    expect(RESEARCH_IDS).toHaveLength(24);
  });

  it("costs 2 AP and advances the chosen research by 25%, for anyone", () => {
    const s = game();
    const ap = s.players[1]!.ap;
    const r = applyAction(s, "p1", work("MYCOSCAN"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.research).toEqual({ MYCOSCAN: 25 });
    expect(r.state.players[1]!.ap).toBe(ap - AP);
    // No repeat penalty: the same player can go straight on.
    const again = applyAction(r.state, "p1", work("MYCOSCAN"));
    expect(again.ok && again.state.research.MYCOSCAN).toBe(50);
  });

  it("completes at 100% and then is no longer offered or accepted", () => {
    let s = game();
    for (let i = 0; i < 4; i++) {
      s.players[0]!.ap = 12;
      const r = applyAction(s, "p0", work("STEROIDS"));
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.research.STEROIDS).toBe(100);
    expect(s.log.at(-1)?.key).toBe("researchCompleted");
    s.players[0]!.ap = 12;
    expect(viewFor(s, "p0").legalActions).not.toContainEqual(work("STEROIDS"));
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(false);
  });

  it("is refused when dirty, too poor, in another room, or for an unknown research", () => {
    const s = game();
    addStatus(s.players[0]!, "dirty");
    expect(applyAction(s, "p0", work("MYCOSCAN")).ok).toBe(false);
    expect(viewFor(s, "p0").legalActions.some((a) => a.type === "research")).toBe(false);
    s.players[1]!.ap = AP - 1;
    expect(applyAction(s, "p1", work("MYCOSCAN")).ok).toBe(false);
    expect(applyAction(game("REFECTORY"), "p0", work("MYCOSCAN")).ok).toBe(false);
    expect(applyAction(s, "p2", work("NO_SUCH_RESEARCH")).ok).toBe(false);
    expect(s.research).toEqual({});
  });

  it("is public: everyone sees progress, wherever they are, and the room sees the log line", () => {
    const s = game();
    s.players[2]!.room = "REFECTORY";
    const r = applyAction(s, "p0", work("MYCO_ALARM"));
    if (!r.ok) throw new Error("expected ok");
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(r.state, id).research).toEqual({ MYCO_ALARM: 25 });
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "researched")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "researched")).toBe(false);
  });

  it("parses from the wire, and rejects a missing research", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("MYCOSCAN") }))).toEqual({ type: "action", action: work("MYCOSCAN") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "research", equipment: "x" } }))).toBeNull();
  });
});

describe("computer scientist skill (computer)", () => {
  const cfg = DEFAULT_CONFIG.computer;
  const pick = (s: ReturnType<typeof game>) => {
    const r = applyAction(s, "p0", { type: "pick_skill", skill: "computer" });
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it("grants 2 Computer points when picked, capped at 4, and nothing to others", () => {
    const s = pick(game());
    expect(s.players[0]!.resources.comp).toBe(cfg.pointsPerDay);
    expect(s.players[1]!.resources.comp).toBe(0);
    const start = createGame(seats, { ...DEFAULT_CONFIG, startSkills: ["computer"] }, 7);
    expect(start.players[0]!.resources.comp).toBe(cfg.pointsPerDay);
  });

  it("pays for a research with 2 Computer points instead of AP", () => {
    const s = pick(game());
    const ap = s.players[0]!.ap;
    const r = applyAction(s, "p0", work("MYCOSCAN"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.resources.comp).toBe(0);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.research.MYCOSCAN).toBe(25);
    // Out of points, it costs AP again.
    const again = applyAction(r.state, "p0", work("MYCOSCAN"));
    expect(again.ok && again.state.players[0]!.ap).toBe(ap - AP);
  });

  it("works with no AP left, and is refused with neither", () => {
    const s = pick(game());
    s.players[0]!.ap = 0;
    expect(applyAction(s, "p0", work("MYCOSCAN")).ok).toBe(true);
    s.players[0]!.resources.comp = 1;
    expect(applyAction(s, "p0", work("MYCOSCAN")).ok).toBe(false);
  });

  it("adds 2 at each day boundary, up to the cap", () => {
    let s = pick(game());
    while (s.players[0]!.resources.comp < cfg.capPoints) {
      const day = Math.floor((s.cycle - 1) / DEFAULT_CONFIG.cyclesPerDay);
      while (Math.floor((s.cycle - 1) / DEFAULT_CONFIG.cyclesPerDay) === day)
        for (const p of s.players) {
          const r = applyAction(s, p.id, { type: "ready" });
          if (!r.ok) throw new Error(r.error);
          s = r.state;
        }
    }
    expect(s.players[0]!.resources.comp).toBe(cfg.capPoints);
  });

  it("never lets the pool pass the cap", () => {
    const s = pick(game());
    s.players[0]!.resources.comp = cfg.capPoints;
    const again = pick(Object.assign(s, { players: s.players.map((p) => ({ ...p, skills: [] })) }));
    expect(again.players[0]!.resources.comp).toBe(cfg.capPoints);
  });

  it("keeps the pool out of other players' views", () => {
    const s = pick(game());
    expect(viewFor(s, "p0").you.resources.comp).toBe(cfg.pointsPerDay);
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain('"comp":2');
  });
});
