import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES, RESEARCH_SKILLS } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, offered, pickSkill, setProgress, stockLab } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (research: string): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research });
const AP = DEFAULT_CONFIG.research.cost.ap;
const researches = (s: Parameters<typeof offered>[0], id: string) => offered(s, id).flatMap((a) => (a.type === "research" ? [a.research] : []));

function game(room = "LABORATORY") {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

/** A seed for which p0 working STEROIDS does (or does not) get dirty: the token's roll draws before the dirt roll. */
function seedFor(dirty: boolean): number {
  for (let seed = 0; ; seed++) {
    const s = game();
    s.rng = seed;
    const r = applyAction(s, "p0", work("STEROIDS"));
    if (r.ok && r.state.players[0]!.statuses.includes("dirty") === dirty) return seed;
  }
}
const CLEAN = seedFor(false);
const DIRTY = seedFor(true);

describe("research", () => {
  it("has a 15% chance to become dirty after working on research", () => {
    expect(DEFAULT_CONFIG.research.dirtyChance).toBe(0.15);

    const dirty = game();
    dirty.rng = DIRTY;
    dirty.players[1]!.room = "REFECTORY";
    dirty.players[2]!.room = "REFECTORY";
    const result = applyAction(dirty, "p0", work("STEROIDS"));
    if (!result.ok) throw new Error("expected research to succeed");
    expect(result.state.players[0]!.statuses).toContain("dirty");
    expect(viewFor(result.state, "p0").log.some((entry) => entry.key === "becomeDirty")).toBe(true);
    expect(viewFor(result.state, "p1").log.some((entry) => entry.key === "becomeDirty")).toBe(false);

    const clean = game();
    clean.rng = CLEAN;
    const cleanResult = applyAction(clean, "p0", work("STEROIDS"));
    if (!cleanResult.ok) throw new Error("expected research to succeed");
    expect(cleanResult.state.players[0]!.statuses).not.toContain("dirty");

    const free = game();
    free.players[0]!.resources.comp = 1;
    free.rng = DIRTY;
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

  it("costs 2 AP and adds a pending sample worth the relay formula, for anyone", () => {
    const s = game();
    s.rng = CLEAN;
    const ap = s.players[1]!.ap;
    const range = viewFor(s, "p1").relay.research.STEROIDS!.gain;
    expect(range).toEqual({ min: 6, max: 9 });
    const r = mustApply(s, "p1", work("STEROIDS"));
    // Below the first assay mark, it stays pending: the striped segment, not verified progress.
    const first = viewFor(r, "p1").relay.research.STEROIDS!.pending!;
    expect(first).toBeGreaterThanOrEqual(range.min);
    expect(first).toBeLessThanOrEqual(range.max);
    expect(r.research.STEROIDS ?? 0).toBe(0);
    expect(r.players[1]!.ap).toBe(ap - AP);
    expect(r.relay.research.STEROIDS!.pending).toMatchObject([{ by: "p1", base: 6 }]);
    expect(r.relay.research.STEROIDS!.tokens).toEqual([]);
  });

  it("completes at 100% and then is no longer offered or accepted", () => {
    let s = game();
    setProgress(s, { research: "STEROIDS" }, RESEARCH_COMPLETE - 1);
    s.players[0]!.ap = 12;
    s.rng = CLEAN;
    const r = applyAction(s, "p0", work("STEROIDS"));
    expect(r.ok).toBe(true);
    if (r.ok) s = r.state;
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

  it("is shown disabled to a dirty player, lacking \"clean\", so the terminal can say to shower", () => {
    const s = game();
    addStatus(s.players[0]!, "dirty");
    const option = viewFor(s, "p0").actions.find(({ action }) => action.type === "research" && action.research === "STEROIDS");
    expect(option?.lacks).toEqual(["clean"]);
    expect(viewFor(s, "p1").actions.find(({ action }) => action.type === "research")?.lacks).toEqual([]);
  });

  it("follows the relay formula: skills add, and only a player with more tokens than everyone else plus one is penalized", () => {
    const cfg = DEFAULT_CONFIG.research.progress;
    let s = game();
    const gain = (t: typeof s, id: string, research = "STEROIDS") => viewFor(t, id).relay.research[research]!.gain;
    const you = s.players[0]!;
    expect(gain(s, "p0")).toEqual({ min: 6, max: 9 });
    you.skills = ["biologist"];
    expect(gain(s, "p0")).toEqual({ min: 10, max: 15 });
    you.skills = ["biologist", "medic"];
    expect(gain(s, "p0").min).toBe(14);
    you.skills = [];
    // p0 alone: each token in a row loses the penalty.
    for (let i = 0; i < 2; i++) {
      s.rng = CLEAN;
      s.players[0]!.ap = 12;
      s = mustApply(s, "p0", work("STEROIDS"));
    }
    expect(gain(s, "p0").min).toBe(6 - 2 * cfg.relayPenalty);
    expect(viewFor(s, "p0").relay.research.STEROIDS!.waiting).toBeGreaterThan(0);
    // Pools are per research.
    expect(gain(s, "p0", "DRUG_DISPENSER")).toEqual({ min: 6, max: 9 });
    // p1's token, made later, still breaks up p0's run.
    s.rng = CLEAN;
    s.players[1]!.statuses = [];
    s = mustApply(s, "p1", work("STEROIDS"));
    expect(viewFor(s, "p0").relay.research.STEROIDS!.waiting).toBe(0);
    expect(viewFor(s, "p0").yourTokens.research).toEqual({ STEROIDS: 2 });
    expect(viewFor(s, "p1").yourTokens.research).toEqual({ STEROIDS: 1 });
  });

  it("is seen only in the lab until complete, with a private line; completion goes in the room's history (owner, 2026-10-30/31)", () => {
    let s = game();
    s.players[2]!.room = "REFECTORY";
    s = mustApply(s, "p0", work("STEROIDS"));
    for (const id of ["p0", "p1"]) {
      expect(viewFor(s, id).research).toEqual(s.research);
      const pending = viewFor(s, id).relay.research.STEROIDS!.pending!;
      expect(viewFor(s, id).relay.research.STEROIDS!.tokens).toEqual([{ by: "p0", value: pending, pending: true }]);
    }
    const away = viewFor(s, "p2");
    expect(away.research).toEqual({});
    expect(away.relay.research).toEqual({});
    expect(viewFor(s, "p0").log.some((e) => e.key === "researched")).toBe(true);
    expect(viewFor(s, "p1").log.some((e) => e.key === "researched")).toBe(false);
    // The dead see nothing either, even in the lab.
    s.players[1]!.alive = false;
    expect(viewFor(s, "p1").research).toEqual({});
    expect(viewFor(s, "p1").relay.research).toEqual({});
    // Completion reaches everyone.
    setProgress(s, { research: "STEROIDS" }, RESEARCH_COMPLETE - 1);
    s.players[0]!.ap = 12;
    s.players[0]!.statuses = [];
    s = mustApply(s, "p0", work("STEROIDS"));
    expect(away.research.STEROIDS).toBeUndefined();
    expect(viewFor(s, "p2").research).toEqual({ STEROIDS: RESEARCH_COMPLETE });
    expect(viewFor(s, "p2").relay.research).toEqual({});
    for (const id of ["p0", "p1", "p2"]) expect(JSON.stringify(viewFor(s, id).relay)).not.toContain("roll");
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

  it("tells people at the terminal which of each research's needs the lab meets, in order, and nobody else", () => {
    const s = game();
    s.preselection = true;
    s.players[1]!.room = "REFECTORY";
    // ANTI_MUSH_SERUM: mush_sample, mush_floppy_disk, Chun, post-selection.
    expect(viewFor(s, "p0").researchNeeds?.ANTI_MUSH_SERUM).toEqual([false, false, false, false]);
    s.items.push({ id: "sample", type: "mush_sample", at: { kind: "player", id: "p2" } });
    s.comms.xyloph.push("ZONG_CHUN_SAMPLE");
    s.preselection = false;
    const needs = viewFor(s, "p0").researchNeeds!;
    expect(needs.ANTI_MUSH_SERUM).toEqual([true, false, true, true]);
    expect(needs).not.toHaveProperty("STEROIDS");
    expect(viewFor(s, "p1").researchNeeds).toBeNull();
    s.players[0]!.alive = false;
    expect(viewFor(s, "p0").researchNeeds).toBeNull();
  });

  it("uses up only the kill_sample item on completion, the floor's first", () => {
    const s = game();
    s.items.push({ id: "sample", type: "mush_sample", at: { kind: "room", id: "LABORATORY" } });
    s.items.push({ id: "held", type: "blaster", at: { kind: "player", id: "p2" } });
    s.items.push({ id: "floor", type: "blaster", at: { kind: "room", id: "LABORATORY" } });
    setProgress(s, { research: "NATAMY_GUN" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("NATAMY_GUN"));
    expect(done.items.map((i) => i.id)).toEqual(expect.arrayContaining(["sample", "held"]));
    expect(done.items.some((i) => i.id === "floor")).toBe(false);
    // Partial progress uses nothing.
    const s2 = game();
    stockLab(s2, "LABORATORY", "MYCO_ALARM");
    s2.rng = CLEAN;
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
    s.rng = CLEAN;
    const r = applyAction(s, "p0", work("STEROIDS"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.resources.comp).toBe(cfg.pointsPerDay - 1);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.relay.research.STEROIDS!.pending).toHaveLength(1);
    // The second point makes the next one free; after that it costs AP again.
    r.state.rng = CLEAN;
    const second = applyAction(r.state, "p0", work("STEROIDS"));
    if (!second.ok) throw new Error(second.error);
    expect(second.state.players[0]!.resources.comp).toBe(0);
    expect(second.state.players[0]!.ap).toBe(ap);
    second.state.rng = CLEAN;
    const third = applyAction(second.state, "p0", work("STEROIDS"));
    expect(third.ok && third.state.players[0]!.ap).toBe(ap - AP);
  });

  it("works with no AP left, and is refused with neither", () => {
    const s = pick(game());
    s.players[0]!.ap = 0;
    s.rng = CLEAN;
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
