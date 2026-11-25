import { describe, expect, it } from "vitest";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { CHARACTER_SKILLS, MUSH_SKILLS, MUSH_SKILL_SLOTS, PICKABLE_MUSH_SKILLS, SKILLS, SKILL_SLOTS, skillStatus } from "../src/skills.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, testConfig } from "./support.ts";

/** p0 and p1 Mush, p2 and p3 human, everyone in the same room. */
function ship(): GameState {
  return createGame(makeSeats(4), testConfig({ mushCount: 2 }), 42, { p0: "mush", p1: "mush" });
}

const pick = (state: GameState, id: string, skill: string) => applyAction(state, id, { type: "pick_skill", skill });
const offered = (state: GameState, id: string) => legalActions(state, id).flatMap((a) => (a.type === "pick_skill" ? [a.skill] : []));

describe("Mush skills", () => {
  it("has four slots and the original's 26 Mush skills, only some implemented yet (Transfer, Fertile, Pyromaniac, Saboteur, ...)", () => {
    expect([MUSH_SKILL_SLOTS, MUSH_SKILLS.length]).toEqual([4, 27]);
    const full = ["transfert", "epigenetics", "fertile", "neron_access", "pyromane", "sapper", "electro_slime", "water_resistant", "phagocytosis", "disheartening_contact", "nimble_fingers", "massggedon", "traitor", "doorman", "bacterial_contact", "trapper", "nightmare", "tough", "ninja", "defacer", "mycellium_spirit"];
    const partial = ["fungus_cook"];
    for (const skill of MUSH_SKILLS) expect(skillStatus(skill), skill).toBe(full.includes(skill) ? "full" : partial.includes(skill) ? "partial" : "none");
    expect(MUSH_SKILLS.filter((s) => (SKILLS as readonly string[]).includes(s))).toEqual([]);
  });

  it("offers a Mush every pickable Mush skill (excluding innate Fertile) as well as their character's human ones; a human gets only human ones", () => {
    const state = ship();
    expect(offered(state, "p0").sort()).toEqual([...CHARACTER_SKILLS.chao, ...PICKABLE_MUSH_SKILLS].sort());
    expect(offered(state, "p0")).not.toContain("fertile");
    expect(offered(state, "p2").sort()).toEqual([...CHARACTER_SKILLS.eleesha].sort());
  });

  it("puts a Mush skill in the Mush slots for free, separate from the human slots", () => {
    const before = ship();
    const after = must(pick(before, "p0", "pyromane"));
    const p = after.players[0]!;
    expect(p.mushSkills).toEqual(["pyromane"]);
    expect(p.skills).toEqual([]);
    expect([p.ap, p.mp]).toEqual([before.players[0]!.ap, before.players[0]!.mp]);
    expect(before.players[0]!.mushSkills).toEqual([]);
  });

  it("fills the Mush slots and the human slots independently", () => {
    let state = ship();
    for (const skill of PICKABLE_MUSH_SKILLS.slice(0, MUSH_SKILL_SLOTS)) state = must(pick(state, "p0", skill));
    expect(offered(state, "p0").filter((s) => (MUSH_SKILLS as readonly string[]).includes(s))).toEqual([]);
    expect(pick(state, "p0", PICKABLE_MUSH_SKILLS[MUSH_SKILL_SLOTS]!).ok).toBe(false);
    for (const skill of CHARACTER_SKILLS.chao.slice(0, SKILL_SLOTS)) state = must(pick(state, "p0", skill));
    expect(state.players[0]!.mushSkills).toHaveLength(MUSH_SKILL_SLOTS);
    expect(state.players[0]!.skills).toHaveLength(SKILL_SLOTS);
    expect(offered(state, "p0")).toEqual([]);
  });

  it("refuses a Mush skill to a human, or twice to a Mush, leaving state unchanged", () => {
    const state = ship();
    state.players[0]!.mushSkills = ["ninja"];
    const before = JSON.stringify(state);
    expect(pick(state, "p2", "ninja").ok).toBe(false);
    expect(pick(state, "p0", "ninja").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("lets a human converted to Mush pick Mush skills", () => {
    const state = ship();
    state.players[2]!.role = "mush";
    expect(must(pick(state, "p2", "anonymous")).players[2]!.mushSkills).toEqual(["anonymous"]);
  });

  it("accepts Mush skill ids in untrusted messages", () => {
    const msg = (skill: unknown) => parseGameMessage(JSON.stringify({ type: "action", action: { type: "pick_skill", skill } }));
    expect(msg("transfert")).toEqual({ type: "action", action: { type: "pick_skill", skill: "transfert" } });
    expect(msg("TRANSFERT")).toBeNull();
  });

  it("shows Mush skills to their owner and living Mush in the same room, never to humans, dead Mush, comatose Mush, or Mush elsewhere", () => {
    const state = must(pick(ship(), "p0", "nimble_fingers"));
    expect(viewFor(state, "p0").you.mushSkills).toEqual(["nimble_fingers"]);

    // Living Mush roommate sees p0's Mush skills, and p0 sees p1's (empty array when none picked).
    expect(viewFor(state, "p1").players.find((p) => p.id === "p0")?.mushSkills).toEqual(["nimble_fingers"]);
    expect(viewFor(state, "p0").players.find((p) => p.id === "p1")?.mushSkills).toEqual([]);

    // Human roommates never see Mush skills.
    for (const id of ["p2", "p3"]) {
      expect(viewFor(state, id).players.find((p) => p.id === "p0")?.mushSkills).toBeUndefined();
      expect(JSON.stringify(viewFor(state, id))).not.toContain("nimble_fingers");
    }

    // Another Mush in a different room does not see p0's Mush skills.
    const apart = structuredClone(state);
    apart.players[1]!.room = "REFECTORY";
    expect(viewFor(apart, "p1").players.find((p) => p.id === "p0")?.mushSkills).toBeUndefined();
    expect(JSON.stringify({ ...viewFor(apart, "p1"), actions: [] })).not.toContain("nimble_fingers");

    // A dead Mush viewer or dead Mush target does not share Mush skills.
    const deadViewer = structuredClone(state);
    deadViewer.players[1]!.alive = false;
    expect(viewFor(deadViewer, "p1").players.find((p) => p.id === "p0")?.mushSkills).toBeUndefined();
    expect(JSON.stringify({ ...viewFor(deadViewer, "p1"), actions: [] })).not.toContain("nimble_fingers");

    const deadTarget = structuredClone(state);
    deadTarget.players[0]!.alive = false;
    expect(viewFor(deadTarget, "p1").players.find((p) => p.id === "p0")?.mushSkills).toBeUndefined();
    expect(JSON.stringify({ ...viewFor(deadTarget, "p1"), actions: [] })).not.toContain("nimble_fingers");

    // A comatose Mush viewer is blind and does not see p0's Mush skills.
    const comatose = structuredClone(state);
    comatose.players[1]!.comaUntil = comatose.cycle + 2;
    expect(viewFor(comatose, "p1").players).toEqual([]);
    expect(JSON.stringify({ ...viewFor(comatose, "p1"), actions: [] })).not.toContain("nimble_fingers");
  });
});
