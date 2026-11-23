import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { killPlayer } from "../src/death.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { cure } from "../src/infection.ts";
import { logCovert, logPrivate, logPublic, SOMEONE, withNinjaActor } from "../src/log.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, option, player, testConfig } from "./support.ts";

const base = testConfig();
const ROOM_A = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 2)!;
const ROOM_B = base.rooms[ROOM_A]![0]!;

/** p0 is a Mush with Ninja, p1 and p2 humans, all in ROOM_A. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 42);
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = ROOM_A;
  player(s, "p0").role = "mush";
  player(s, "p0").mushSkills = ["ninja"];
  player(s, "p1").role = "human";
  player(s, "p2").role = "human";
  return s;
}

const ninja = (): GameState => mustApply(ship(), "p0", { type: "become_ninja" });

describe("ninja", () => {
  it("only a Mush with Ninja can become a ninja: free, instant, private, unrecorded, and back again", () => {
    const s = ship();
    expect([ACTIONS.become_ninja.timed, ACTIONS.become_normal.timed]).toEqual([false, false]);
    expect([ACTIONS.become_ninja.recorded, ACTIONS.become_normal.recorded]).toEqual([false, false]);
    expect(option(s, "p1", { type: "become_ninja" })).toBeUndefined();
    expect(applyAction(s, "p1", { type: "become_ninja" }).ok).toBe(false);
    player(s, "p0").mushSkills = [];
    expect(applyAction(s, "p0", { type: "become_ninja" }).ok).toBe(false);
    player(s, "p0").mushSkills = ["ninja"];

    expect(option(s, "p0", { type: "become_ninja" })!.cost).toEqual({ ap: 0, mp: 0 });
    const on = mustApply(s, "p0", { type: "become_ninja" });
    expect(viewFor(on, "p0").statuses).toContain("ninja");
    expect(viewFor(on, "p0").log.at(-1)).toMatchObject({ key: "becameNinja", kind: "private" });
    expect(applyAction(on, "p0", { type: "become_ninja" }).ok).toBe(false);

    const off = mustApply(on, "p0", { type: "become_normal" });
    expect(viewFor(off, "p0").statuses).not.toContain("ninja");
    expect(viewFor(off, "p0").log.at(-1)?.key).toBe("becameNormal");
    expect(applyAction(off, "p0", { type: "become_normal" }).ok).toBe(false);
  });

  it("hides the status and the toggle from everyone else", () => {
    const s = mustApply(ninja(), "p0", { type: "become_normal" });
    const p1 = viewFor(s, "p1");
    expect(p1.players.find((o) => o.id === "p0")!.statuses).not.toContain("ninja");
    expect(p1.log.some((l) => l.key === "becameNinja" || l.key === "becameNormal")).toBe(false);
    expect(JSON.stringify(viewFor(ninja(), "p1"))).not.toContain("ninja");
  });

  it("can't be entered on an expedition", () => {
    const s = ship();
    s.expedition = { report: "r1", planet: "planet-b", sectors: [0], nextAt: 0, carried: {}, sabotaged: false, sabotageNext: false, hp: {}, ship: null };
    s.expeditions.push({ id: "r1", members: ["p0"], crew: [player(s, "p0").character], planet: "Name-planet-b", events: [] });
    player(s, "p0").room = s.config.expedition.craft;
    expect(option(s, "p0", { type: "become_ninja" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "become_ninja" }).ok).toBe(false);
  });

  it("names the ninja Someone in every room line of their actions, the victim's and their own included", () => {
    const hit = mustApply(ninja(), "p0", { type: "punch", target: "p1" });
    const p1 = player(hit, "p1").character;
    for (const id of ["p0", "p1", "p2"]) {
      const line = viewFor(hit, id).log.findLast((l) => l.key.startsWith("punch"))!;
      expect(line.params).toMatchObject({ name: SOMEONE, target: p1 });
    }
    // Moves too: both rooms read "Someone".
    const moved = mustApply(ninja(), "p0", { type: "move", to: ROOM_B });
    expect(moved.log.filter((l) => l.key === "left" || l.key === "entered").map((l) => l.params?.name)).toEqual([SOMEONE, SOMEONE]);
  });

  it("names them again once they become normal", () => {
    const s = mustApply(ninja(), "p0", { type: "become_normal" });
    const hit = mustApply(s, "p0", { type: "punch", target: "p1" });
    expect(hit.log.findLast((l) => l.key.startsWith("punch"))!.params?.name).toBe(player(s, "p0").character);
  });

  it("masks leaked secret and covert lines and private lines to others, but not lines only the ninja sees or ship-wide ones", () => {
    const s = ninja();
    const me = player(s, "p0").character;
    s.equipment[ROOM_A] = [{ id: "cam", type: CAMERA_EQUIPMENT }];
    withNinjaActor("p0", () => {
      logCovert(s, "p0", "filmed", { name: me });
      logPrivate(s, "p1", "toVictim", { target: me });
      logPrivate(s, "p0", "toMe", { name: me });
      logPublic(s, undefined, "shipWide", { name: me });
    });
    const byKey = (k: string) => s.log.find((l) => l.key === k)!.params;
    expect(byKey("filmed")).toEqual({ name: SOMEONE });
    expect(byKey("toVictim")).toEqual({ target: SOMEONE });
    expect(byKey("toMe")).toEqual({ name: me });
    expect(byKey("shipWide")).toEqual({ name: me });
  });

  it("keeps the dead's name on the death line", () => {
    const s = ninja();
    withNinjaActor("p0", () => killPlayer(s, player(s, "p0"), "injury"));
    expect(s.log.find((l) => l.key === "died")!.params?.name).toBe(player(s, "p0").character);
  });

  it("shows no busy bar on a ninja", () => {
    const s = ninja();
    player(s, "p0").current = { action: { type: "extract_spore" }, since: 0, until: 10, adjustment: { ap: 0, mp: 0 } };
    expect(viewFor(s, "p1").players.find((o) => o.id === "p0")!.busy).toBeUndefined();
    const normal = mustApply(s, "p0", { type: "become_normal" });
    player(normal, "p0").current = { action: { type: "punch", target: "p1" }, since: 0, until: 10, adjustment: { ap: 0, mp: 0 } };
    expect(viewFor(normal, "p1").players.find((o) => o.id === "p0")!.busy).toBeDefined();
  });

  it("lasts across cycles and ends on death or cure", () => {
    const s = nextCycle(ninja());
    expect(player(s, "p0").statuses).toContain("ninja");
    const cured = structuredClone(s);
    cure(cured, player(cured, "p0"));
    expect(player(cured, "p0").statuses).not.toContain("ninja");
    killPlayer(s, player(s, "p0"), "injury");
    expect(player(s, "p0").statuses).not.toContain("ninja");
  });
});
