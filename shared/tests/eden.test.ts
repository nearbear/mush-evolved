import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { SUPER_CALC_EQUIPMENT } from "../src/equipment.ts";
import { PILGRED_COMPLETE } from "../src/pilgred.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, noCharacterModifiers, offered, option, player, testConfig, type DeepPartial } from "./support.ts";

const NEXUS = "NEXUS_ROOM";
const CALC = `${NEXUS}:${SUPER_CALC_EQUIPMENT}`;
const COMMAND = "COMMAND_CENTER:PILOT_MODULE";
const compute: Action = { type: "compute_eden", equipment: CALC };
const travel: Action = { type: "travel_to_eden", equipment: COMMAND };

/** Three players in the Nexus with the Super Calculator built and `fragments` star map fragments on the floor. */
function nexus(fragments = 3, overrides: DeepPartial<GameConfig> = {}, seed = 1): GameState {
  const s = createGame(makeSeats(3, "others"), noCharacterModifiers(testConfig(overrides)), seed);
  for (const p of s.players) p.room = NEXUS;
  (s.equipment[NEXUS] ??= []).push({ id: CALC, type: SUPER_CALC_EQUIPMENT });
  for (let i = 0; i < fragments; i++) s.items.push({ id: `item-${s.nextItemId++}`, type: "super_map", at: { kind: "room", id: NEXUS } });
  return s;
}

const always = { eden: { compute: { successChance: 1 } } };
const never = { eden: { compute: { successChance: 0 } } };

describe("Compute Eden", () => {
  it("uses eMush's numbers", () => {
    const { compute: c } = DEFAULT_CONFIG.eden;
    expect([c.cost.ap, c.successChance, c.fragments, c.fragmentItem]).toEqual([2, 0.33, 3, "super_map"]);
    expect(DEFAULT_CONFIG.pilgred.edenCost.ap).toBe(2);
  });

  it("starts uncomputed, and is offered only at the Super Calculator", () => {
    const s = nexus();
    expect(s.eden).toEqual({ computed: false });
    expect(offered(s, "p0")).toContainEqual(compute);
    expect(option(s, "p0", compute)).toMatchObject({ cost: { ap: s.config.eden.compute.cost.ap }, chance: s.config.eden.compute.successChance, lacks: [] });
    const unbuilt = nexus();
    unbuilt.equipment[NEXUS] = unbuilt.equipment[NEXUS]!.filter((e) => e.id !== CALC);
    expect(option(unbuilt, "p0", { type: "compute_eden" })).toBeUndefined();
    const away = nexus();
    player(away, "p0").room = "REFECTORY";
    expect(option(away, "p0", { type: "compute_eden" })).toBeUndefined();
    expect(applyAction(away, "p0", compute).ok).toBe(false);
  });

  it("succeeds: marks Eden computed, keeps the fragments, logs in the room and is offered no more", () => {
    const s = nexus(3, always);
    const ap = player(s, "p0").ap;
    const r = must(applyAction(s, "p0", compute));
    expect(r.eden.computed).toBe(true);
    expect(player(r, "p0").ap).toBe(ap - s.config.eden.compute.cost.ap);
    expect(r.items.filter((i) => i.type === "super_map")).toHaveLength(3);
    expect(r.log.at(-1)).toMatchObject({ key: "edenComputed", room: NEXUS, params: { name: player(s, "p0").character } });
    expect(viewFor(r, "p1").log.some((e) => e.key === "edenComputed")).toBe(true);
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(r, id).edenComputed).toBe(true);
    expect(option(r, "p0", { type: "compute_eden" })).toBeUndefined();
    expect(applyAction(r, "p0", compute).ok).toBe(false);
  });

  it("the success line stays in the Nexus's history", () => {
    const s = nexus(3, always);
    player(s, "p2").room = "REFECTORY";
    const r = must(applyAction(s, "p0", compute));
    expect(viewFor(r, "p2").log.some((e) => e.key === "edenComputed")).toBe(false);
  });

  it("fails privately, spends the cost and raises the next try's odds (failure streak)", () => {
    const s = nexus(3, never);
    const ap = player(s, "p0").ap;
    const r = must(applyAction(s, "p0", compute));
    expect(r.eden.computed).toBe(false);
    expect(player(r, "p0").ap).toBe(ap - s.config.eden.compute.cost.ap);
    expect(r.log.at(-1)).toMatchObject({ key: "edenComputeFailed", visibleTo: ["p0"] });
    expect(viewFor(r, "p1").log.some((e) => e.key === "edenComputeFailed")).toBe(false);
    // The usual failure bonus (owner, 2026-11-22), shown on a non-zero base.
    const base = nexus(3);
    base.failureStreaks = { p0: { compute_eden: 1 } };
    expect(option(base, "p0", compute)!.chance).toBeCloseTo(base.config.eden.compute.successChance * base.config.failureMultiplier);
  });

  it("rolls 33% on the seeded RNG: the same seed gives the same outcome, and about a third succeed", () => {
    let wins = 0;
    const seeds = 300;
    for (let seed = 1; seed <= seeds; seed++) {
      const once = must(applyAction(nexus(3, {}, seed), "p0", compute)).eden.computed;
      expect(must(applyAction(nexus(3, {}, seed), "p0", compute)).eden.computed).toBe(once);
      if (once) wins++;
    }
    expect(wins / seeds).toBeGreaterThan(0.25);
    expect(wins / seeds).toBeLessThan(0.42);
  });

  it("is disabled with fewer than 3 fragments on the floor; carried and hidden ones don't count", () => {
    const few = nexus(2);
    expect(option(few, "p0", compute)!.lacks).toEqual(["fragments"]);
    expect(applyAction(few, "p0", compute).ok).toBe(false);
    const carried = nexus(3);
    carried.items.find((i) => i.type === "super_map")!.at = { kind: "player", id: "p0" };
    expect(option(carried, "p0", compute)!.lacks).toEqual(["fragments"]);
    const hidden = nexus(3);
    hidden.items.find((i) => i.type === "super_map")!.hiddenBy = "p0";
    expect(option(hidden, "p0", compute)!.lacks).toEqual(["fragments"]);
    const before = JSON.stringify(few);
    applyAction(few, "p0", compute);
    expect(JSON.stringify(few)).toBe(before);
  });

  it("is disabled while dirty, and refused on a broken calculator", () => {
    const dirty = nexus();
    addStatus(player(dirty, "p0"), "dirty");
    expect(option(dirty, "p0", compute)!.lacks).toEqual(["clean"]);
    expect(applyAction(dirty, "p0", compute).ok).toBe(false);
    const broken = nexus();
    broken.equipment[NEXUS]!.find((e) => e.id === CALC)!.broken = true;
    expect(applyAction(broken, "p0", compute).ok).toBe(false);
  });

  it("a Computer point pays instead of AP", () => {
    const s = nexus(3, never);
    player(s, "p0").resources.comp = 1;
    const ap = player(s, "p0").ap;
    expect(option(s, "p0", compute)!.cost).toMatchObject({ ap: 0, paidBy: "comp" });
    const r = must(applyAction(s, "p0", compute));
    expect([player(r, "p0").ap, player(r, "p0").resources.comp]).toEqual([ap, 0]);
  });
});

describe("Travel to Eden", () => {
  /** Everyone on the bridge, PILGRED repaired, Eden computed, p0 Commander, p2 a living Mush. */
  function ready(): GameState {
    const s = createGame(makeSeats(3, "others"), testConfig(), 1);
    for (const p of s.players) {
      p.room = "COMMAND_CENTER";
      p.role = "human";
    }
    player(s, "p2").role = "mush";
    s.pilgred.progress = PILGRED_COMPLETE;
    s.eden.computed = true;
    s.titles.commander = "p0";
    return s;
  }

  it("is a human win with a Mush alive, with a ship-wide line, and costs AP", () => {
    const s = ready();
    expect(offered(s, "p0")).toContainEqual(travel);
    const ap = player(s, "p0").ap;
    const r = must(applyAction(s, "p0", travel));
    expect([r.phase, r.winner, r.ending]).toEqual(["ended", "humans", "eden"]);
    expect(player(r, "p0").ap).toBe(ap - s.config.pilgred.edenCost.ap);
    expect(r.log.at(-1)).toMatchObject({ key: "returnedToEden", visibleTo: "all", params: { name: player(s, "p0").character } });
    expect(r.log.at(-1)).not.toHaveProperty("room");
  });

  it("is refused before Eden is computed, before PILGRED is repaired, and without the Commander's access", () => {
    const uncomputed = ready();
    uncomputed.eden.computed = false;
    expect(option(uncomputed, "p0", { type: "travel_to_eden" })).toBeUndefined();
    expect(applyAction(uncomputed, "p0", travel).ok).toBe(false);
    const broken = ready();
    broken.pilgred.progress = PILGRED_COMPLETE - 1;
    expect(applyAction(broken, "p0", travel).ok).toBe(false);
    expect(option(ready(), "p1", { type: "travel_to_eden" })).toBeUndefined();
    expect(applyAction(ready(), "p1", travel).ok).toBe(false);
    const before = JSON.stringify(uncomputed);
    applyAction(uncomputed, "p0", travel);
    expect(JSON.stringify(uncomputed)).toBe(before);
  });

  it("is open to someone who hacked the Command terminal, even a Mush, and humans still win", () => {
    const s = ready();
    player(s, "p2").hackedEquipment = [COMMAND];
    expect(offered(s, "p2")).toContainEqual(travel);
    expect(must(applyAction(s, "p2", travel)).winner).toBe("humans");
  });
});
