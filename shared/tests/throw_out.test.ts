import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { breakDoor, doorId } from "../src/doors.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, offered, option, player } from "./support.ts";

const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const ROOM = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 2)!;
const [DOOR_A, DOOR_B] = base.rooms[ROOM]!;

/** p0 (wrestler) and p1 share ROOM; p2 is in DOOR_A; p3 is elsewhere (not ROOM or DOOR_A). */
function ship(skill: "wrestler" | "sturdy" = "wrestler"): GameState {
  const s = createGame(makeSeats(4), base, 7);
  player(s, "p0").room = player(s, "p1").room = ROOM;
  player(s, "p0").skills = [skill];
  player(s, "p2").room = DOOR_A!;
  const elsewhere = Object.keys(base.rooms).find((r) => r !== ROOM && r !== DOOR_A)!;
  player(s, "p3").room = elsewhere;
  return s;
}

describe("throw_out", () => {
  it("pins the config numbers and requires wrestler or sturdy", () => {
    expect([base.throwOut.cost.ap, base.throwOut.cost.inactiveAp]).toEqual([2, 1]);

    const withoutSkill = ship();
    player(withoutSkill, "p0").skills = [];
    expect(offered(withoutSkill, "p0").filter((a) => a.type === "throw_out")).toEqual([]);
    expect(ACTIONS.throw_out.check(withoutSkill, player(withoutSkill, "p0"), { type: "throw_out", target: "p1", to: DOOR_A! })).toBe("no_skill");
    expect(applyAction(withoutSkill, "p0", { type: "throw_out", target: "p1", to: DOOR_A! }).ok).toBe(false);

    expect(offered(ship("wrestler"), "p0").filter((a) => a.type === "throw_out").length).toBeGreaterThan(0);
    expect(offered(ship("sturdy"), "p0").filter((a) => a.type === "throw_out").length).toBeGreaterThan(0);
  });

  it("offers only living roommates and adjacent rooms with unbroken doors", () => {
    const s = ship();
    breakDoor(s, doorId(ROOM, DOOR_A!));
    const offers = offered(s, "p0").filter((a) => a.type === "throw_out");
    expect(offers.every((a) => a.target === "p1")).toBe(true);
    expect(offers.some((a) => a.to === DOOR_A)).toBe(false);
    expect(offers.some((a) => a.to === DOOR_B)).toBe(true);

    expect(ACTIONS.throw_out.check(s, player(s, "p0"), { type: "throw_out", target: "p1", to: DOOR_A! })).toBe("door_broken");
    expect(applyAction(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! }).ok).toBe(false);
    const nonAdjacent = Object.keys(base.rooms).find((r) => r !== ROOM && !base.rooms[ROOM]!.includes(r))!;
    expect(ACTIONS.throw_out.check(s, player(s, "p0"), { type: "throw_out", target: "p1", to: nonAdjacent })).toBe("not_adjacent");
    expect(ACTIONS.throw_out.check(s, player(s, "p0"), { type: "throw_out", target: "p2", to: DOOR_B! })).toBe("cant_see");
    expect(ACTIONS.throw_out.check(s, player(s, "p0"), { type: "throw_out", target: "p0", to: DOOR_B! })).toBe("cant_see");
    killPlayer(s, player(s, "p1"), "assassinated");
    expect(offered(s, "p0").filter((a) => a.type === "throw_out")).toEqual([]);
  });

  it("costs 2 AP (1 AP on inactive targets) and triggers aggressive surcharges", () => {
    const s = ship();
    const normal = option(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! })!;
    expect([normal.cost.ap, normal.tags]).toEqual([base.throwOut.cost.ap, ["aggressive"]]);

    player(s, "p1").inactivity = "inactive";
    const inactive = option(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! })!;
    expect(inactive.cost.ap).toBe(base.throwOut.cost.inactiveAp);

    // Pacifist (+2 AP) and Bodyguard's Protect (+2 AP) both apply because throw_out is aggressive.
    player(s, "p1").inactivity = undefined;
    player(s, "p1").skills = ["pacifist"];
    const withPacifist = option(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! })!;
    expect(withPacifist.cost.ap).toBe(base.throwOut.cost.ap + base.pacifist.aggressiveApSurcharge);
  });

  it("moves the target, updates spot/enteredFrom, clears guardian/lying/timed action/push, and logs in both rooms", () => {
    const s = ship();
    const victim = player(s, "p1");
    victim.statuses.push("guardian");
    victim.modifiers.push("lying_down");
    victim.lyingIn = "SOME_BED";
    victim.lyingSince = 1;
    victim.current = {
      action: { type: "search" },
      adjustment: { ap: 0, mp: 0 },
      since: 0,
      until: 1000,
    };
    victim.queue = [{ type: "search" }];
    victim.pushedBy = "p0";

    const after = mustApply(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! });
    const moved = player(after, "p1");
    expect(moved.room).toBe(DOOR_A);
    expect(moved.enteredFrom).toBe(ROOM);
    expect(moved.spot).toEqual({ kind: "door", door: ROOM });
    expect(moved.statuses).not.toContain("guardian");
    expect(moved.modifiers).not.toContain("lying_down");
    expect(moved.lyingIn).toBeUndefined();
    expect(moved.current).toBeNull();
    expect(moved.queue).toEqual([]);
    expect(moved.pushedBy).toBeUndefined();
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - base.throwOut.cost.ap);

    // Public log in origin room and destination room; hidden from a third room.
    const originLog = viewFor(after, "p0").log;
    const destLog = viewFor(after, "p2").log;
    const otherLog = viewFor(after, "p3").log;
    expect(originLog.some((e) => e.key === "threwOut" && e.room === ROOM)).toBe(true);
    expect(originLog.some((e) => e.key === "thrownIn")).toBe(false);
    expect(destLog.some((e) => e.key === "thrownIn" && e.room === DOOR_A)).toBe(true);
    expect(destLog.some((e) => e.key === "threwOut")).toBe(false);
    expect(otherLog.some((e) => e.key === "threwOut" || e.key === "thrownIn")).toBe(false);
  });

  it("refuses in preselection and leaves state unchanged when illegal", () => {
    const s = ship();
    s.preselection = true;
    expect(offered(s, "p0").filter((a) => a.type === "throw_out")).toEqual([]);
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", { type: "throw_out", target: "p1", to: DOOR_A! }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
