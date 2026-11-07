import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { forceDismantleOdds, makeSeats, must, mustApply, nextCycle, offered, player } from "./support.ts";

const seats = makeSeats(3);
forceDismantleOdds(1); // items and equipment have their own odds; these tests need the dismantle to succeed
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], maxAp: 99, startAp: 10, dismantle: { ...DEFAULT_CONFIG.dismantle, successChance: 1 } };
const room = (id: string) => ({ kind: "room" as const, id });
const sofas = (s: GameState, r = "CORRIDOR_A") => (s.equipment[r] ?? []).filter((e) => e.type === "SOFA");
const dismantle = (equipment: string): Action => ({ type: "dismantle", equipment });

/** p0 and p1 in the front corridor, p2 in the sick bay; `n` sofa blueprints and their ingredients on the corridor floor. */
function ship(n = 1): GameState {
  const s = createGame(seats, config, 3);
  s.config = structuredClone(s.config); // createGame shares the config with DEFAULT_CONFIG
  player(s, "p0").room = player(s, "p1").room = "CORRIDOR_A";
  player(s, "p2").room = "SICK_BAY";
  for (let i = 0; i < n; i++) {
    s.items.push({ id: `bp${i}`, type: "blueprint", builds: "SOFA", at: room("CORRIDOR_A") });
    s.items.push({ id: `m${i}`, type: "metal_scraps", at: room("CORRIDOR_A") });
    s.items.push({ id: `t${i}`, type: "thick_tube", at: room("CORRIDOR_A") });
  }
  return s;
}

/** The ship with `n` sofas built in the front corridor. */
function withSofas(n = 1): GameState {
  const s = ship(n);
  player(s, "p0").skills = ["engineer"];
  return mustApply(s, "p0", ...Array.from({ length: n }, (_, i): Action => ({ type: "build", item: `bp${i}` })));
}

describe("sofa", () => {
  it("is a bed that is only ever built, and dismantles into 1 plastic scrap", () => {
    const { chance, ...scraps } = EQUIPMENT_TYPES.SOFA!.dismantle!; // the file forces the odds to 1
    expect({ ...EQUIPMENT_TYPES.SOFA, dismantle: scraps }).toEqual({ bed: true, builtOnly: true, dismantle: { metal: 0, plastic: 1 } });
  });

  it("is not on the ship at the start, not even in the turret room the map draws one in", () => {
    expect(Object.values(DEFAULT_CONFIG.equipment).flat().some((e) => e.type === "SOFA")).toBe(false);
  });

  it("can be lain on once built: +1 AP next cycle, and get up works", () => {
    const s = withSofas();
    const [sofa] = sofas(s);
    expect(offered(s, "p1")).toContainEqual({ type: "lie_down", equipment: sofa!.id });
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: sofa!.id }));
    expect(player(lying, "p1").lyingIn).toBe(sofa!.id);
    const next = nextCycle(lying);
    expect(player(next, "p1").ap - player(lying, "p1").ap).toBe(player(next, "p2").ap - player(lying, "p2").ap + 1);
    expect(player(must(applyAction(lying, "p1", { type: "get_up" })), "p1").modifiers).not.toContain("lying_down");
  });

  it("can be built twice in one room, each its own bed", () => {
    const s = withSofas(2);
    const both = sofas(s);
    expect(both).toHaveLength(2);
    expect(new Set(both.map((e) => e.id)).size).toBe(2);
    for (const e of both) expect(offered(s, "p1")).toContainEqual({ type: "lie_down", equipment: e.id });
  });

  it("dismantles for the usual cost, leaving a plastic scrap, getting its occupant up, publicly", () => {
    const s = withSofas(2);
    const [a, b] = sofas(s);
    const lying = mustApply(s, "p1", { type: "lie_down", equipment: a!.id });
    player(lying, "p2").room = "CORRIDOR_A";
    const both = mustApply(lying, "p2", { type: "lie_down", equipment: b!.id });
    expect(offered(both, "p0")).toContainEqual(dismantle(a!.id));
    const after = must(applyAction(both, "p0", dismantle(a!.id)));
    expect(sofas(after).map((e) => e.id)).toEqual([b!.id]);
    expect(after.items.filter((i) => i.type === "plastic_scraps" && i.at.kind === "room" && i.at.id === "CORRIDOR_A")).toHaveLength(1);
    expect(after.items.filter((i) => i.type === "metal_scraps")).toHaveLength(0);
    expect(player(after, "p0").ap).toBe(player(both, "p0").ap - config.dismantle.cost.ap);
    expect(player(after, "p1").modifiers).not.toContain("lying_down");
    expect(player(after, "p1").lyingIn).toBeUndefined();
    expect(player(after, "p2").lyingIn).toBe(b!.id); // the other sofa's occupant stays
    expect(viewFor(after, "p1").log.some((e) => e.key === "dismantledEquipment" && e.params?.equipment === "SOFA")).toBe(true);
  });

  it("can fail, leaving the sofa and its occupant, with a private line", () => {
    const s = withSofas();
    const [sofa] = sofas(s);
    const lying = mustApply(s, "p1", { type: "lie_down", equipment: sofa!.id });
    const restore = forceDismantleOdds(0);
    const after = must(applyAction(lying, "p0", dismantle(sofa!.id)));
    restore();
    expect(sofas(after)).toHaveLength(1);
    expect(player(after, "p1").lyingIn).toBe(sofa!.id);
    expect(viewFor(after, "p0").log.some((e) => e.key === "dismantleEquipmentFailed")).toBe(true);
    expect(viewFor(after, "p1").log.some((e) => e.key === "dismantleEquipmentFailed")).toBe(false);
  });

  it("can't be dismantled from another room, and a refused dismantle changes nothing", () => {
    const s = withSofas();
    const [sofa] = sofas(s);
    player(s, "p0").room = "SICK_BAY";
    const before = structuredClone(s);
    expect(applyAction(s, "p0", dismantle(sofa!.id)).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("other equipment without scrap values, like a bed, is not offered for dismantling", () => {
    const s = withSofas();
    player(s, "p0").room = "BEDROOM_A";
    expect(offered(s, "p0").some((a) => a.type === "dismantle" && "equipment" in a)).toBe(false);
  });
});
