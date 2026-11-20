import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { AT_CAPACITY } from "../src/actions/action.ts";
import { actionTarget } from "../src/actionTarget.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, nextDay, offered, pickSkill, player } from "./support.ts";

const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], startMp: 0 };

/** Four crewmates: p0 is Commander in COMMAND_CENTER, p1 in COMMAND_CENTER (roommate), p2 in LABORATORY, p3 in REFECTORY. */
function ship(config = base): GameState {
  const s = createGame(makeSeats(4), config, 7);
  s.titles.commander = "p0";
  player(s, "p0").room = "COMMAND_CENTER";
  player(s, "p1").room = "COMMAND_CENTER";
  player(s, "p2").room = "LABORATORY";
  player(s, "p3").room = "REFECTORY";
  // Give recipients room below maxAp unless a test sets it otherwise.
  for (const id of ["p1", "p2", "p3"]) player(s, id).ap = 4;
  return s;
}

const mission = (subordinate: string) => ({ type: "issue_mission" as const, subordinate });
const check = (s: GameState, id: string, subordinate: string) =>
  ACTIONS.issue_mission.check(s, player(s, id), mission(subordinate));

describe("Commander: Issue mission (#462)", () => {
  it("pins the confirmed numbers", () => {
    expect([base.commanderMission.cost.ap, base.commanderMission.apGranted]).toEqual([1, 3]);
  });

  it("is offered only to the Commander (Mush included), never to freeHacking, hacker kit, former Commander, or during pre-selection", () => {
    const s = ship();
    // Commander in COMMAND_CENTER sees candidates for all three other active crewmates, regardless of room.
    expect(offered(s, "p0").filter((a) => a.type === "issue_mission")).toEqual([mission("p1"), mission("p2"), mission("p3")]);
    // Non-commanders never get it, even with freeHacking or a hacked equipment in the room.
    player(s, "p1").cheats.push("freeHacking");
    player(s, "p1").hackedEquipment = { id: "COMMAND_CENTER:COMMAND_TERMINAL", room: "COMMAND_CENTER" };
    expect(offered(s, "p1").some((a) => a.type === "issue_mission")).toBe(false);
    expect(check(s, "p1", "p2")).toBe("not_commander");
    expect(applyAction(s, "p1", mission("p2"))).toEqual({ ok: false, error: "illegal_action" });

    // Mush Commander still gets it.
    player(s, "p0").role = "mush";
    expect(offered(s, "p0").filter((a) => a.type === "issue_mission")).toEqual([mission("p1"), mission("p2"), mission("p3")]);

    // Former Commander loses access immediately when title moves.
    s.titles.commander = "p2";
    expect(offered(s, "p0").some((a) => a.type === "issue_mission")).toBe(false);
    expect(check(s, "p0", "p1")).toBe("not_commander");
    expect(applyAction(s, "p0", mission("p1"))).toEqual({ ok: false, error: "illegal_action" });

    // Pre-selection has no Commander, so nobody gets it.
    const pre = createGame(makeSeats(4), { ...base, preselection: PRESELECTION }, 7);
    for (const p of pre.players) expect(offered(pre, p.id).some((a) => a.type === "issue_mission")).toBe(false);
  });

  it("works from any room and does not walk up to the recipient", () => {
    const s = ship();
    player(s, "p0").room = "ENGINE_ROOM";
    const action = mission("p2");
    expect(actionTarget(action)).toBeNull();
    const next = must(applyAction(s, "p0", action));
    expect(player(next, "p0").ap).toBe(player(s, "p0").ap - base.commanderMission.cost.ap);
    expect(player(next, "p2").ap).toBe(player(s, "p2").ap + base.commanderMission.apGranted);
  });

  it("never offers self, dead, inactive, or super-inactive players, and refuses them without changing state", () => {
    const s = ship();
    killPlayer(s, player(s, "p1"), "starvation");
    player(s, "p2").inactivity = "inactive";
    player(s, "p3").inactivity = "super_inactive";
    expect(offered(s, "p0").some((a) => a.type === "issue_mission")).toBe(false);

    const before = structuredClone(s);
    for (const bad of ["p0", "p1", "p2", "p3", "p999"]) {
      expect(check(s, "p0", bad)).toBe("invalid_subordinate");
      expect(applyAction(s, "p0", mission(bad))).toEqual({ ok: false, error: "illegal_action" });
    }
    expect(s).toEqual(before);
  });

  it("caps granted AP at maxAp, still allowing a target already at maxAp", () => {
    const s = ship();
    player(s, "p1").ap = player(s, "p1").maxAp - 1;
    const capped = must(applyAction(s, "p0", mission("p1")));
    expect(player(capped, "p1").ap).toBe(player(capped, "p1").maxAp);

    const s2 = ship();
    player(s2, "p2").ap = player(s2, "p2").maxAp;
    expect(offered(s2, "p0")).toContainEqual(mission("p2"));
    const atMax = must(applyAction(s2, "p0", mission("p2")));
    expect(player(atMax, "p2").ap).toBe(player(atMax, "p2").maxAp);
    expect(player(atMax, "p0").ap).toBe(player(s2, "p0").ap - base.commanderMission.cost.ap);
  });

  it("is limited to once per ship per day, survives a same-day coup or Commander death, and resets on a new day", () => {
    let s = ship();
    // Prepare p1 as a Politician at NERON core for a same-day coup.
    player(s, "p1").room = "NEXUS_ROOM";
    s = pickSkill(s, "p1", "politician");

    // Commander p0 issues a mission to p2.
    s = must(applyAction(s, "p0", mission("p2")));
    expect(s.missionIssuedToday).toBe(true);
    expect(offered(s, "p0").some((a) => a.type === "issue_mission")).toBe(false);
    expect(check(s, "p0", "p3")).toBe(AT_CAPACITY);
    expect(applyAction(s, "p0", mission("p3"))).toEqual({ ok: false, error: "illegal_action" });
    // The button stays, disabled: every subordinate is still in view.actions, lacking "capacity" (owner prefers disabled to hidden).
    const disabled = viewFor(s, "p0").actions.filter((o) => o.action.type === "issue_mission");
    expect(disabled.map((o) => o.action)).toEqual([mission("p1"), mission("p2"), mission("p3")]);
    expect(disabled.every((o) => o.lacks.includes("capacity"))).toBe(true);

    // p1 stages a coup and takes the title on the next cycle (still day 1).
    s = must(applyAction(s, "p1", { type: "coup", equipment: "NEXUS_ROOM:NERON_CORE" }));
    s = nextCycle(s);
    expect(s.titles.commander).toBe("p1");
    expect(s.missionIssuedToday).toBe(true);
    expect(offered(s, "p1").some((a) => a.type === "issue_mission")).toBe(false);
    expect(check(s, "p1", "p2")).toBe(AT_CAPACITY);
    expect(applyAction(s, "p1", mission("p2"))).toEqual({ ok: false, error: "illegal_action" });

    // Even if p1 dies and the title passes to p2 on the same day, still no second use.
    killPlayer(s, player(s, "p1"), "starvation");
    expect(s.titles.commander).not.toBe("p1");
    const heir = s.titles.commander!;
    expect(offered(s, heir).some((a) => a.type === "issue_mission")).toBe(false);
    expect(check(s, heir, "p3")).toBe(AT_CAPACITY);
    expect(applyAction(s, heir, mission("p3"))).toEqual({ ok: false, error: "illegal_action" });

    // New day resets the daily limit.
    s = nextDay(s);
    expect(s.missionIssuedToday).toBe(false);
    expect(offered(s, heir).some((a) => a.type === "issue_mission")).toBe(true);
  });

  it("writes private log lines visible only to the Commander and the recipient, and never leaks missionIssuedToday", () => {
    const s = ship();
    // Put a camera in COMMAND_CENTER (where p0 and p1 are) and in LABORATORY (where p2 is), and put p3 in LABORATORY as roommate.
    s.equipment.COMMAND_CENTER.push({ id: "COMMAND_CENTER:CAMERA", type: "CAMERA" });
    s.equipment.LABORATORY.push({ id: "LABORATORY:CAMERA", type: "CAMERA" });
    player(s, "p3").room = "LABORATORY";

    const next = must(applyAction(s, "p0", mission("p2")));

    const v0 = viewFor(next, "p0");
    const v1 = viewFor(next, "p1");
    const v2 = viewFor(next, "p2");
    const v3 = viewFor(next, "p3");

    // Commander sees missionIssued only.
    expect(v0.log.filter((e) => e.key === "missionIssued")).toEqual([
      expect.objectContaining({ key: "missionIssued", params: { target: player(next, "p2").character }, kind: "private" }),
    ]);
    expect(v0.log.some((e) => e.key === "missionReceived")).toBe(false);

    // Target sees missionReceived only.
    expect(v2.log.filter((e) => e.key === "missionReceived")).toEqual([
      expect.objectContaining({ key: "missionReceived", params: { amount: base.commanderMission.apGranted }, kind: "private" }),
    ]);
    expect(v2.log.some((e) => e.key === "missionIssued")).toBe(false);

    // Bystanders (same room as Commander, same room as target, even with cameras) see neither.
    for (const v of [v1, v3]) {
      expect(v.log.some((e) => e.key === "missionIssued" || e.key === "missionReceived")).toBe(false);
    }

    // missionIssuedToday never appears in any view.
    for (const v of [v0, v1, v2, v3]) {
      expect(JSON.stringify(v)).not.toContain("missionIssuedToday");
    }
  });
});
