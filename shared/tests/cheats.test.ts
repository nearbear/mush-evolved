import { describe, expect, it } from "vitest";
import { CHEATS, type Cheat } from "../src/cheats.ts";
import { CHARACTER_SKILLS, isSkill, SKILLS, SKILL_SLOTS } from "../src/skills.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "../src/projects.ts";
import { offeredProjects } from "../src/projectEffects.ts";
import { RESEARCH_IDS } from "../src/research.ts";
import { PRESELECTION } from "../src/preselection.ts";
import { TITLE_IDS, bypassesTitles, hasTitleAccess } from "../src/titles.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { dailyMoraleLoss } from "../src/modifiers.ts";
import { applyInput, replayGame, type Input } from "../src/replay.ts";
import { damage } from "../src/death.ts";
import { gainMorale } from "../src/adjustStats.ts";
import { burnOxygen, damageShip } from "../src/ship.ts";
import { applyAction, createGame, setCheat, setRoleCheat, viewFor } from "../src/rules.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { makeSeats, nextCycle, player, offered } from "./support.ts";

const seats = makeSeats(3);
const fresh = () => createGame(seats, DEFAULT_CONFIG, 7);
const cfg = DEFAULT_CONFIG;

function cheat(state: GameState, id: PlayerId, c: Cheat, on = true): GameState {
  const r = setCheat(state, id, c, on);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const walk = (s: GameState, id: PlayerId, to: string) => {
  const r = applyAction(s, id, { type: "move", to });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("cheats", () => {
  it("are off by default", () => {
    expect(fresh().players.every((p) => p.cheats.length === 0)).toBe(true);
  });

  it("infinite AP and MP: a move costs nothing and the bars stay full", () => {
    let s = cheat(cheat(fresh(), "p0", "infiniteAp"), "p0", "infiniteMp");
    expect(player(s, "p0")).toMatchObject({ ap: cfg.maxAp, mp: cfg.movement.mpCap });
    const door = offered(s, "p0").find((a) => a.type === "move")!;
    s = walk(s, "p0", door.type === "move" ? door.to : "");
    expect(player(s, "p0")).toMatchObject({ ap: cfg.maxAp, mp: cfg.movement.mpCap });
  });

  it("without the cheat, the same move spends points", () => {
    const door = offered(fresh(), "p0").find((a) => a.type === "move")!;
    const s = walk(fresh(), "p0", door.type === "move" ? door.to : "");
    expect(player(s, "p0").mp).toBeLessThan(cfg.startMp);
  });

  it("infinite morale and HP hold through a day change", () => {
    let s = cheat(cheat(fresh(), "p0", "infiniteMorale"), "p0", "infiniteHp");
    expect(player(s, "p0")).toMatchObject({ morale: cfg.maxMorale, hp: cfg.maxHp });
    s.cycle = cfg.cyclesPerDay; // the next cycle starts a day, which costs morale
    s = nextCycle(s);
    expect(s.cycle).toBe(cfg.cyclesPerDay + 1);
    expect(player(s, "p0").morale).toBe(cfg.maxMorale);
    expect(player(s, "p1").morale).toBe(cfg.startMorale - dailyMoraleLoss(s));
  });

  it("are per player and can be switched off", () => {
    let s = cheat(fresh(), "p0", "infiniteAp");
    expect(player(s, "p1").cheats).toEqual([]);
    s = cheat(s, "p0", "infiniteAp", false);
    expect(player(s, "p0").cheats).toEqual([]);
  });

  it("only ever appear in your own view", () => {
    const s = cheat(fresh(), "p0", "infiniteHp");
    expect(viewFor(s, "p0").you.cheats).toEqual(["infiniteHp"]);
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("infiniteHp");
  });

  it("replay to the same state", () => {
    const setup = { seats, config: cfg, seed: 7, rulesVersion: "test" };
    const inputs: Input[] = [{ type: "cheat", cheat: "infiniteAp", on: true, by: "p0" }];
    expect(applyInput(fresh(), inputs[0]!).ok).toBe(true);
    expect(player(replayGame(setup, inputs), "p0").cheats).toEqual(["infiniteAp"]);
  });

  it("are parsed from the wire, and junk is rejected", () => {
    for (const c of CHEATS) {
      expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: c, on: true }))).toEqual({ type: "cheat", cheat: c, on: true });
    }
    expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: "godMode", on: true }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: "infiniteAp", on: "yes" }))).toBeNull();
  });
});

describe("spores and role cheats", () => {
  const mushId = () => fresh().players.find((p) => p.role === "mush")!.id;
  const humanId = () => fresh().players.find((p) => p.role === "human")!.id;

  it("infinite spores keeps a Mush stocked after spending, and does nothing for a human", () => {
    const m = mushId();
    const s = cheat(cheat(fresh(), m, "infiniteSpores"), humanId(), "infiniteSpores");
    expect(player(s, m).spores).toBeGreaterThan(50);
    expect(player(s, humanId()).spores).toBe(0);
  });

  it("role cheats switch at once, both ways, and are parsed from the wire", () => {
    const h = humanId();
    let r = setRoleCheat(fresh(), h, "mush");
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, h).role).toBe("mush");
    r = setRoleCheat(r.state, h, "human");
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, h)).toMatchObject({ role: "human", spores: 0 });
    expect(parseGameMessage(JSON.stringify({ type: "roleCheat", role: "mush" }))).toEqual({ type: "roleCheat", role: "mush" });
    expect(parseGameMessage(JSON.stringify({ type: "roleCheat", role: "god" }))).toBeNull();
  });
});

describe("relay and title cheats", () => {
  it("no relay penalty: repeat PILGRED repairs by the same player gain the full amount", () => {
    let s = fresh();
    for (const p of s.players) p.room = "MOTOR_ROOM";
    s = cheat(s, "p0", "noRelayPenalty");
    const gain = (t: typeof s) => viewFor(t, "p0").relay.pilgred!.gain;
    const first = gain(s);
    for (let i = 0; i < 3; i++) {
      player(s, "p0").ap = cfg.maxAp;
      const r = applyAction(s, "p0", { type: "repair_pilgred", equipment: "MOTOR_ROOM:PILGRED" });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    // Each token made under the cheat counts as if from a player of its own, fixed when it is made (owner, 2026-10-31).
    expect(s.pilgred.pool.tokens.every((t) => t.unpenalized)).toBe(true);
    expect(viewFor(s, "p0").relay.pilgred!.waiting).toBe(0);
    expect(gain(s)).toEqual(first);
    // Switched off, new tokens count as p0's again, and the old ones stay unpenalized.
    s = cheat(s, "p0", "noRelayPenalty", false);
    for (let i = 0; i < 6; i++) {
      player(s, "p0").ap = cfg.maxAp;
      const r = applyAction(s, "p0", { type: "repair_pilgred", equipment: "MOTOR_ROOM:PILGRED" });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.pilgred.pool.tokens.filter((t) => t.unpenalized)).toHaveLength(3);
    expect(gain(s).min).toBeLessThan(first.min);
  });

  it("free hacking gives access to every title, held or not", () => {
    let s = fresh();
    const holder = s.titles.commander!;
    const other = s.players.find((p) => p.id !== holder)!.id;
    expect(hasTitleAccess(s, player(s, holder), "commander")).toBe(true);
    expect(hasTitleAccess(s, player(s, other), "commander")).toBe(false);
    s = cheat(s, other, "freeHacking");
    for (const title of TITLE_IDS) expect(bypassesTitles(player(s, other), title)).toBe(true);
    for (const title of TITLE_IDS) expect(hasTitleAccess(s, player(s, other), title)).toBe(true);
    s.titles.commander = null;
    expect(hasTitleAccess(s, player(s, other), "commander")).toBe(true);
  });

  it("unrestricted terminals (freeHacking) offers all unfinished researches ignoring item, Chun and post-selection requirements", () => {
    let s = createGame(seats, { ...cfg, preselection: PRESELECTION }, 7);
    for (const p of s.players) p.room = "LABORATORY";
    s.players[0]!.role = "mush";
    // ANTI_MUSH_SERUM requires mush_sample, mush_floppy_disk, Chun, and post-selection.
    expect(applyAction(s, "p0", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" }).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "research" && a.research === "ANTI_MUSH_SERUM")).toBe(false);
    s = cheat(s, "p0", "freeHacking");
    expect(offered(s, "p0").filter((a) => a.type === "research").map((a) => a.research).sort()).toEqual([...RESEARCH_IDS].sort());
    expect(offered(s, "p0").filter((a) => a.type === "spoil_research").map((a) => a.research).sort()).toEqual([...RESEARCH_IDS].sort());
    const afterWork = applyAction(s, "p0", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" });
    expect(afterWork.ok).toBe(true);
    const afterSpoil = applyAction(s, "p0", { type: "spoil_research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" });
    expect(afterSpoil.ok).toBe(true);
    // Others without the cheat still cannot access restricted researches.
    expect(applyAction(s, "p1", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" }).ok).toBe(false);
  });

  it("unrestricted terminals (freeHacking) shows and offers all unfinished projects at NERON's core without disturbing the 3-project batch", () => {
    let s = fresh();
    for (const p of s.players) p.room = "NEXUS_ROOM";
    const batch = offeredProjects(s);
    const unoffered = PROJECT_IDS.find((id) => !batch.includes(id))!;
    s.projects[unoffered] = 10;
    expect(viewFor(s, "p1").projects[unoffered]).toBeUndefined();
    expect(applyAction(s, "p0", { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: unoffered }).ok).toBe(false);

    s = cheat(s, "p0", "freeHacking");
    const coreView = viewFor(s, "p0");
    expect(coreView.projects[unoffered]).toBe(10);
    expect(Object.keys(coreView.relay.projects).sort()).toEqual([...PROJECT_IDS].sort());
    expect(offered(s, "p0").filter((a) => a.type === "project").map((a) => a.project).sort()).toEqual([...PROJECT_IDS].sort());

    // Completing an unoffered project with the cheat removes only that project from the deck.
    s.projects[unoffered] = PROJECT_COMPLETE - 1;
    const afterUnoffered = applyAction(s, "p0", { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: unoffered });
    if (!afterUnoffered.ok) throw new Error(afterUnoffered.error);
    expect(afterUnoffered.state.projects[unoffered]).toBe(PROJECT_COMPLETE);
    expect(afterUnoffered.state.projectDeck).not.toContain(unoffered);
    expect(offeredProjects(afterUnoffered.state)).toEqual(batch);
  });
});

describe("infinite charges cheat", () => {
  it("refills carried charged items after use, and leaves items on the floor alone", () => {
    let s = fresh();
    s.items.push({ id: "w", type: "blaster", at: { kind: "player", id: "p0" }, charges: 0 }, { id: "f", type: "blaster", at: { kind: "room", id: player(s, "p0").room }, charges: 0 });
    s = cheat(s, "p0", "infiniteCharges");
    expect(s.items.find((i) => i.id === "w")!.charges).toBe(cfg.weapons.types.blaster!.charges);
    expect(s.items.find((i) => i.id === "f")!.charges).toBe(0);
  });
});

describe("any-skill cheat", () => {
  const skillsOffered = (s: GameState, id: PlayerId) => offered(s, id).flatMap((a) => (a.type === "pick_skill" && isSkill(a.skill) ? [a.skill] : []));

  it("offers every human skill, not just the character's, still within the slots", () => {
    let s = cheat(fresh(), "p0", "anySkill");
    expect(skillsOffered(s, "p0").sort()).toEqual([...SKILLS].sort());
    expect(skillsOffered(s, "p1").sort()).toEqual([...CHARACTER_SKILLS[player(s, "p1").character]].sort());
    const outsiders = SKILLS.filter((k) => !CHARACTER_SKILLS[player(s, "p0").character].includes(k));
    for (const skill of outsiders.slice(0, SKILL_SLOTS)) {
      const r = applyAction(s, "p0", { type: "pick_skill", skill });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(player(s, "p0").skills).toEqual(outsiders.slice(0, SKILL_SLOTS));
    expect(applyAction(s, "p0", { type: "pick_skill", skill: outsiders[SKILL_SLOTS]! })).toMatchObject({ ok: false });
  });

  it("switched off, the character's list applies again; skills already picked stay", () => {
    let s = cheat(fresh(), "p0", "anySkill");
    const outsider = SKILLS.find((k) => !CHARACTER_SKILLS[player(s, "p0").character].includes(k))!;
    const r = applyAction(s, "p0", { type: "pick_skill", skill: outsider });
    if (!r.ok) throw new Error(r.error);
    s = cheat(r.state, "p0", "anySkill", false);
    expect(player(s, "p0").skills).toEqual([outsider]);
    expect(skillsOffered(s, "p0").sort()).toEqual([...CHARACTER_SKILLS[player(s, "p0").character]].sort());
  });

  it("always clean: cleanses existing dirt and keeps the player clean after actions", () => {
    let s = fresh();
    s.players.find((p) => p.id === "p0")!.statuses.push("dirty");
    s = cheat(s, "p0", "alwaysClean");
    expect(player(s, "p0").statuses).not.toContain("dirty");
    const door = offered(s, "p0").find((a) => a.type === "move")!;
    s = walk(s, "p0", door.type === "move" ? door.to : "");
    expect(player(s, "p0").statuses).not.toContain("dirty");
  });

  it("invincible: the ship and everyone on it lose nothing, whoever has it on", () => {
    let s = cheat(fresh(), "p0", "invincible");
    const hull = s.ship.hull;
    const shield = s.ship.plasmaShield;
    damageShip(s, 40);
    expect(s.ship.hull).toBe(hull);
    expect(s.ship.plasmaShield).toBe(shield);
    s.ship.oxygen = 0;
    burnOxygen(s);
    expect(s.players.every((p) => p.alive)).toBe(true);
    const p1 = player(s, "p1");
    const morale = p1.morale;
    damage(s, p1, 99, "injury");
    gainMorale(s, p1, -5);
    expect(p1.alive).toBe(true);
    expect(p1.hp).toBe(p1.maxHp);
    expect(p1.morale).toBe(morale);
    s = cheat(s, "p0", "invincible", false);
    damageShip(s, 40);
    expect(s.ship.hull).toBeLessThan(hull);
  });
});
