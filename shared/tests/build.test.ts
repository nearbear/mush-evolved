import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const seats = makeSeats(3);
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], equipment: {} };
const build = (item: string): Action => ({ type: "build", item });
const room = (id: string) => ({ kind: "room" as const, id });

/** p0 and p1 in the front corridor, p2 elsewhere. The blueprint (bp) lies on the floor, the metal (m) on the floor, the tube (t) is carried by p0. */
function ship(): GameState {
  const s = createGame(seats, { ...base, equipment: {} }, 3);
  player(s, "p0").room = player(s, "p1").room = "CORRIDOR_A";
  player(s, "p2").room = "SICK_BAY";
  s.items.push({ id: "bp", type: "blueprint", builds: "SOFA", at: room("CORRIDOR_A") });
  s.items.push({ id: "m", type: "metal_scraps", at: room("CORRIDOR_A") });
  s.items.push({ id: "t", type: "thick_tube", at: { kind: "player", id: "p0" } });
  return s;
}

describe("build", () => {
  it("starts with a sofa blueprint, and what it needs, in the front corridor", () => {
    const here = DEFAULT_CONFIG.startItems.filter((i) => i.room === "CORRIDOR_A");
    expect(here).toContainEqual({ type: "blueprint", builds: "SOFA", room: "CORRIDOR_A" });
    const s = createGame(seats, DEFAULT_CONFIG, 1);
    expect(s.items.find((i) => i.type === "blueprint")).toMatchObject({ builds: "SOFA", at: room("CORRIDOR_A") });
  });

  it("uses ingredients from the floor and the inventory, consumes the blueprint, and adds the sofa for 3 AP, publicly", () => {
    const r = applyAction(ship(), "p0", build("bp"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.map((i) => i.id)).toEqual([...r.state.items.map((i) => i.id)].filter((id) => !["bp", "m", "t"].includes(id)));
    expect(r.state.equipment.CORRIDOR_A).toMatchObject([{ type: "SOFA" }]);
    expect(player(r.state, "p0").ap).toBe(base.startAp - base.build.cost.ap);
    expect(viewFor(r.state, "p1").roomEquipment.map((e) => e.type)).toEqual(["SOFA"]);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "built")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "built")).toBe(false);
  });

  it("works for anyone in the room, using what is on the floor, and in any room", () => {
    const s = ship();
    s.items.find((i) => i.id === "t")!.at = room("CORRIDOR_A");
    expect(applyAction(s, "p1", build("bp")).ok).toBe(true);
    // Move everything to another room.
    for (const i of s.items) i.at = room("SICK_BAY");
    expect(legalActions(s, "p2")).toContainEqual(build("bp"));
  });

  it("does not use another player's inventory, and is not offered without every ingredient", () => {
    const s = ship();
    expect(legalActions(s, "p0")).toContainEqual(build("bp"));
    expect(legalActions(s, "p1").some((a) => a.type === "build")).toBe(false); // the tube is p0's
    s.items.find((i) => i.id === "m")!.type = "plastic_scraps";
    expect(legalActions(s, "p0").some((a) => a.type === "build")).toBe(false);
  });

  it("is refused without ingredients, AP, or reach, leaving state unchanged", () => {
    const s = ship();
    const before = JSON.stringify(s);
    expect(applyAction(s, "p1", build("bp")).ok).toBe(false);
    expect(applyAction(s, "p2", build("bp")).ok).toBe(false);
    expect(applyAction(s, "p0", build("m")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    player(s, "p0").ap = 2;
    const poor = JSON.stringify(s);
    expect(applyAction(s, "p0", build("bp")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(poor);
  });

  it("does not count the blueprint as an ingredient and builds as many sofas as it has blueprints", () => {
    const s = ship();
    s.items.push({ id: "bp2", type: "blueprint", builds: "SOFA", at: room("CORRIDOR_A") });
    const r = applyAction(s, "p0", build("bp"));
    if (!r.ok) throw new Error(r.error);
    expect(legalActions(r.state, "p0").some((a) => a.type === "build")).toBe(false);
  });

  it("builds a rocket launcher item into the inventory, or onto the floor when full", () => {
    const s = ship();
    s.items.push({ id: "bp2", type: "blueprint", builds: "MISSILE_LAUNCHER", at: room("CORRIDOR_A") }, { id: "pl", type: "plastic_scraps", at: room("CORRIDOR_A") });
    s.items.find((i) => i.id === "bp")!.at = room("SICK_BAY"); // keep the sofa blueprint out of reach
    const r = applyAction(s, "p0", build("bp2"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.filter((i) => ["bp2", "m", "t", "pl"].includes(i.id))).toEqual([]);
    expect(r.state.items.find((i) => i.type === "missile_launcher")?.at).toEqual({ kind: "player", id: "p0" });
    expect(r.state.equipment.CORRIDOR_A).toBeUndefined();
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "builtItem")).toBe(true);
    // A full inventory knocks it onto the floor.
    const full = ship();
    full.items.push({ id: "bp2", type: "blueprint", builds: "MISSILE_LAUNCHER", at: room("CORRIDOR_A") }, { id: "pl", type: "plastic_scraps", at: room("CORRIDOR_A") });
    for (const id of ["a", "b", "c"]) full.items.push({ id, type: "wrench", at: { kind: "player", id: "p0" } });
    const r2 = applyAction(full, "p0", build("bp2"));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.items.find((i) => i.type === "missile_launcher")?.at).toEqual(room("CORRIDOR_A"));
  });

  it("spawns a rocket launcher blueprint in the front corridor", () => {
    expect(DEFAULT_CONFIG.startItems).toContainEqual({ type: "blueprint", builds: "MISSILE_LAUNCHER", room: "CORRIDOR_A" });
  });

  it("shows which recipe a blueprint carries in the view", () => {
    expect(viewFor(ship(), "p0").roomItems.find((i) => i.id === "bp")).toEqual({ id: "bp", type: "blueprint", builds: "SOFA" });
  });

  it("parses a build message", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "build", item: "bp" } }))).toEqual({ type: "action", action: { type: "build", item: "bp" } });
  });
});
