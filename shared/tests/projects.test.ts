import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import projets from "@mush2/assets/derived/data/Data/projets.json";
import { PROJECT_COMPLETE, PROJECT_IDS, PROJECTS, projectSkills } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, mustApply, offered, pickSkill, setProgress } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });
const AP = DEFAULT_CONFIG.project.cost.ap;

function game(room = "NEXUS_ROOM") {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("NERON projects", () => {
  it("pins the decided numbers: 2 AP, the relay formula 6 x 10 / 10, +4 a skill, -2 a repeat", () => {
    const { rate, mod, skillBoost, relayPenalty } = DEFAULT_CONFIG.project.progress;
    expect([DEFAULT_CONFIG.project.cost.ap, rate, mod, skillBoost, relayPenalty]).toEqual([2, 6, 10, 4, 2]);
    expect(DEFAULT_CONFIG.research.progress).toEqual(DEFAULT_CONFIG.project.progress);
  });

  it("starts with nothing done and every project offered at NERON's core, and not at the BIOS terminal", () => {
    const s = game();
    expect(s.projects).toEqual({});
    const actions = offered(s, "p0").filter((a) => a.type === "project");
    expect(actions.map((a) => a.project).sort()).toEqual([...PROJECT_IDS].sort());
    expect(actions.every((a) => a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(true);
    expect(PROJECT_IDS).toHaveLength(41);
    expect(applyAction(s, "p0", { type: "project", equipment: "NEXUS_ROOM:NERON_BIOS_TERM", project: "PLASMA_SHIELD" }).ok).toBe(false);
  });

  it("costs AP and advances the chosen project, for anyone, with the relay penalty for repeats", () => {
    const s = game();
    const ap = s.players[1]!.ap;
    const r = applyAction(s, "p1", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    const first = r.state.projects.PLASMA_SHIELD!;
    expect(first).toBeGreaterThanOrEqual(6);
    expect(first).toBeLessThanOrEqual(9);
    expect(r.state.players[1]!.ap).toBe(ap - AP);
    expect(r.state.research).toEqual({});
    const again = applyAction(r.state, "p1", work("PLASMA_SHIELD"));
    // The repeat is penalised by 2: 4-6.
    const second = again.ok ? again.state.projects.PLASMA_SHIELD! - first : -1;
    expect(second).toBeGreaterThanOrEqual(4);
    expect(second).toBeLessThanOrEqual(6);
    // Someone else in between resets the streak.
    const other = applyAction(r.state, "p0", work("PLASMA_SHIELD"));
    if (!other.ok) throw new Error(other.error);
    const back = applyAction(other.state, "p1", work("PLASMA_SHIELD"));
    expect(back.ok && back.state.projects.PLASMA_SHIELD! - other.state.projects.PLASMA_SHIELD!).toBeGreaterThanOrEqual(6);
  });

  it("takes each project's skills from the original's tags (CONCEPTOR is designer, ALL is nobody)", () => {
    const rename: Record<string, string> = { conceptor: "designer" };
    const live = projets.slice(0, projets.findIndex((r) => r.id === "$EOF"));
    const fromData = live.map((r) => ({ id: r.id, skills: r.tags.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t && t !== "all").map((t) => rename[t] ?? t) }));
    expect(PROJECTS).toEqual(fromData);
    expect(projectSkills("NO_SUCH_PROJECT")).toEqual([]);
  });

  it("adds the skill boost for each of the project's skills the worker has, and none for other skills", () => {
    const cfg = DEFAULT_CONFIG.project.progress;
    const s = game();
    s.rng = 7;
    const you = s.players[0]!;
    you.skills = ["engineer", "physicist"];
    expect(viewFor(s, "p0").relay.projects.PLASMA_SHIELD!.gain.min).toBe(6 + 2 * cfg.skillBoost);
    const r = mustApply(s, "p0", work("PLASMA_SHIELD"));
    expect(r.projects.PLASMA_SHIELD).toBeGreaterThanOrEqual(6 + 2 * cfg.skillBoost);
    you.skills = ["biologist", "medic"];
    const plain = mustApply(s, "p0", work("PLASMA_SHIELD")).projects.PLASMA_SHIELD!;
    expect(plain).toBeLessThanOrEqual(9);
    you.skills = ["designer"];
    expect(mustApply(s, "p0", work("BRIC_BROC")).projects.BRIC_BROC).toBeGreaterThanOrEqual(6 + cfg.skillBoost);
  });

  it("does not make project work dirty", () => {
    const s = game();
    s.rng = 7;
    const r = applyAction(s, "p0", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.statuses).not.toContain("dirty");
  });

  it("completes at 100% and then is no longer offered or accepted", () => {
    let s = game();
    setProgress(s, { project: "BEAT_BOX" }, PROJECT_COMPLETE - 1);
    s.players[0]!.ap = 12;
    const r = applyAction(s, "p0", work("BEAT_BOX"));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.projects.BEAT_BOX).toBe(100);
    expect(s.log.at(-1)?.key).toBe("projectCompleted");
    s.players[0]!.ap = 12;
    expect(offered(s, "p0")).not.toContainEqual(work("BEAT_BOX"));
    expect(applyAction(s, "p0", work("BEAT_BOX")).ok).toBe(false);
  });

  it("can complete every project", () => {
    let s = game();
    for (const id of PROJECT_IDS)
      {
        setProgress(s, { project: id }, PROJECT_COMPLETE - 1);
        s.players[0]!.ap = 12;
        const r = applyAction(s, "p0", work(id));
        if (!r.ok) throw new Error(`${id}: ${r.error}`);
        s = r.state;
      }
    expect(PROJECT_IDS.every((id) => s.projects[id] === 100)).toBe(true);
    expect(offered(s, "p0").some((a) => a.type === "project")).toBe(false);
  });

  it("is refused when dirty, too poor, in another room, or for an unknown project, leaving state unchanged", () => {
    const s = game();
    addStatus(s.players[0]!, "dirty");
    expect(applyAction(s, "p0", work("PLASMA_SHIELD")).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "project")).toBe(false);
    s.players[1]!.ap = AP - 1;
    expect(applyAction(s, "p1", work("PLASMA_SHIELD")).ok).toBe(false);
    expect(applyAction(game("LABORATORY"), "p0", work("PLASMA_SHIELD")).ok).toBe(false);
    expect(offered(game("LABORATORY"), "p0").some((a) => a.type === "project")).toBe(false);
    expect(applyAction(s, "p2", work("MYCOSCAN")).ok).toBe(false);
    expect(s.projects).toEqual({});
  });

  it("is free with a Computer point, which is spent", () => {
    let s = game();
    s = pickSkill(s, "p0", "computer");
    const ap = s.players[0]!.ap;
    const comp = s.players[0]!.resources.comp;
    const r = applyAction(s, "p0", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.players[0]!.resources.comp).toBe(comp - 1);
    r.state.players[0]!.ap = 0;
    expect(applyAction(r.state, "p0", work("PLASMA_SHIELD")).ok).toBe(true);
  });

  it("tells the view which point pays: a Designer point before a Computer point, none once both are spent", () => {
    const s = game();
    const paidBy = (state: typeof s) => viewFor(state, "p0").actions.find((o) => o.action.type === "project")!.cost.paidBy;
    s.players[0]!.resources.comp = 1;
    s.players[0]!.resources.core = 1;
    expect(paidBy(s)).toBe("core");
    const first = mustApply(s, "p0", work("PLASMA_SHIELD"));
    expect(first.players[0]!.resources).toMatchObject({ core: 0, comp: 1 });
    expect(paidBy(first)).toBe("comp");
    const second = mustApply(first, "p0", work("PLASMA_SHIELD"));
    expect(second.players[0]!.resources.comp).toBe(0);
    expect(paidBy(second)).toBeUndefined();
  });

  it("is seen only at NERON's core until complete, and only the room sees the log line (owner, 2026-10-31)", () => {
    let s = game();
    s.players[2]!.room = "REFECTORY";
    s = mustApply(s, "p0", work("WHOS_WHO"));
    for (const id of ["p0", "p1"]) {
      expect(viewFor(s, id).projects).toEqual(s.projects);
      expect(viewFor(s, id).relay.projects.WHOS_WHO!.tokens).toEqual([{ by: "p0", value: s.projects.WHOS_WHO }]);
    }
    expect(viewFor(s, "p2").projects).toEqual({});
    expect(viewFor(s, "p2").relay.projects).toEqual({});
    expect(viewFor(s, "p1").log.some((e) => e.key === "projectWorked")).toBe(true);
    expect(viewFor(s, "p2").log.some((e) => e.key === "projectWorked")).toBe(false);
    // The dead see nothing, even at the core; completion reaches everyone.
    s.players[1]!.alive = false;
    expect(viewFor(s, "p1").projects).toEqual({});
    setProgress(s, { project: "WHOS_WHO" }, PROJECT_COMPLETE - 1);
    s.players[0]!.ap = 12;
    s = mustApply(s, "p0", work("WHOS_WHO"));
    expect(viewFor(s, "p2").projects).toEqual({ WHOS_WHO: PROJECT_COMPLETE });
    expect(viewFor(s, "p2").relay.projects).toEqual({});
  });

  it("parses from the wire, and rejects a missing project", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("PLASMA_SHIELD") }))).toEqual({ type: "action", action: work("PLASMA_SHIELD") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "project", equipment: "x" } }))).toBeNull();
  });
});
