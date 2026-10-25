import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, offered, pickSkill, stockLab } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (research: string): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research });
const AP = DEFAULT_CONFIG.research.cost.ap;
const researches = (s: Parameters<typeof offered>[0], id: string) => offered(s, id).flatMap((a) => (a.type === "research" ? [a.research] : []));

function game(room = "LABORATORY") {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("research", () => {
  it("has a 25% chance to become dirty after working on research", () => {
    expect(DEFAULT_CONFIG.research.dirtyChance).toBe(0.25);

    const dirty = game();
    dirty.rng = 7;
    dirty.players[1]!.room = "REFECTORY";
    dirty.players[2]!.room = "REFECTORY";
    const result = applyAction(dirty, "p0", work("STEROIDS"));
    if (!result.ok) throw new Error("expected research to succeed");
    expect(result.state.players[0]!.statuses).toContain("dirty");
    expect(viewFor(result.state, "p0").log.some((entry) => entry.key === "becomeDirty")).toBe(true);
    expect(viewFor(result.state, "p1").log.some((entry) => entry.key === "becomeDirty")).toBe(false);

    const clean = game();
    clean.rng = 0;
    const cleanResult = applyAction(clean, "p0", work("STEROIDS"));
    if (!cleanResult.ok) throw new Error("expected research to succeed");
    expect(cleanResult.state.players[0]!.statuses).not.toContain("dirty");

    const free = game();
    free.players[0]!.resources.comp = 1;
    free.rng = 7;
    const freeResult = applyAction(free, "p0", work("STEROIDS"));
    if (!freeResult.ok) throw new Error("expected Computer-point research to succeed");
    expect(freeResult.state.players[0]!.statuses).toContain("dirty");
    expect(freeResult.state.players[0]!.resources.comp).toBe(0);
  });

  it("starts with nothing done and every research offered whose needs the lab meets", () => {
    const s = game();
    expect(s.research).toEqual({});
    expect(RESEARCH_IDS).toHaveLength(24);
    // p1 is Chun and pre-selection is off; the lab has none of the needed items at the start.
    const free = RESEARCH_IDS.filter((id) => !RESEARCH_REQUIRES[id]?.items);
    expect(researches(s, "p0").sort()).toEqual([...free].sort());
    for (const id of RESEARCH_IDS) stockLab(s, "LABORATORY", id);
    expect(researches(s, "p0").sort()).toEqual([...RESEARCH_IDS].sort());
  });

  it("costs 2 AP and advances the chosen research by 25%, for anyone", () => {
    const s = game();
    s.rng = 0;
    const ap = s.players[1]!.ap;
    const r = applyAction(s, "p1", work("STEROIDS"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.research).toEqual({ STEROIDS: 25 });
    expect(r.state.players[1]!.ap).toBe(ap - AP);
    // No repeat penalty: the same player can go straight on.
    r.state.rng = 0;
    const again = applyAction(r.state, "p1", work("STEROIDS"));
    expect(again.ok && again.state.research.STEROIDS).toBe(50);
  });

  it("completes at 100% and then is no longer offered or accepted", () => {
    let s = game();
    for (let i = 0; i < 4; i++) {
      s.players[0]!.ap = 12;
      s.rng = 0;
      const r = applyAction(s, "p0", work("STEROIDS"));
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.research.STEROIDS).toBe(100);
    expect(s.log.at(-1)?.key).toBe("researchCompleted");
    s.players[0]!.ap = 12;
    expect(offered(s, "p0")).not.toContainEqual(work("STEROIDS"));
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(false);
  });

  it("is refused when dirty, too poor, in another room, or for an unknown research", () => {
    const s = game();
    addStatus(s.players[0]!, "dirty");
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "research")).toBe(false);
    s.players[1]!.ap = AP - 1;
    expect(applyAction(s, "p1", work("STEROIDS")).ok).toBe(false);
    expect(applyAction(game("REFECTORY"), "p0", work("STEROIDS")).ok).toBe(false);
    expect(applyAction(s, "p2", work("NO_SUCH_RESEARCH")).ok).toBe(false);
    expect(s.research).toEqual({});
  });

  it("is public: everyone sees progress, wherever they are, and the room sees the log line", () => {
    const s = game();
    s.players[2]!.room = "REFECTORY";
    const r = applyAction(s, "p0", work("STEROIDS"));
    if (!r.ok) throw new Error("expected ok");
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(r.state, id).research).toEqual({ STEROIDS: 25 });
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "researched")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "researched")).toBe(false);
  });

  it("pins the needs taken from the original's research data", () => {
    expect(RESEARCH_REQUIRES.ANTI_MUSH_SERUM).toEqual({ items: ["mush_sample", "mush_floppy_disk"], chun: true, postSelection: true });
    expect(RESEARCH_REQUIRES.NATAMY_GUN).toEqual({ items: ["mush_sample", "blaster"], consumes: ["blaster"] });
    expect(RESEARCH_REQUIRES.MUSHICIDE_SOAP).toEqual({ items: ["soap"], consumes: ["soap"], chun: true });
    expect(RESEARCH_REQUIRES.CONSTIPASPORE_SERUM).toEqual({ items: [ANY_CONSUMABLE, "mush_sample"] });
    // Every needed item exists, and spawns somewhere at the start or comes from a dispenser (coffee).
    const dispensed = Object.values(EQUIPMENT_TYPES).map((e) => e.dispenses);
    for (const type of Object.values(RESEARCH_REQUIRES).flatMap((r) => r.items ?? []).filter((t) => t !== ANY_CONSUMABLE)) {
      expect(ITEM_TYPES[type], type).toBeDefined();
      expect(DEFAULT_CONFIG.startItems.some((i) => i.type === type) || dispensed.includes(type), type).toBe(true);
    }
  });

  it("needs every item in the lab, on the floor or carried by someone there, and refuses without one", () => {
    const s = game();
    expect(researches(s, "p0")).not.toContain("NATAMY_GUN");
    expect(applyAction(s, "p0", work("NATAMY_GUN"))).toMatchObject({ ok: false });
    s.items.push({ id: "sample", type: "mush_sample", at: { kind: "room", id: "LABORATORY" } });
    expect(researches(s, "p0")).not.toContain("NATAMY_GUN");
    // Carried by p2, who is in the lab, counts.
    s.items.push({ id: "gun", type: "blaster", at: { kind: "player", id: "p2" } });
    expect(researches(s, "p0")).toContain("NATAMY_GUN");
    // Elsewhere does not.
    s.players[2]!.room = "REFECTORY";
    expect(researches(s, "p0")).not.toContain("NATAMY_GUN");
    // Nor does a dead player's inventory.
    s.players[2]!.room = "LABORATORY";
    s.players[2]!.alive = false;
    expect(researches(s, "p0")).not.toContain("NATAMY_GUN");
  });

  it("takes any food, drink or drug for a consumable", () => {
    const s = game();
    s.items.push({ id: "sample", type: "mush_sample", at: { kind: "room", id: "LABORATORY" } });
    s.items.push({ id: "wrench2", type: "wrench", at: { kind: "room", id: "LABORATORY" } });
    expect(researches(s, "p0")).not.toContain("CONSTIPASPORE_SERUM");
    s.items.push({ id: "banana", type: "fruit_banana", at: { kind: "room", id: "LABORATORY" } });
    expect(researches(s, "p0")).toContain("CONSTIPASPORE_SERUM");
  });

  it("needs Chun alive in the lab until her Xyloph entry is drawn", () => {
    const s = game();
    expect(researches(s, "p0")).toContain("MYCOSCAN");
    s.players[1]!.room = "REFECTORY";
    expect(researches(s, "p0")).not.toContain("MYCOSCAN");
    expect(applyAction(s, "p0", work("MYCOSCAN"))).toMatchObject({ ok: false });
    s.players[1]!.room = "LABORATORY";
    s.players[1]!.alive = false;
    expect(researches(s, "p0")).not.toContain("MYCOSCAN");
    s.comms.xyloph.push("ZONG_CHUN_SAMPLE");
    expect(researches(s, "p0")).toContain("MYCOSCAN");
  });

  it("waits for the Mush to be chosen when it needs post-selection", () => {
    const s = game();
    s.preselection = true;
    expect(researches(s, "p0")).not.toContain("MUSH_BREEDS");
    expect(researches(s, "p0")).toContain("STEROIDS");
    s.preselection = false;
    expect(researches(s, "p0")).toContain("MUSH_BREEDS");
  });

  it("uses up only the kill_sample item on completion, the floor's first", () => {
    const s = game();
    s.items.push({ id: "sample", type: "mush_sample", at: { kind: "room", id: "LABORATORY" } });
    s.items.push({ id: "held", type: "blaster", at: { kind: "player", id: "p2" } });
    s.items.push({ id: "floor", type: "blaster", at: { kind: "room", id: "LABORATORY" } });
    s.research.NATAMY_GUN = RESEARCH_COMPLETE - DEFAULT_CONFIG.research.effect.progressPercent;
    s.rng = 0;
    const done = mustApply(s, "p0", work("NATAMY_GUN"));
    expect(done.items.map((i) => i.id)).toEqual(expect.arrayContaining(["sample", "held"]));
    expect(done.items.some((i) => i.id === "floor")).toBe(false);
    // Partial progress uses nothing.
    const s2 = game();
    stockLab(s2, "LABORATORY", "MYCO_ALARM");
    s2.rng = 0;
    expect(mustApply(s2, "p0", work("MYCO_ALARM")).items.filter((i) => i.type === "mush_sample")).toHaveLength(s2.items.filter((i) => i.type === "mush_sample").length);
  });

  it("parses from the wire, and rejects a missing research", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("STEROIDS") }))).toEqual({ type: "action", action: work("STEROIDS") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "research", equipment: "x" } }))).toBeNull();
  });
});

describe("computer scientist skill (computer)", () => {
  const cfg = DEFAULT_CONFIG.computer;
  const pick = (s: ReturnType<typeof game>) => pickSkill(s, "p0", "computer");

  it("grants 2 Computer points when picked, capped at 4, and nothing to others", () => {
    const s = pick(game());
    expect(s.players[0]!.resources.comp).toBe(cfg.pointsPerDay);
    expect(s.players[1]!.resources.comp).toBe(0);
    const start = createGame(seats, { ...DEFAULT_CONFIG, startSkills: ["computer"] }, 7);
    expect(start.players[0]!.resources.comp).toBe(cfg.pointsPerDay);
  });

  it("makes a research free: one Computer point, no AP", () => {
    const s = pick(game());
    const ap = s.players[0]!.ap;
    s.rng = 0;
    const r = applyAction(s, "p0", work("STEROIDS"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.resources.comp).toBe(cfg.pointsPerDay - 1);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.research.STEROIDS).toBe(25);
    // The second point makes the next one free; after that it costs AP again.
    r.state.rng = 0;
    const second = applyAction(r.state, "p0", work("STEROIDS"));
    if (!second.ok) throw new Error(second.error);
    expect(second.state.players[0]!.resources.comp).toBe(0);
    expect(second.state.players[0]!.ap).toBe(ap);
    second.state.rng = 0;
    const third = applyAction(second.state, "p0", work("STEROIDS"));
    expect(third.ok && third.state.players[0]!.ap).toBe(ap - AP);
  });

  it("works with no AP left, and is refused with neither", () => {
    const s = pick(game());
    s.players[0]!.ap = 0;
    s.rng = 0;
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(true);
    s.players[0]!.resources.comp = 0;
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(false);
  });

  it("adds 2 at each day boundary, up to the cap", () => {
    let s = pick(game());
    while (s.players[0]!.resources.comp < cfg.capPoints) {
      s = nextDay(s);
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
