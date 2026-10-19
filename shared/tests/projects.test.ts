import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_IDS } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, offered } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });
const AP = DEFAULT_CONFIG.project.cost.ap;

function game(room = "NEXUS_ROOM") {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("NERON projects", () => {
  it("pins the decided numbers: 2 AP, 25% per action", () => {
    expect([DEFAULT_CONFIG.project.cost.ap, DEFAULT_CONFIG.project.effect.progressPercent]).toEqual([2, 25]);
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

  it("costs AP and advances the chosen project, for anyone, with no repeat penalty", () => {
    const s = game();
    const ap = s.players[1]!.ap;
    const r = applyAction(s, "p1", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.projects).toEqual({ PLASMA_SHIELD: DEFAULT_CONFIG.project.effect.progressPercent });
    expect(r.state.players[1]!.ap).toBe(ap - AP);
    expect(r.state.research).toEqual({});
    const again = applyAction(r.state, "p1", work("PLASMA_SHIELD"));
    expect(again.ok && again.state.projects.PLASMA_SHIELD).toBe(2 * DEFAULT_CONFIG.project.effect.progressPercent);
  });

  it("completes at 100% and then is no longer offered or accepted", () => {
    let s = game();
    for (let i = 0; i < 4; i++) {
      s.players[0]!.ap = 12;
      const r = applyAction(s, "p0", work("BEAT_BOX"));
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.projects.BEAT_BOX).toBe(100);
    expect(s.log.at(-1)?.key).toBe("projectCompleted");
    s.players[0]!.ap = 12;
    expect(offered(s, "p0")).not.toContainEqual(work("BEAT_BOX"));
    expect(applyAction(s, "p0", work("BEAT_BOX")).ok).toBe(false);
  });

  it("can complete every project", () => {
    let s = game();
    for (const id of PROJECT_IDS)
      for (let i = 0; i < 4; i++) {
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
    const pick = applyAction(s, "p0", { type: "pick_skill", skill: "computer" });
    if (!pick.ok) throw new Error(pick.error);
    s = pick.state;
    const ap = s.players[0]!.ap;
    const comp = s.players[0]!.resources.comp;
    const r = applyAction(s, "p0", work("PLASMA_SHIELD"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.players[0]!.resources.comp).toBe(comp - 1);
    r.state.players[0]!.ap = 0;
    expect(applyAction(r.state, "p0", work("PLASMA_SHIELD")).ok).toBe(true);
  });

  it("is public: everyone sees progress, wherever they are, and only the room sees the log line", () => {
    const s = game();
    s.players[2]!.room = "REFECTORY";
    const r = applyAction(s, "p0", work("WHOS_WHO"));
    if (!r.ok) throw new Error(r.error);
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(r.state, id).projects).toEqual({ WHOS_WHO: 25 });
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "projectWorked")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "projectWorked")).toBe(false);
  });

  it("parses from the wire, and rejects a missing project", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("PLASMA_SHIELD") }))).toEqual({ type: "action", action: work("PLASMA_SHIELD") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "project", equipment: "x" } }))).toBeNull();
  });
});
