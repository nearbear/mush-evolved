import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES, NCC_LENS_ITEM, NCC_LENS_YIELD, STEROIDS_ITEM, STEROIDS_MP, STEROIDS_YIELD, SUPER_SOAP_ITEM } from "../src/items.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_EFFICIENCY, RESEARCH_IDS, RESEARCH_REQUIRES, RESEARCH_SKILLS, RESEARCH_STATUS, researchEfficiency } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, offered, option, pickSkill, setProgress, stockLab, testConfig } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (research: string): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research });
const AP = DEFAULT_CONFIG.research.cost.ap;
const researches = (s: Parameters<typeof offered>[0], id: string) => offered(s, id).flatMap((a) => (a.type === "research" ? [a.research] : []));

function game(room = "LABORATORY") {
  const state = createGame(seats, testConfig(), 7);
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
  it("has its configured chance to become dirty after working on research", () => {
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
    expect(RESEARCH_IDS).toHaveLength(25);
    // p1 is Chun and pre-selection is off; the lab has none of the needed items and no Mush is dead at the start.
    const free = RESEARCH_IDS.filter((id) => !RESEARCH_REQUIRES[id]?.items && !RESEARCH_REQUIRES[id]?.deadMush);
    expect(researches(s, "p0").sort()).toEqual([...free].sort());
    for (const id of RESEARCH_IDS) stockLab(s, "LABORATORY", id);
    expect(researches(s, "p0").sort()).toEqual([...RESEARCH_IDS].sort());
  });

  it("costs 2 AP and adds a pending sample worth the relay formula, for anyone", () => {
    const s = game();
    s.rng = CLEAN;
    const ap = s.players[1]!.ap;
    const range = viewFor(s, "p1").relay.research.STEROIDS!.gain;
    expect(range).toEqual({ min: 12, max: 18 });
    const r = mustApply(s, "p1", work("STEROIDS"));
    // Below the first assay mark, it stays pending: the striped segment, not verified progress.
    const first = viewFor(r, "p1").relay.research.STEROIDS!.pending!;
    expect(first).toBeGreaterThanOrEqual(range.min);
    expect(first).toBeLessThanOrEqual(range.max);
    expect(r.research.STEROIDS ?? 0).toBe(0);
    expect(r.players[1]!.ap).toBe(ap - AP);
    expect(r.relay.research.STEROIDS!.pending).toMatchObject([{ by: "p1", base: 12 }]);
    expect(r.relay.research.STEROIDS!.tokens).toEqual([]);
  });

  it("pins eMush's per-research base efficiencies (1-18) and applies them in relayView and samples", () => {
    expect(RESEARCH_EFFICIENCY).toEqual({
      DRUG_DISPENSER: 6,
      WHOS_WHO: 18,
      STEROIDS: 12,
      MYCOSCAN: 4,
      PATULINE_SCRAMBLER: 6,
      FUNGUS_SCRAMBLER: 3,
      PHEROMODEM: 3,
      CONSTIPASPORE_SERUM: 6,
      MYCO_ALARM: 6,
      SPORE_EXTRACTOR: 4,
      MYCO_DIALECT: 6,
      MUSH_BREEDING_SYSTEM: 18,
      MUSH_BREEDS: 6,
      MUSH_PREDATOR: 6,
      ANTI_MUSH_SERUM: 1,
      HEALING_OINTMANT: 6,
      NCC_LENS: 12,
      NATAMY_GUN: 6,
      TESLA_SUP2X: 12,
      INFINITE_WATER: 6,
      GUARANA_CAPUCCINO: 6,
      MUSHICIDE_SOAP: 3,
      MUSHOPHAGE_BACTERIA: 3,
      ANTISPORE_GAZ: 6,
      SUPER_CALC: 3,
    });
    expect(researchEfficiency("UNKNOWN_RESEARCH")).toBe(6);

    const s = game();
    for (const id of RESEARCH_IDS) stockLab(s, "LABORATORY", id);
    const v = viewFor(s, "p0").relay.research;
    expect(v.ANTI_MUSH_SERUM!.gain).toEqual({ min: 1, max: 1 });
    expect(v.SUPER_CALC!.gain).toEqual({ min: 3, max: 4 });
    expect(v.MYCOSCAN!.gain).toEqual({ min: 4, max: 6 });
    expect(v.DRUG_DISPENSER!.gain).toEqual({ min: 6, max: 9 });
    expect(v.STEROIDS!.gain).toEqual({ min: 12, max: 18 });
    expect(v.WHOS_WHO!.gain).toEqual({ min: 18, max: 27 });

    // Stamped sample base uses the research's efficiency plus skill boost.
    s.players[0]!.skills = ["biologist"];
    const after = mustApply(s, "p0", work("ANTI_MUSH_SERUM"));
    expect(after.relay.research.ANTI_MUSH_SERUM!.pending[0]!.base).toBe(1 + DEFAULT_CONFIG.research.progress.skillBoost);
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
    const gain = (t: typeof s, id: string, research = "DRUG_DISPENSER") => viewFor(t, id).relay.research[research]!.gain;
    const you = s.players[0]!;
    expect(gain(s, "p0")).toEqual({ min: 6, max: 9 });
    you.skills = ["biologist"];
    expect(gain(s, "p0")).toEqual({ min: 10, max: 15 });
    you.skills = ["skilful"];
    expect(gain(s, "p0")).toEqual({ min: 10, max: 15 });
    you.skills = ["biologist", "medic"];
    expect(gain(s, "p0").min).toBe(14);
    you.skills = [];
    // p0 alone: each token in a row loses the penalty.
    for (let i = 0; i < 2; i++) {
      s.rng = CLEAN;
      s.players[0]!.ap = 12;
      s = mustApply(s, "p0", work("DRUG_DISPENSER"));
    }
    expect(gain(s, "p0").min).toBe(6 - 2 * cfg.relayPenalty);
    expect(viewFor(s, "p0").relay.research.DRUG_DISPENSER!.waiting).toBeGreaterThan(0);
    // Pools are per research (and STEROIDS has efficiency 12).
    expect(gain(s, "p0", "STEROIDS")).toEqual({ min: 12, max: 18 });
    // p1's token, made later, still breaks up p0's run.
    s.rng = CLEAN;
    s.players[1]!.statuses = [];
    s = mustApply(s, "p1", work("DRUG_DISPENSER"));
    expect(viewFor(s, "p0").relay.research.DRUG_DISPENSER!.waiting).toBe(0);
    expect(viewFor(s, "p0").yourTokens.research).toEqual({ DRUG_DISPENSER: 2 });
    expect(viewFor(s, "p1").yourTokens.research).toEqual({ DRUG_DISPENSER: 1 });
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
    expect(RESEARCH_REQUIRES.PHEROMODEM).toEqual({ items: ["mush_floppy_disk"], postSelection: true });
    expect(RESEARCH_REQUIRES.PATULINE_SCRAMBLER).toEqual({ deadMush: true });
    expect(RESEARCH_REQUIRES.FUNGUS_SCRAMBLER).toEqual({ deadMush: true });
    expect(RESEARCH_REQUIRES.MUSH_BREEDS).toEqual({ deadMush: true });
    expect(RESEARCH_REQUIRES.MUSH_BREEDING_SYSTEM).toEqual({ items: ["mush_floppy_disk"], deadMush: true });
    expect(RESEARCH_REQUIRES.MUSHOPHAGE_BACTERIA).toEqual({ chun: true, deadMush: true });
    expect(RESEARCH_REQUIRES.NATAMY_GUN).toEqual({ items: ["mush_sample", "blaster"], consumes: ["blaster"] });
    expect(RESEARCH_REQUIRES.MUSHICIDE_SOAP).toEqual({ items: ["soap"], consumes: ["soap"], chun: true });
    expect(RESEARCH_REQUIRES.CONSTIPASPORE_SERUM).toEqual({ items: [ANY_CONSUMABLE, "mush_sample"] });
    // Every needed item exists in ITEM_TYPES.
    for (const type of Object.values(RESEARCH_REQUIRES).flatMap((r) => r.items ?? []).filter((t) => t !== ANY_CONSUMABLE)) {
      expect(ITEM_TYPES[type], type).toBeDefined();
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
    s.items.push({ id: "disk", type: "mush_floppy_disk", at: { kind: "room", id: "LABORATORY" } });
    s.preselection = true;
    expect(researches(s, "p0")).not.toContain("PHEROMODEM");
    expect(researches(s, "p0")).toContain("STEROIDS");
    s.preselection = false;
    expect(researches(s, "p0")).toContain("PHEROMODEM");
  });

  it("requires a dead Mush (hasMushDied) for the five dead-Mush researches", () => {
    const deadMushResearches = [
      "MUSHOPHAGE_BACTERIA",
      "FUNGUS_SCRAMBLER",
      "PATULINE_SCRAMBLER",
      "MUSH_BREEDS",
      "MUSH_BREEDING_SYSTEM",
    ] as const;
    const s = createGame(seats, testConfig(), 7, { p0: "mush", p1: "human", p2: "human" });
    for (const p of s.players) p.room = "LABORATORY";
    s.items.push({ id: "disk", type: "mush_floppy_disk", at: { kind: "room", id: "LABORATORY" } });
    const mush = s.players.find((p) => p.role === "mush")!;
    const human = s.players.find((p) => p.role === "human" && p.character !== "chun")!;
    const actor = s.players.find((p) => p.id !== mush.id && p.id !== human.id)!;

    // None offered while all Mush are alive, and direct attempts are refused.
    for (const id of deadMushResearches) {
      expect(researches(s, actor.id)).not.toContain(id);
      expect(applyAction(s, actor.id, work(id))).toMatchObject({ ok: false });
    }
    expect(viewFor(s, actor.id).researchNeeds?.MUSHOPHAGE_BACTERIA).toEqual([true, false]);
    expect(viewFor(s, actor.id).researchNeeds?.MUSH_BREEDING_SYSTEM).toEqual([true, false]);
    expect(viewFor(s, actor.id).researchNeeds?.PATULINE_SCRAMBLER).toEqual([false]);

    // A dead human does not satisfy the requirement.
    human.alive = false;
    for (const id of deadMushResearches) expect(researches(s, actor.id)).not.toContain(id);
    human.alive = true;

    // Unrestricted terminals (freeHacking) bypasses deadMush.
    actor.cheats.push("freeHacking");
    for (const id of deadMushResearches) expect(researches(s, actor.id)).toContain(id);
    actor.cheats = [];

    // Once a Mush dies (even with no corpse aboard, matching hasMushDied), all five unlock.
    mush.alive = false;
    for (const id of deadMushResearches) expect(researches(s, actor.id)).toContain(id);
    expect(viewFor(s, actor.id).researchNeeds?.MUSHOPHAGE_BACTERIA).toEqual([true, true]);
    expect(viewFor(s, actor.id).researchNeeds?.MUSH_BREEDING_SYSTEM).toEqual([true, true]);
    expect(viewFor(s, actor.id).researchNeeds?.PATULINE_SCRAMBLER).toEqual([true]);
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

  it("completing STEROIDS spawns 4 anabolic steroids on the laboratory floor and marks status full", () => {
    expect(RESEARCH_STATUS.STEROIDS).toBe("full");
    expect(RESEARCH_STATUS.CONSTIPASPORE_SERUM).toBe("full");
    const s = game();
    setProgress(s, { research: "STEROIDS" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("STEROIDS"));
    const floorSteroids = done.items.filter((i) => i.type === STEROIDS_ITEM && i.at.kind === "room" && i.at.id === "LABORATORY");
    expect(floorSteroids).toHaveLength(STEROIDS_YIELD);
  });

  it("completing NCC_LENS spawns 2 pairs of NCC lenses on the lab floor, marks status full, and boosts shooting accuracy", () => {
    expect([DEFAULT_CONFIG.nccLens.spaceAccuracyFactor, DEFAULT_CONFIG.nccLens.crewAccuracyFactor, NCC_LENS_YIELD]).toEqual([1.1, 1.33, 2]);
    expect(RESEARCH_STATUS.NCC_LENS).toBe("full");
    expect(ITEM_TYPES[NCC_LENS_ITEM]).toEqual({});

    const s = game();
    stockLab(s, "LABORATORY", "NCC_LENS");
    setProgress(s, { research: "NCC_LENS" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("NCC_LENS"));
    expect(done.items.filter((i) => i.type === NCC_LENS_ITEM && i.at.kind === "room" && i.at.id === "LABORATORY")).toHaveLength(NCC_LENS_YIELD);
    expect(done.items.some((i) => i.type === "body_cat")).toBe(true);

    // Turret and patrol ship shots: x1.1 when carried; gun attack: x1.33 when carried; melee and floor lenses: no change; carrying two applies once.
    const shotState = createGame(seats, testConfig(), 7);
    shotState.preselection = false;
    shotState.hunters.list = [{ id: "h1", hp: 3, hitChance: 0.5, target: null }];
    shotState.players[0]!.room = "LASER_TURRET_A_0";
    shotState.players[1]!.room = "PATROL_SHIP_A_0";
    shotState.patrolShips.PATROL_SHIP_A_0 = { armor: 10, charges: 10, out: true, destroyed: false, onPlanet: null };
    shotState.players[2]!.room = "LASER_TURRET_A_0";
    shotState.items.push(
      { id: "blaster-1", type: "blaster", charges: 5, at: { kind: "player", id: "p0" } },
      { id: "knife-1", type: "knife", at: { kind: "player", id: "p0" } },
      { id: "lens-floor", type: NCC_LENS_ITEM, at: { kind: "room", id: "LASER_TURRET_A_0" } },
    );

    const turretShot = { type: "turret_attack" } as const;
    const patrolShot = { type: "patrol_attack" } as const;
    const gunAttack = { type: "attack", weapon: "blaster-1" } as const;
    const knifeAttack = { type: "attack", weapon: "knife-1" } as const;

    const baseTurret = option(shotState, "p0", turretShot)!.chance!;
    const basePatrol = option(shotState, "p1", patrolShot)!.chance!;
    const baseGun = option(shotState, "p0", gunAttack)!.chance!;
    const baseKnife = option(shotState, "p0", knifeAttack)!.chance!;

    // Lying in the room does nothing.
    shotState.items.push(
      { id: "lens-1", type: NCC_LENS_ITEM, at: { kind: "player", id: "p0" } },
      { id: "lens-2", type: NCC_LENS_ITEM, at: { kind: "player", id: "p0" } },
      { id: "lens-3", type: NCC_LENS_ITEM, at: { kind: "player", id: "p1" } },
    );
    expect(option(shotState, "p0", turretShot)!.chance).toBeCloseTo(baseTurret * shotState.config.nccLens.spaceAccuracyFactor);
    expect(option(shotState, "p1", patrolShot)!.chance).toBeCloseTo(basePatrol * shotState.config.nccLens.spaceAccuracyFactor);
    expect(option(shotState, "p0", gunAttack)!.chance).toBeCloseTo(baseGun * shotState.config.nccLens.crewAccuracyFactor);
    expect(option(shotState, "p0", knifeAttack)!.chance).toBe(baseKnife);
  });

  it("completing SPORE_EXTRACTOR leaves one Spore Sucker on the laboratory floor (owner, 2026-11-20)", () => {
    expect(RESEARCH_STATUS.SPORE_EXTRACTOR).toBe("full");
    const s = game();
    stockLab(s, "LABORATORY", "SPORE_EXTRACTOR");
    setProgress(s, { research: "SPORE_EXTRACTOR" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("SPORE_EXTRACTOR"));
    expect(done.items.filter((i) => i.type === "spore_extractor" && i.at.kind === "room" && i.at.id === "LABORATORY")).toHaveLength(1);
  });

  it("completing DRUG_DISPENSER adds the DRUG_DISP equipment to the medlab, once (owner, 2026-11-10)", () => {
    expect(RESEARCH_STATUS.DRUG_DISPENSER).toBe("full");
    const s = game();
    expect((s.equipment.SICK_BAY ?? []).some((e) => e.type === "DRUG_DISP")).toBe(false);
    setProgress(s, { research: "DRUG_DISPENSER" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("DRUG_DISPENSER"));
    expect(done.equipment.SICK_BAY!.filter((e) => e.type === "DRUG_DISP")).toEqual([{ id: "SICK_BAY:DRUG_DISP", type: "DRUG_DISP" }]);
  });

  it("consuming steroids gives humans 8 MP, 0 satiety, resets starvation timer, and does nothing for Mush", () => {
    const s = game();
    s.items.push({ id: "steroid-1", type: STEROIDS_ITEM, at: { kind: "player", id: "p0" } });
    s.players[0]!.mp = 2;
    s.players[0]!.satiety = 0;
    s.players[0]!.satietyZeroSince = 0;
    s.cycle = 5;

    const consumedState = mustApply(s, "p0", { type: "consume", item: "steroid-1" });
    expect(consumedState.players[0]!.mp).toBe(2 + STEROIDS_MP);
    expect(consumedState.players[0]!.satiety).toBe(0);
    expect(consumedState.players[0]!.satietyZeroSince).toBe(5);
    expect(consumedState.items.some((i) => i.id === "steroid-1")).toBe(false);

    // Full belly blocks consuming
    consumedState.items.push({ id: "steroid-2", type: STEROIDS_ITEM, at: { kind: "player", id: "p0" } });
    consumedState.players[0]!.satiety = consumedState.config.hunger.fullBellyAt;
    expect(applyAction(consumedState, "p0", { type: "consume", item: "steroid-2" }).ok).toBe(false);

    // Mush gets no MP and no satiety benefits
    const mushGame = game();
    mushGame.players[1]!.role = "mush";
    mushGame.players[1]!.mp = 1;
    mushGame.items.push({ id: "steroid-3", type: STEROIDS_ITEM, at: { kind: "player", id: "p1" } });
    const mushConsumed = mustApply(mushGame, "p1", { type: "consume", item: "steroid-3" });
    expect(mushConsumed.players[1]!.mp).toBe(1);
    expect(mushConsumed.items.some((i) => i.id === "steroid-3")).toBe(false);
  });

  it("parses from the wire, and rejects a missing research", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("STEROIDS") }))).toEqual({ type: "action", action: work("STEROIDS") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "research", equipment: "x" } }))).toBeNull();
  });

  it("completing WHOS_WHO switches ACTOPI on and unlocks its BIOS toggle (owner, 2026-11-24)", () => {
    expect(RESEARCH_STATUS.WHOS_WHO).toBe("full");
    expect(RESEARCH_REQUIRES.WHOS_WHO).toBeUndefined();
    const s = game();
    s.players[2]!.room = "REFECTORY";
    expect(s.bios.actopi).toBe(false);
    expect(viewFor(s, "p0").unidentified).toEqual(["REFECTORY"]);
    expect(viewFor(s, "p0").players.find((p) => p.id === "p2")).not.toHaveProperty("room");

    setProgress(s, { research: "WHOS_WHO" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("WHOS_WHO"));
    expect(done.research.WHOS_WHO).toBe(RESEARCH_COMPLETE);
    expect(done.bios.actopi).toBe(true);
    expect(done.log.at(-1)).toMatchObject({ key: "researchCompleted", params: { research: "WHOS_WHO" }, room: "LABORATORY", visibleTo: "all" });
    expect(viewFor(done, "p0").unidentified).toEqual([]);
    expect(viewFor(done, "p0").players.find((p) => p.id === "p2")?.room).toBe("REFECTORY");

    // NERON Admin can now switch ACTOPI off in the BIOS.
    done.titles.neron_admin = "p0";
    done.players[0]!.room = "NEXUS_ROOM";
    const off = mustApply(done, "p0", { type: "set_bios", equipment: "NEXUS_ROOM:NERON_BIOS_TERM", option: "actopi", value: false });
    expect(off.bios.actopi).toBe(false);
  });
});

describe("computer scientist skill (computer)", () => {
  const cfg = DEFAULT_CONFIG.computer;
  const pick = (s: ReturnType<typeof game>) => pickSkill(s, "p0", "computer");

  it("grants 2 Computer points when picked, capped at 4, and nothing to others", () => {
    const s = pick(game());
    expect(s.players[0]!.resources.comp).toBe(cfg.pointsPerDay);
    expect(s.players[1]!.resources.comp).toBe(0);
    const start = createGame(seats, testConfig({ startSkills: ["computer"] }), 7);
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

describe("BIOS research crew lock", () => {
  it("blocks non-Biologist/Medic/Polyvalent from accessing the research lab, hides in-progress lab data, and gates research, spoil_research, and contaminate", () => {
    const s = game();
    s.research.STEROIDS = 20;
    s.research.WHOS_WHO = RESEARCH_COMPLETE;
    s.bios.crew_lock = "research";
    s.players[0]!.role = "human";
    s.players[0]!.skills = [];
    s.players[1]!.role = "mush";
    s.players[1]!.skills = [];
    const openLab: Action = { type: "access", equipment: "LABORATORY:RESEARCH_LAB" };

    // Unqualified human and Mush are blocked from accessing the lab, research, and spoil_research,
    // and their view hides in-progress research, relay pools, and lab needs (completed research stays visible).
    expect(offered(s, "p0").some((a) => a.type === "access" && a.equipment === "LABORATORY:RESEARCH_LAB")).toBe(false);
    expect(ACTIONS.access.check(s, s.players[0]!, openLab)).toBe("crew_lock");
    expect(applyAction(s, "p0", openLab).ok).toBe(false);
    const lockedView = viewFor(s, "p0");
    expect(lockedView.research.STEROIDS).toBeUndefined();
    expect(lockedView.research.WHOS_WHO).toBe(RESEARCH_COMPLETE);
    expect(lockedView.relay.research).toEqual({});
    expect(lockedView.researchNeeds).toBeNull();

    expect(offered(s, "p0").some((a) => a.type === "research")).toBe(false);
    expect(ACTIONS.research.check(s, s.players[0]!, work("STEROIDS"))).toBe("crew_lock");
    expect(applyAction(s, "p0", work("STEROIDS")).ok).toBe(false);
    const spoil: Action = { type: "spoil_research", equipment: "LABORATORY:RESEARCH_LAB", research: "STEROIDS" };
    expect(offered(s, "p1").some((a) => a.type === "research" || a.type === "spoil_research")).toBe(false);
    expect(ACTIONS.spoil_research.check(s, s.players[1]!, spoil)).toBe("crew_lock");
    expect(applyAction(s, "p1", spoil).ok).toBe(false);

    // Biologist, Medic, and Polyvalent (skilful) are allowed to access, inspect, research, and spoil_research.
    for (const skill of ["biologist", "medic", "skilful"] as const) {
      const qualified = game();
      qualified.research.STEROIDS = 20;
      qualified.bios.crew_lock = "research";
      qualified.rng = CLEAN;
      qualified.players[0]!.skills = [skill];
      qualified.players[1]!.role = "mush";
      qualified.players[1]!.skills = [skill];
      expect(offered(qualified, "p0").some((a) => a.type === "access" && a.equipment === "LABORATORY:RESEARCH_LAB")).toBe(true);
      expect(applyAction(qualified, "p0", openLab).ok).toBe(true);
      expect(viewFor(qualified, "p0").research.STEROIDS).toBe(20);
      expect(viewFor(qualified, "p0").researchNeeds).not.toBeNull();
      expect(offered(qualified, "p0").some((a) => a.type === "research" && a.research === "STEROIDS")).toBe(true);
      expect(applyAction(qualified, "p0", work("STEROIDS")).ok).toBe(true);
      expect(offered(qualified, "p1").some((a) => a.type === "spoil_research" && a.research === "STEROIDS")).toBe(true);
      expect(applyAction(qualified, "p1", spoil).ok).toBe(true);
    }

    // freeHacking bypasses the lock.
    const hacked = game();
    hacked.bios.crew_lock = "research";
    hacked.rng = CLEAN;
    hacked.players[0]!.cheats.push("freeHacking");
    expect(offered(hacked, "p0").some((a) => a.type === "access" && a.equipment === "LABORATORY:RESEARCH_LAB")).toBe(true);
    expect(applyAction(hacked, "p0", openLab).ok).toBe(true);
    expect(offered(hacked, "p0").some((a) => a.type === "research" && a.research === "STEROIDS")).toBe(true);
    expect(applyAction(hacked, "p0", work("STEROIDS")).ok).toBe(true);

    // contaminate is a lab terminal action, so a Saboteur without Biologist/Medic/Polyvalent is locked out too,
    // while a Saboteur who also has a qualifying skill can contaminate.
    const contam = game();
    contam.bios.crew_lock = "research";
    contam.rng = CLEAN;
    contam.players[0]!.skills = ["biologist"];
    const afterWork = mustApply(contam, "p0", work("STEROIDS"));
    afterWork.players[1]!.role = "mush";
    afterWork.players[1]!.skills = ["sapper"];
    const contamAct: Action = { type: "contaminate", equipment: "LABORATORY:RESEARCH_LAB", research: "STEROIDS" };
    expect(offered(afterWork, "p1").some((a) => a.type === "contaminate")).toBe(false);
    expect(ACTIONS.contaminate.check(afterWork, afterWork.players[1]!, contamAct)).toBe("crew_lock");
    expect(applyAction(afterWork, "p1", contamAct).ok).toBe(false);
    afterWork.players[1]!.skills = ["sapper", "biologist"];
    expect(offered(afterWork, "p1").some((a) => a.type === "contaminate" && a.research === "STEROIDS")).toBe(true);
    expect(applyAction(afterWork, "p1", contamAct).ok).toBe(true);

    // Non-research locks allow everyone.
    for (const lock of ["piloting", "projects"] as const) {
      const unlocked = game();
      unlocked.bios.crew_lock = lock;
      unlocked.rng = CLEAN;
      unlocked.players[1]!.role = "mush";
      expect(offered(unlocked, "p0").some((a) => a.type === "access" && a.equipment === "LABORATORY:RESEARCH_LAB")).toBe(true);
      expect(offered(unlocked, "p0").some((a) => a.type === "research" && a.research === "STEROIDS")).toBe(true);
      expect(applyAction(unlocked, "p0", work("STEROIDS")).ok).toBe(true);
      expect(offered(unlocked, "p1").some((a) => a.type === "spoil_research" && a.research === "STEROIDS")).toBe(true);
      expect(applyAction(unlocked, "p1", spoil).ok).toBe(true);
    }
  });

  it("completing MUSHICIDE_SOAP consumes one soap, spawns Super Soap in the lab, converts other soaps, and marks status full", () => {
    expect(RESEARCH_STATUS.MUSHICIDE_SOAP).toBe("full");
    expect(ITEM_TYPES[SUPER_SOAP_ITEM]).toEqual({ canBreak: true, isDestroyedWhenBroken: true });
    const s = game();
    s.items = s.items.filter((i) => i.type !== "soap");
    stockLab(s, "LABORATORY", "MUSHICIDE_SOAP");
    s.items.push(
      { id: "soap-other-room", type: "soap", at: { kind: "room", id: "ALPHA_DORM" } },
      { id: "soap-carried", type: "soap", at: { kind: "player", id: "p1" } },
    );
    setProgress(s, { research: "MUSHICIDE_SOAP" }, RESEARCH_COMPLETE - 1);
    s.rng = CLEAN;
    const done = mustApply(s, "p0", work("MUSHICIDE_SOAP"));
    expect(done.items.some((i) => i.type === "soap")).toBe(false);
    expect(done.items.filter((i) => i.type === SUPER_SOAP_ITEM && i.at.kind === "room" && i.at.id === "LABORATORY")).toHaveLength(1);
    expect(done.items.find((i) => i.id === "soap-other-room")?.type).toBe(SUPER_SOAP_ITEM);
    expect(done.items.find((i) => i.id === "soap-carried")?.type).toBe(SUPER_SOAP_ITEM);
  });
});
