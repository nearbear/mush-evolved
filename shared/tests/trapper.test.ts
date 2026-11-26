import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { doorId } from "../src/doors.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState, RoomId } from "../src/types.ts";
import { clone, makeSeats, mustApply, noCharacterModifiers, offered, option, player, testConfig } from "./support.ts";
import { MYCO_ALARM_ITEM } from "../src/itemIds.ts";

const ROOM: RoomId = "LABORATORY";

/**
 * p0 Mush with Trapper and 3 spores, p1 Mush, p2 and p3 human; everyone in LABORATORY.
 * Character modifiers off so Chun's built-in Immunity doesn't affect human tests unless explicitly enabled.
 */
function ship(overrides: Parameters<typeof testConfig>[0] = {}): GameState {
  const state = createGame(makeSeats(4), noCharacterModifiers(testConfig({ mushCount: 2, ...overrides })), 42, { p0: "mush", p1: "mush" });
  const p0 = player(state, "p0");
  p0.mushSkills = ["trapper"];
  p0.spores = 3;
  for (const p of state.players) p.room = ROOM;
  return state;
}

const trapHere = (state: GameState, by = "p0") => mustApply(state, by, { type: "trap_room" });

describe("Trapper (#473)", () => {
  it("pins confirmed config numbers", () => {
    expect(DEFAULT_CONFIG.trapper.cost.ap).toBe(1);
  });

  it("costs 1 AP and 1 spore, traps the room, and has no cooldown", () => {
    const before = ship();
    const after = trapHere(before);
    expect(player(after, "p0").ap).toBe(player(before, "p0").ap - before.config.trapper.cost.ap);
    expect(player(after, "p0").spores).toBe(2);
    expect(after.trappedRooms).toEqual([ROOM]);

    // No cooldown: can move to another room and trap it immediately in the same cycle.
    const nextRoom = after.config.rooms[ROOM]![0]!;
    const moved = mustApply(after, "p0", { type: "move", to: nextRoom });
    const both = trapHere(moved);
    expect(both.trappedRooms).toEqual([ROOM, nextRoom]);
    expect(player(both, "p0").spores).toBe(1);
  });

  it("validates role, skill, spores, pre-selection, off-ship, and already-trapped rooms", () => {
    // Non-Mush
    expect(applyAction(ship(), "p2", { type: "trap_room" }).ok).toBe(false);
    expect(offered(ship(), "p2").some((a) => a.type === "trap_room")).toBe(false);

    // No skill
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = [];
    const beforeNoSkill = clone(noSkill);
    expect(applyAction(noSkill, "p0", { type: "trap_room" }).ok).toBe(false);
    expect(noSkill).toEqual(beforeNoSkill);
    expect(offered(noSkill, "p0").some((a) => a.type === "trap_room")).toBe(false);

    // No spores
    const noSpores = ship();
    player(noSpores, "p0").spores = 0;
    expect(applyAction(noSpores, "p0", { type: "trap_room" }).ok).toBe(false);
    expect(offered(noSpores, "p0").some((a) => a.type === "trap_room")).toBe(false);

    // Pre-selection
    const presel = ship();
    presel.preselection = true;
    expect(applyAction(presel, "p0", { type: "trap_room" }).ok).toBe(false);
    expect(offered(presel, "p0").some((a) => a.type === "trap_room")).toBe(false);

    // Off-ship (patrol craft, Icarus in flight, lost place)
    for (const offRoom of ["PATROL_SHIP_A_0", "ICARUS_CRAFT", "LOST:p0"]) {
      const off = ship();
      player(off, "p0").room = offRoom;
      expect(applyAction(off, "p0", { type: "trap_room" }).ok).toBe(false);
      expect(offered(off, "p0").some((a) => a.type === "trap_room")).toBe(false);
    }

    // Already trapped
    const trapped = trapHere(ship());
    expect(applyAction(trapped, "p0", { type: "trap_room" }).ok).toBe(false);
    expect(option(trapped, "p0", { type: "trap_room" })).toBeUndefined();
  });

  it("rings a working Myco-alarm on the room floor", () => {
    const state = ship();
    state.items.push({ id: "alarm-1", type: MYCO_ALARM_ITEM, at: { kind: "room", id: ROOM } });
    const after = trapHere(state);
    expect(viewFor(after, "p2").log.some((e) => e.key === "mycoAlarmRang")).toBe(true);
  });

  it("is covert: hidden from roommates unless revealed by a camera or Observant", () => {
    // Plain room: only actor sees roomTrapped
    const plain = trapHere(ship());
    expect(viewFor(plain, "p0").log.some((e) => e.key === "roomTrapped")).toBe(true);
    expect(viewFor(plain, "p2").log.some((e) => e.key === "roomTrapped")).toBe(false);

    // Camera in room: roommates see it
    const withCam = ship();
    (withCam.equipment[ROOM] ??= []).push({ id: "cam-1", type: "CAMERA" });
    const afterCam = trapHere(withCam);
    const camLine = viewFor(afterCam, "p2").log.find((e) => e.key === "roomTrapped");
    expect(camLine).toBeDefined();
    expect(camLine?.leaked).toBe(true);

    // Observant in room (100% reveal chance): roommates see it + observantNoticed
    const withObs = ship({ observant: { revealChance: 1 } });
    player(withObs, "p2").skills.push("observant");
    const afterObs = trapHere(withObs);
    expect(viewFor(afterObs, "p2").log.some((e) => e.key === "roomTrapped")).toBe(true);
    expect(viewFor(afterObs, "p2").log.some((e) => e.key === "observantNoticed")).toBe(true);
  });

  describe("trigger matrix", () => {
    it("triggers on floor/shelf item actions (take, consume, examine, open_capsule) and not on carried items", () => {
      // Take from floor -> triggers
      const sTake = ship();
      sTake.items.push({ id: "i-wrench", type: "wrench", at: { kind: "room", id: ROOM } });
      const afterTake = mustApply(trapHere(sTake), "p2", { type: "take", item: "i-wrench" });
      expect(afterTake.trappedRooms).toEqual([]);
      expect(afterTake.contamination.p2).toBe(1);

      // Floor consume -> triggers
      const sFloorEat = ship();
      sFloorEat.items.push({ id: "i-ban", type: "fruit_banana", at: { kind: "room", id: ROOM } });
      const afterFloorEat = mustApply(trapHere(sFloorEat), "p2", { type: "consume", item: "i-ban" });
      expect(afterFloorEat.trappedRooms).toEqual([]);
      expect(afterFloorEat.contamination.p2).toBe(1);

      // Carried consume -> does NOT trigger
      const sInvEat = ship();
      sInvEat.items.push({ id: "i-ban", type: "fruit_banana", at: { kind: "player", id: "p2" } });
      const afterInvEat = mustApply(trapHere(sInvEat), "p2", { type: "consume", item: "i-ban" });
      expect(afterInvEat.trappedRooms).toEqual([ROOM]);
      expect(afterInvEat.contamination.p2).toBeUndefined();

      // Floor examine -> triggers
      const sFloorEx = ship();
      sFloorEx.items.push({ id: "i-w", type: "wrench", at: { kind: "room", id: ROOM } });
      const afterFloorEx = mustApply(trapHere(sFloorEx), "p2", { type: "examine", target: { kind: "item", id: "i-w" } });
      expect(afterFloorEx.trappedRooms).toEqual([]);
      expect(afterFloorEx.contamination.p2).toBe(1);

      // Carried examine -> does NOT trigger
      const sInvEx = ship();
      sInvEx.items.push({ id: "i-w", type: "wrench", at: { kind: "player", id: "p2" } });
      const afterInvEx = mustApply(trapHere(sInvEx), "p2", { type: "examine", target: { kind: "item", id: "i-w" } });
      expect(afterInvEx.trappedRooms).toEqual([ROOM]);
      expect(afterInvEx.contamination.p2).toBeUndefined();

      // Floor open_capsule -> triggers; carried open_capsule -> does NOT trigger
      const sFloorCap = ship();
      sFloorCap.items.push({ id: "i-cap", type: "space_capsule", at: { kind: "room", id: ROOM } });
      const afterFloorCap = mustApply(trapHere(sFloorCap), "p2", { type: "open_capsule", item: "i-cap" });
      expect(afterFloorCap.trappedRooms).toEqual([]);
      expect(afterFloorCap.contamination.p2).toBe(1);

      const sInvCap = ship();
      sInvCap.items.push({ id: "i-cap", type: "space_capsule", at: { kind: "player", id: "p2" } });
      const afterInvCap = mustApply(trapHere(sInvCap), "p2", { type: "open_capsule", item: "i-cap" });
      expect(afterInvCap.trappedRooms).toEqual([ROOM]);
      expect(afterInvCap.contamination.p2).toBeUndefined();
    });

    it("triggers on room equipment actions, including failed ones", () => {
      const state = ship({ repair: { chance: { RESEARCH_LAB: 0 } } });
      const lab = state.equipment[ROOM]!.find((e) => e.type === "RESEARCH_LAB")!;
      lab.broken = true;
      const after = mustApply(trapHere(state), "p2", { type: "repair", equipment: lab.id });
      // Repair failed (still broken), yet the trap still triggered.
      expect(after.equipment[ROOM]!.find((e) => e.id === lab.id)?.broken).toBe(true);
      expect(after.trappedRooms).toEqual([]);
      expect(after.contamination.p2).toBe(1);
    });

    it("triggers on door actions in the actor's room, but never a trap in the adjacent room", () => {
      const adj = ship().config.rooms[ROOM]![0]!;
      const sharedDoor = doorId(ROOM, adj);

      // Trap in actor's own room -> triggers
      const own = ship({ repair: { chance: { DOOR: 1 } } });
      own.doors[sharedDoor] = { broken: true };
      const afterOwn = mustApply(trapHere(own), "p2", { type: "repair", door: sharedDoor });
      expect(afterOwn.trappedRooms).toEqual([]);
      expect(afterOwn.contamination.p2).toBe(1);

      // Trap in adjacent room only -> does NOT trigger when p2 repairs shared door from ROOM
      const other = ship({ repair: { chance: { DOOR: 1 } } });
      other.doors[sharedDoor] = { broken: true };
      other.trappedRooms.push(adj);
      const afterOther = mustApply(other, "p2", { type: "repair", door: sharedDoor });
      expect(afterOther.trappedRooms).toEqual([adj]);
      expect(afterOther.contamination.p2).toBeUndefined();
    });

    it("triggers on voluntary get_up, but not on involuntary standing up for another action", () => {
      const base = ship();
      const [dorm, bed] = Object.entries(base.equipment)
        .map(([r, eqs]) => [r, eqs.find((e) => e.type === "BED")] as const)
        .find(([, b]) => b !== undefined)!;
      const setupDorm = () => {
        const s = ship();
        for (const p of s.players) p.room = dorm;
        const lying = mustApply(s, "p2", { type: "lie_down", equipment: bed!.id });
        return trapHere(lying);
      };

      // Voluntary get_up -> triggers
      const stoodUp = mustApply(setupDorm(), "p2", { type: "get_up" });
      expect(stoodUp.trappedRooms).toEqual([]);
      expect(stoodUp.contamination.p2).toBe(1);

      // Involuntary stand-up (moving while lying down) -> does NOT trigger
      const moved = mustApply(setupDorm(), "p2", { type: "move", to: base.config.rooms[dorm]![0]! });
      expect(moved.trappedRooms).toEqual([dorm]);
      expect(moved.contamination.p2).toBeUndefined();
    });

    it("triggers on search, report_fire, report_equipment, and report_door", () => {
      // search
      const afterSearch = mustApply(trapHere(ship()), "p2", { type: "search" });
      expect(afterSearch.trappedRooms).toEqual([]);
      expect(afterSearch.contamination.p2).toBe(1);

      // report_fire
      const sFire = ship();
      sFire.fires.push(ROOM);
      const afterFire = mustApply(trapHere(sFire), "p2", { type: "report_fire" });
      expect(afterFire.trappedRooms).toEqual([]);
      expect(afterFire.contamination.p2).toBe(1);

      // report_equipment
      const sEq = ship();
      const lab = sEq.equipment[ROOM]!.find((e) => e.type === "RESEARCH_LAB")!;
      lab.broken = true;
      const afterEq = mustApply(trapHere(sEq), "p2", { type: "report_equipment", equipment: lab.id });
      expect(afterEq.trappedRooms).toEqual([]);
      expect(afterEq.contamination.p2).toBe(1);

      // report_door
      const sDoor = ship();
      const adj = sDoor.config.rooms[ROOM]![0]!;
      const d = doorId(ROOM, adj);
      sDoor.doors[d] = { broken: true };
      const afterDoor = mustApply(trapHere(sDoor), "p2", { type: "report_door", door: d });
      expect(afterDoor.trappedRooms).toEqual([]);
      expect(afterDoor.contamination.p2).toBe(1);
    });

    it("does not trigger on move, drop, actions on people, or self-only actions", () => {
      const s = ship();
      s.items.push({ id: "i-held", type: "wrench", at: { kind: "player", id: "p2" } });
      const trapped = trapHere(s);

      // drop
      const afterDrop = mustApply(trapped, "p2", { type: "drop", item: "i-held" });
      expect(afterDrop.trappedRooms).toEqual([ROOM]);
      expect(afterDrop.contamination.p2).toBeUndefined();

      // action on a person (bond)
      const afterBond = mustApply(trapped, "p2", { type: "bond", target: "p3" });
      expect(afterBond.trappedRooms).toEqual([ROOM]);
      expect(afterBond.contamination.p2).toBeUndefined();

      // self-only action (guard)
      const afterGuard = mustApply(trapped, "p2", { type: "guard" });
      expect(afterGuard.trappedRooms).toEqual([ROOM]);
      expect(afterGuard.contamination.p2).toBeUndefined();

      // move
      const afterMove = mustApply(trapped, "p2", { type: "move", to: trapped.config.rooms[ROOM]![0]! });
      expect(afterMove.trappedRooms).toEqual([ROOM]);
      expect(afterMove.contamination.p2).toBeUndefined();
    });
  });

  describe("trigger effects and edge cases", () => {
    it("is silent to the human victim and posts to the Mush channel, converting at capacity", () => {
      const trapped = trapHere(ship());
      const logBefore = viewFor(trapped, "p2").log.length;
      const after = mustApply(trapped, "p2", { type: "search" });
      // Search logs searchedNothing, nothing about a trap or spore.
      const newLogs = viewFor(after, "p2").log.slice(logBefore);
      expect(newLogs.every((e) => e.key === "searchedNothing")).toBe(true);
      expect(after.contamination.p2).toBe(1);
      expect(after.chat.some((m) => m.channel === "mush" && m.system?.key === "mushContaminated")).toBe(true);

      // At capacity - 1, triggering converts the human to Mush.
      const near = trapHere(ship());
      near.contamination.p2 = near.config.infection.capacity - 1;
      const converted = mustApply(near, "p2", { type: "search" });
      expect(player(converted, "p2").role).toBe("mush");
      expect(converted.chat.some((m) => m.channel === "mush" && m.system?.key === "mushConverted")).toBe(true);
    });

    it("is consumed and wasted silently when triggered by a Mush (including the trapper), an Immune human, or Strong Skin", () => {
      // Trapper triggers their own trap -> wasted, no private log
      const selfTrapped = trapHere(ship());
      const logBeforeSelf = viewFor(selfTrapped, "p0").log.length;
      const afterSelf = mustApply(selfTrapped, "p0", { type: "search" });
      expect(afterSelf.trappedRooms).toEqual([]);
      expect(afterSelf.contamination.p0).toBeUndefined();
      expect(viewFor(afterSelf, "p0").log.slice(logBeforeSelf).every((e) => e.key === "searchedNothing")).toBe(true);

      // Immune human triggers trap -> wasted, no contamination
      const sImmune = ship();
      player(sImmune, "p2").immuneUntil = sImmune.cycle + 5;
      const afterImmune = mustApply(trapHere(sImmune), "p2", { type: "search" });
      expect(afterImmune.trappedRooms).toEqual([]);
      expect(afterImmune.contamination.p2).toBeUndefined();

      // Strong Skin (100% resist) -> trap still consumed, no contamination
      const sStrong = ship({ strongSkin: { resistOdds: 1 } });
      player(sStrong, "p2").skills.push("strong_skin");
      const afterStrong = mustApply(trapHere(sStrong), "p2", { type: "search" });
      expect(afterStrong.trappedRooms).toEqual([]);
      expect(afterStrong.contamination.p2).toBeUndefined();
    });
  });

  describe("viewFor hidden-information checks", () => {
    it("shows roomTrapped only to a living, non-blind Mush in that room", () => {
      const trapped = trapHere(ship());
      expect(viewFor(trapped, "p0").roomTrapped).toBe(true);
      expect(viewFor(trapped, "p1").roomTrapped).toBe(true);
      expect(viewFor(trapped, "p2").roomTrapped).toBe(false);
      expect(viewFor(trapped, "p3").roomTrapped).toBe(false);

      // Living Mush in another room does not see the trap
      const elsewhere = clone(trapped);
      player(elsewhere, "p1").room = trapped.config.rooms[ROOM]![0]!;
      expect(viewFor(elsewhere, "p1").roomTrapped).toBe(false);
      expect(viewFor(elsewhere, "p0").roomTrapped).toBe(true);

      // Dead Mush and dead human in the room both receive false
      const withDead = clone(trapped);
      player(withDead, "p1").alive = false;
      player(withDead, "p3").alive = false;
      expect(viewFor(withDead, "p1").roomTrapped).toBe(false);
      expect(viewFor(withDead, "p3").roomTrapped).toBe(false);

      // Blind (comatose) living Mush in the room receives false
      const withComa = clone(trapped);
      player(withComa, "p0").comaUntil = withComa.cycle + 2;
      expect(viewFor(withComa, "p0").roomTrapped).toBe(false);

      // Disappears from living Mush's view once triggered
      const triggered = mustApply(trapped, "p2", { type: "search" });
      expect(viewFor(triggered, "p0").roomTrapped).toBe(false);
      expect(viewFor(triggered, "p1").roomTrapped).toBe(false);
    });
  });
});
