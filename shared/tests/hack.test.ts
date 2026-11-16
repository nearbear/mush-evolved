import { describe, expect, it } from "vitest";
import { breakEquipment } from "../src/breakage.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { HACKER_KIT_ITEM, ITEM_TYPES } from "../src/items.ts";
import { swapMinds } from "../src/mind.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { hasTitleAccess } from "../src/titles.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, offered, option, pickSkill, player } from "./support.ts";

const config: GameConfig = {
  ...DEFAULT_CONFIG,
  mushCount: 1,
  startInventory: [],
  startItems: [],
  startSkills: [],
};

const PILOT_ID = "COMMAND_CENTER:PILOT_MODULE";
const COMMS_ID = "COMMAND_CENTER:COM_CENTER";

function ship(cfg = config): GameState {
  const s = createGame(makeSeats(3), cfg, 42);
  // p0 is jinsu (Commander by succession); p1 is chao; p2 is ian.
  for (const p of s.players) {
    p.room = "COMMAND_CENTER";
    p.ap = 10;
  }
  s.items.push({ id: "kit-1", type: HACKER_KIT_ITEM, at: { kind: "player", id: "p1" } });
  return s;
}

describe("Hacker kit item", () => {
  it("spawns in CORRIDOR_B at game start and matches Decided Rules properties", () => {
    expect(DEFAULT_CONFIG.startItems).toContainEqual({ type: HACKER_KIT_ITEM, room: "CORRIDOR_B" });
    const s = createGame(makeSeats(3), DEFAULT_CONFIG, 1);
    expect(s.items.filter((i) => i.type === HACKER_KIT_ITEM)).toMatchObject([{ at: { kind: "room", id: "CORRIDOR_B" } }]);

    const def = ITEM_TYPES[HACKER_KIT_ITEM];
    expect(def).toEqual({
      canBreak: true,
      canBeSabotaged: true,
      repairChance: 0.06,
      breaksInOverload: true,
    });
    expect(def?.dismantle).toBeUndefined();
  });
});

describe("Hack action", () => {
  it("pins the configured cost, base chance, and Computer Scientist factor", () => {
    expect(DEFAULT_CONFIG.hack).toEqual({ cost: { ap: 2 }, successChance: 0.25, computerFactor: 2 });
    expect(DEFAULT_CONFIG.failureMultiplier).toBe(1.25);
  });

  it("offers hack on working, enabled title-locked terminals only when carrying a working kit and lacking access", () => {
    const s = ship();
    // p1 (chao) does not hold commander or comms_officer, so both BRIDGE terminals are offered.
    const p1Hacks = offered(s, "p1").filter((a) => a.type === "hack");
    expect(p1Hacks).toEqual(
      expect.arrayContaining([
        { type: "hack", equipment: PILOT_ID },
        { type: "hack", equipment: COMMS_ID },
      ]),
    );
    // Non-title-locked terminals (e.g. ASTRO_MODULE) are not offered.
    expect(p1Hacks.some((a) => a.equipment.includes("astro"))).toBe(false);

    // p0 (jinsu) holds commander, so PILOT_MODULE is not offered to p0 even with a kit.
    s.items.push({ id: "kit-0", type: HACKER_KIT_ITEM, at: { kind: "player", id: "p0" } });
    const p0Hacks = offered(s, "p0").filter((a) => a.type === "hack");
    expect(p0Hacks.some((a) => a.equipment === PILOT_ID)).toBe(false);
    expect(p0Hacks.some((a) => a.equipment === COMMS_ID)).toBe(true);

    // Kit on the floor or broken offers nothing.
    const onFloor = clone(s);
    onFloor.items.find((i) => i.id === "kit-1")!.at = { kind: "room", id: "COMMAND_CENTER" };
    expect(offered(onFloor, "p1").some((a) => a.type === "hack")).toBe(false);
    expect(applyAction(onFloor, "p1", { type: "hack", equipment: PILOT_ID }).ok).toBe(false);

    const brokenKit = clone(s);
    brokenKit.items.find((i) => i.id === "kit-1")!.broken = true;
    expect(offered(brokenKit, "p1").some((a) => a.type === "hack")).toBe(false);
    expect(applyAction(brokenKit, "p1", { type: "hack", equipment: PILOT_ID }).ok).toBe(false);

    // Broken terminal cannot be hacked.
    const brokenTerm = clone(s);
    brokenTerm.equipment.COMMAND_CENTER!.find((e) => e.id === PILOT_ID)!.broken = true;
    expect(offered(brokenTerm, "p1").some((a) => a.type === "hack" && a.equipment === PILOT_ID)).toBe(false);
    expect(applyAction(brokenTerm, "p1", { type: "hack", equipment: PILOT_ID }).ok).toBe(false);
  });

  it("is not offered when player bypasses title via neron_access or freeHacking cheat", () => {
    const s = ship();
    const bios = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "NERON_BIOS_TERM"));
    expect(bios).toBeDefined();
    const [biosRoom, biosList] = bios!;
    const biosEq = biosList.find((e) => e.type === "NERON_BIOS_TERM")!;
    player(s, "p1").room = biosRoom;

    expect(offered(s, "p1")).toContainEqual({ type: "hack", equipment: biosEq.id });

    const withSkill = clone(s);
    player(withSkill, "p1").skills.push("neron_access");
    expect(offered(withSkill, "p1").some((a) => a.type === "hack" && a.equipment === biosEq.id)).toBe(false);

    const withCheat = clone(s);
    player(withCheat, "p1").cheats.push("freeHacking");
    expect(offered(withCheat, "p1").some((a) => a.type === "hack" && a.equipment === biosEq.id)).toBe(false);
  });

  it("works when the title is vacant", () => {
    const s = ship();
    s.titles.commander = null;
    expect(hasTitleAccess(s, player(s, "p1"), "commander")).toBe(false);
    expect(offered(s, "p1")).toContainEqual({ type: "hack", equipment: PILOT_ID });
  });

  it("costs 2 AP or 1 Computer point, and Computer Scientist doubles success chance (capped at 99%)", () => {
    const s = ship();
    const hackPilot: Action = { type: "hack", equipment: PILOT_ID };

    expect(costOf(s, "p1", hackPilot)).toEqual({ ap: 2, mp: 0 });
    expect(option(s, "p1", hackPilot)!.chance).toBeCloseTo(s.config.hack.successChance);

    const withComp = pickSkill(s, "p1", "computer");
    expect(costOf(withComp, "p1", hackPilot)).toEqual({ ap: 0, mp: 0, paidBy: "comp" });
    expect(option(withComp, "p1", hackPilot)!.chance).toBeCloseTo(s.config.hack.successChance * s.config.hack.computerFactor);

    // Failure streak multiplies by 1.25x per miss, capped at 0.99.
    withComp.failureStreaks.p1 = { hack: 1 };
    expect(option(withComp, "p1", hackPilot)!.chance).toBeCloseTo(
      s.config.hack.successChance * s.config.failureMultiplier * s.config.hack.computerFactor,
    );
    withComp.failureStreaks.p1 = { hack: 5 };
    expect(option(withComp, "p1", hackPilot)!.chance).toBe(0.99);
  });

  it("logs privately on failure and success, and grants access until leaving the room", () => {
    const hackPilot: Action = { type: "hack", equipment: PILOT_ID };
    // Force a failure first.
    const failState = ship({ ...config, hack: { ...config.hack, successChance: 0 } });
    const afterFail = mustApply(failState, "p1", hackPilot);
    expect(hasTitleAccess(afterFail, player(afterFail, "p1"), "commander")).toBe(false);
    expect(viewFor(afterFail, "p1").log.map((e) => e.key)).toContain("hackFailed");
    expect(viewFor(afterFail, "p0").log.map((e) => e.key)).not.toContain("hackFailed");

    // Now force a success.
    const winState = ship({ ...config, hack: { ...config.hack, successChance: 1 } });
    const afterWin = mustApply(winState, "p1", hackPilot);
    expect(hasTitleAccess(afterWin, player(afterWin, "p1"), "commander")).toBe(true);
    expect(player(afterWin, "p1").hackedEquipment).toEqual([PILOT_ID]);
    // Can now steer as commander!
    expect(offered(afterWin, "p1").some((a) => a.type === "turn_ship")).toBe(true);
    // Already hacked, so hack is no longer offered on PILOT_MODULE.
    expect(offered(afterWin, "p1").some((a) => a.type === "hack" && a.equipment === PILOT_ID)).toBe(false);
    // Private log only.
    expect(viewFor(afterWin, "p1").log.map((e) => e.key)).toContain("hacked");
    expect(viewFor(afterWin, "p0").log.map((e) => e.key)).not.toContain("hacked");

    // Re-accessing the terminal keeps hacked access.
    const afterAccess = mustApply(afterWin, "p1", { type: "access", equipment: PILOT_ID });
    expect(hasTitleAccess(afterAccess, player(afterAccess, "p1"), "commander")).toBe(true);

    // If the terminal breaks, hacked access does not apply while broken.
    const brokenAfter = clone(afterWin);
    brokenAfter.equipment.COMMAND_CENTER!.find((e) => e.id === PILOT_ID)!.broken = true;
    expect(hasTitleAccess(brokenAfter, player(brokenAfter, "p1"), "commander")).toBe(false);

    // Leaving the room clears hackedEquipment and revokes access.
    const adj = afterWin.config.rooms.COMMAND_CENTER![0]!;
    const afterLeave = mustApply(afterWin, "p1", { type: "move", to: adj });
    expect(player(afterLeave, "p1").hackedEquipment).toBeUndefined();
    expect(hasTitleAccess(afterLeave, player(afterLeave, "p1"), "commander")).toBe(false);
    const afterReturn = mustApply(afterLeave, "p1", { type: "move", to: "COMMAND_CENTER" });
    expect(hasTitleAccess(afterReturn, player(afterReturn, "p1"), "commander")).toBe(false);
  });

  it("clears hackedEquipment on terminal break, death, and mind transfer", () => {
    const s = ship({ ...config, hack: { ...config.hack, successChance: 1 } });
    const hackedBoth = mustApply(mustApply(s, "p1", { type: "hack", equipment: PILOT_ID }), "p1", { type: "hack", equipment: COMMS_ID });
    expect(player(hackedBoth, "p1").hackedEquipment).toEqual([PILOT_ID, COMMS_ID]);

    // Breaking one terminal strips only that terminal's id (and deletes the field when empty).
    const broken = clone(hackedBoth);
    breakEquipment(broken, broken.equipment.COMMAND_CENTER!.find((e) => e.id === PILOT_ID)!);
    expect(player(broken, "p1").hackedEquipment).toEqual([COMMS_ID]);
    // Repairing the terminal does not restore hacked access.
    broken.equipment.COMMAND_CENTER!.find((e) => e.id === PILOT_ID)!.broken = false;
    expect(hasTitleAccess(broken, player(broken, "p1"), "commander")).toBe(false);
    breakEquipment(broken, broken.equipment.COMMAND_CENTER!.find((e) => e.id === COMMS_ID)!);
    expect(player(broken, "p1").hackedEquipment).toBeUndefined();

    // Dying clears hackedEquipment.
    const dead = clone(hackedBoth);
    killPlayer(dead, player(dead, "p1"), "injury");
    expect(player(dead, "p1").hackedEquipment).toBeUndefined();

    // Mind transfer clears hackedEquipment on both bodies.
    const swapped = clone(hackedBoth);
    player(swapped, "p2").hackedEquipment = [COMMS_ID];
    swapMinds(swapped, player(swapped, "p1"), player(swapped, "p2"));
    expect(player(swapped, "p1").hackedEquipment).toBeUndefined();
    expect(player(swapped, "p2").hackedEquipment).toBeUndefined();
  });

  it("never leaks hackedEquipment to other players' views", () => {
    const s = ship({ ...config, hack: { ...config.hack, successChance: 1 } });
    const after = mustApply(s, "p1", { type: "hack", equipment: PILOT_ID });
    expect(viewFor(after, "p1").you.hackedEquipment).toEqual([PILOT_ID]);
    expect(JSON.stringify(viewFor(after, "p0"))).not.toContain("hackedEquipment");
    expect(JSON.stringify(viewFor(after, "p2"))).not.toContain("hackedEquipment");
  });
});
