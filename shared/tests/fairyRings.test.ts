import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { cure } from "../src/infection.ts";
import { swapMinds } from "../src/mind.ts";
import { MYCO_ALARM_ITEM } from "../src/mycoalarm.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState, RoomId } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, nextDay, noCharacterModifiers, offered, option, player, testConfig } from "./support.ts";

const ROOM: RoomId = "LABORATORY";

/** p0 Mush with Mycelium Spirit and 2 spores, p1 Mush, p2 and p3 human; everyone in LABORATORY. */
function ship(): GameState {
  const state = createGame(makeSeats(4), noCharacterModifiers(testConfig({ mushCount: 2 })), 42, { p0: "mush", p1: "mush" });
  const p0 = player(state, "p0");
  p0.mushSkills = ["mycellium_spirit"];
  p0.spores = 2;
  for (const p of state.players) p.room = ROOM;
  return state;
}

const grow = (state: GameState, by = "p0") => mustApply(state, by, { type: "grow_fairy_ring" });
const tap = (state: GameState, by = "p1") => mustApply(state, by, { type: "tap_fairy_ring" });
const refused = (state: GameState, by: string, type: "grow_fairy_ring" | "tap_fairy_ring") => applyAction(state, by, { type }).ok === false;

describe("Mycelium Spirit: Fairy Rings", () => {
  it("pins confirmed config numbers", () => {
    const { grow, tap } = DEFAULT_CONFIG.myceliumSpirit;
    expect([grow.ap, grow.spores, tap.ap, tap.spores]).toEqual([1, 2, 1, 1]);
  });

  it("grows a ring in your room for its AP and spores, once per mind", () => {
    const before = ship();
    const after = grow(before);
    const p0 = player(after, "p0");
    expect(p0.ap).toBe(player(before, "p0").ap - before.config.myceliumSpirit.grow.ap);
    expect(p0.spores).toBe(2 - before.config.myceliumSpirit.grow.spores);
    expect(after.fairyRings).toEqual([{ room: ROOM, owner: p0.mind }]);

    // Once per mind, even in another room with spores again.
    const again = clone(after);
    player(again, "p0").spores = 2;
    player(again, "p0").room = "BRIDGE";
    expect(refused(again, "p0", "grow_fairy_ring")).toBe(true);
    expect(option(again, "p0", { type: "grow_fairy_ring" })).toBeUndefined();
  });

  it("refuses humans, Mush without the skill, too few spores, off the ship, and a room that has a ring", () => {
    const s = ship();
    expect(refused(s, "p2", "grow_fairy_ring")).toBe(true);
    expect(offered(s, "p2").some((a) => a.type === "grow_fairy_ring")).toBe(false);
    expect(refused(s, "p1", "grow_fairy_ring")).toBe(true);

    const poor = ship();
    player(poor, "p0").spores = 1;
    expect(refused(poor, "p0", "grow_fairy_ring")).toBe(true);

    for (const offRoom of ["PATROL_SHIP_A_0", "ICARUS_CRAFT", "LOST:p0"]) {
      const off = ship();
      player(off, "p0").room = offRoom;
      expect(refused(off, "p0", "grow_fairy_ring")).toBe(true);
    }

    const taken = ship();
    taken.fairyRings.push({ room: ROOM, owner: player(taken, "p1").mind });
    expect(refused(taken, "p0", "grow_fairy_ring")).toBe(true);
  });

  it("lets one Mush a day draw a spore for 1 AP: no dirt, outside the daily cap", () => {
    const s = grow(ship());
    s.sporesToday = s.config.spores.perDay; // the faction's cap is spent
    const after = tap(s, "p1");
    const p1 = player(after, "p1");
    expect(p1.spores).toBe(player(s, "p1").spores + 1);
    expect(p1.ap).toBe(player(s, "p1").ap - s.config.myceliumSpirit.tap.ap);
    expect(p1.statuses).not.toContain("dirty");
    expect(after.sporesToday).toBe(s.sporesToday);

    // Once per ring per day, by anyone (the creator included).
    expect(refused(after, "p1", "tap_fairy_ring")).toBe(true);
    expect(refused(after, "p0", "tap_fairy_ring")).toBe(true);
    // A new day refills it.
    expect(tap(nextDay(after), "p0").fairyRings[0]!.tapped).toBe(true);
  });

  it("respects the holding limit and refuses humans and rooms without a ring", () => {
    const s = grow(ship());
    player(s, "p1").spores = s.config.spores.max;
    expect(refused(s, "p1", "tap_fairy_ring")).toBe(true);
    expect(refused(s, "p2", "tap_fairy_ring")).toBe(true);
    expect(option(s, "p2", { type: "tap_fairy_ring" })).toBeUndefined();
    const elsewhere = clone(s);
    player(elsewhere, "p0").room = "BRIDGE";
    expect(refused(elsewhere, "p0", "tap_fairy_ring")).toBe(true);
  });

  it("costs Constipaspore's extra AP like extraction, and Fertile's free pull doesn't apply", () => {
    const s = grow(ship());
    expect(costOf(s, "p1", { type: "tap_fairy_ring" })?.ap).toBe(s.config.myceliumSpirit.tap.ap);
    s.research.CONSTIPASPORE_SERUM = RESEARCH_COMPLETE;
    expect(costOf(s, "p1", { type: "tap_fairy_ring" })?.ap).toBe(s.config.myceliumSpirit.tap.ap + s.config.spores.constipasporeExtraAp);
  });

  it("is secret and rings Myco-alarms on growing and on drawing", () => {
    expect(ACTIONS.grow_fairy_ring.tags).toContain("spore");
    expect(ACTIONS.tap_fairy_ring.tags).toContain("spore");
    const s = ship();
    s.items.push({ id: "alarm-1", type: MYCO_ALARM_ITEM, at: { kind: "room", id: ROOM } });
    const grown = grow(s);
    const rings = (st: GameState) => st.log.filter((e) => e.key === "mycoAlarmRang").length;
    expect(rings(grown)).toBe(1);
    expect(rings(tap(grown))).toBe(2);
    // A roommate witnesses the secret line.
    expect(viewFor(grown, "p2").log.some((e) => e.key === "fairyRingGrown")).toBe(true);

    // Alone, nobody else sees it.
    const alone = ship();
    for (const p of alone.players) if (p.id !== "p0") p.room = "BRIDGE";
    const grownAlone = grow(alone);
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(grownAlone, id).log.some((e) => e.key === "fairyRingGrown")).toBe(false);
  });

  it("shows roomFairyRing only to a living, non-blind Mush in that room", () => {
    const s = grow(ship());
    expect(viewFor(s, "p0").roomFairyRing).toBe(true);
    expect(viewFor(s, "p1").roomFairyRing).toBe(true);
    expect(viewFor(s, "p2").roomFairyRing).toBe(false);
    const elsewhere = clone(s);
    player(elsewhere, "p1").room = "BRIDGE";
    expect(viewFor(elsewhere, "p1").roomFairyRing).toBe(false);
    const dead = clone(s);
    killPlayer(dead, player(dead, "p1"), "other");
    expect(viewFor(dead, "p1").roomFairyRing).toBe(false);
    const coma = clone(s);
    player(coma, "p1").comaUntil = coma.cycle + 2;
    expect(viewFor(coma, "p1").roomFairyRing).toBe(false);
  });

  it("vanishes when its creator dies, is cured, or loses the skill; survives a Transfer", () => {
    const s = grow(ship());
    const dead = clone(s);
    killPlayer(dead, player(dead, "p0"), "other");
    expect(dead.fairyRings).toEqual([]);

    const cured = clone(s);
    cure(cured, player(cured, "p0"));
    expect(cured.fairyRings).toEqual([]);

    const reset = clone(s);
    player(reset, "p0").mushSkills.push("epigenetics");
    expect(mustApply(reset, "p0", { type: "reset_skills" }).fairyRings).toEqual([]);

    // Another Mush dying leaves it.
    const other = clone(s);
    killPlayer(other, player(other, "p1"), "other");
    expect(other.fairyRings).toHaveLength(1);

    // Transfer: the mind (and skill) moves to p2's body; the ring stays, then goes with that body's death.
    const moved = clone(s);
    swapMinds(moved, player(moved, "p0"), player(moved, "p2"));
    killPlayer(moved, player(moved, "p0"), "other"); // the old body, now human
    expect(moved.fairyRings).toHaveLength(1);
    killPlayer(moved, player(moved, "p2"), "other");
    expect(moved.fairyRings).toEqual([]);
  });

  it("leaves state unchanged when refused", () => {
    const s = ship();
    player(s, "p0").spores = 0;
    const before = JSON.stringify(s);
    expect(refused(s, "p0", "grow_fairy_ring")).toBe(true);
    expect(refused(s, "p0", "tap_fairy_ring")).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });
});
