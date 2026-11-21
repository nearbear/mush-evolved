import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, offered, option, player, testConfig } from "./support.ts";

// Reinforce (owner, 2026-11-07): an Engineer's action; 1 AP, 35%, one scrap for 10 (metal) or 5 (plastic) shielding, at most 50.
const config = testConfig();
const snapshot = { equipment: { ...EQUIPMENT_TYPES }, items: { ...ITEM_TYPES } };
const SHOWER = "SICK_BAY:SHOWER";

beforeEach(() => {
  ITEM_TYPES.knife = { ...snapshot.items.knife!, canBeSabotaged: true };
  ITEM_TYPES.wrench = { ...snapshot.items.wrench!, canBeSabotaged: false, dismantle: undefined };
  EQUIPMENT_TYPES.SHOWER = { ...snapshot.equipment.SHOWER!, canBeSabotaged: true };
});
afterEach(() => {
  Object.assign(EQUIPMENT_TYPES, snapshot.equipment);
  Object.assign(ITEM_TYPES, snapshot.items);
});

/** p0 (Engineer), p1 (human), p2 (Mush) in the sick bay with a shower; p0 carries a knife and a wrench and a metal scrap. */
function ship(): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.config = structuredClone(s.config);
  s.config.reinforce.chance = 1;
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p0").role = "human";
  player(s, "p1").role = "human";
  player(s, "p2").role = "mush";
  player(s, "p0").skills = ["engineer"];
  if (!s.equipment.SICK_BAY!.some((e) => e.type === "SHOWER")) s.equipment.SICK_BAY!.push({ id: SHOWER, type: "SHOWER" });
  s.equipment.SICK_BAY!.find((e) => e.type === "SHOWER")!.id = SHOWER;
  for (const type of ["knife", "wrench", "metal_scraps"]) s.items.push({ id: type, type, at: { kind: "player", id: "p0" } });
  return s;
}
const reinforce = (target: { equipment: string } | { item: string }): Action => ({ type: "reinforce", ...target }) as Action;
const shower = (s: GameState) => s.equipment.SICK_BAY!.find((e) => e.id === SHOWER)!;
const scraps = (s: GameState, type: string) => s.items.filter((i) => i.type === type).length;

describe("reinforce", () => {
  it("pins the confirmed numbers", () => {
    const s = createGame(makeSeats(3), config, 3);
    expect(s.config.reinforce).toEqual({ cost: { ap: 1 }, chance: 0.35, max: 50, fortifiedAt: 25, gain: { metal_scraps: 10, plastic_scraps: 5 } });
  });

  it("is offered to an Engineer once per sabotageable or dismantlable target, whatever the scrap", () => {
    const s = ship();
    const options = offered(s, "p0").filter((a) => a.type === "reinforce");
    expect(options).toEqual(expect.arrayContaining([reinforce({ equipment: SHOWER }), reinforce({ item: "knife" })]));
    expect(options).not.toContainEqual(reinforce({ item: "wrench" }));
    s.items.push({ id: "plastic", type: "plastic_scraps", at: { kind: "room", id: "SICK_BAY" } });
    expect(offered(s, "p0").filter((a) => a.type === "reinforce")).toEqual(options);
    expect(option(s, "p0", reinforce({ item: "knife" }))).toMatchObject({ cost: { ap: 1 }, chance: 1 });
  });

  it("is not offered to a non-Engineer, or without scrap", () => {
    const s = ship();
    expect(offered(s, "p1").some((a) => a.type === "reinforce")).toBe(false);
    s.items = s.items.filter((i) => i.type !== "metal_scraps");
    expect(offered(s, "p0").some((a) => a.type === "reinforce")).toBe(false);
  });

  it("consumes the scrap and adds the metal gain", () => {
    const s = ship();
    const ap = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", reinforce({ equipment: SHOWER })));
    expect(shower(after).shield).toBe(10);
    expect(scraps(after, "metal_scraps")).toBe(0);
    expect(player(after, "p0").ap).toBe(ap - 1);
  });

  it("adds 5 for plastic when that is the scrap it uses", () => {
    const s = ship();
    s.items = s.items.filter((i) => i.type !== "metal_scraps");
    s.items.push({ id: "plastic", type: "plastic_scraps", at: { kind: "room", id: "SICK_BAY" } });
    const after = must(applyAction(s, "p0", reinforce({ item: "knife" })));
    expect(after.items.find((i) => i.id === "knife")!.shield).toBe(5);
    expect(after.items.some((i) => i.id === "plastic")).toBe(false);
  });

  it("uses scrap in this order: inventory metal, inventory plastic, room metal, room plastic", () => {
    const s = ship();
    s.items = s.items.filter((i) => i.type !== "metal_scraps");
    const here = (id: string, type: string, where: "player" | "room") => s.items.push({ id, type, at: where === "player" ? { kind: "player", id: "p0" } : { kind: "room", id: "SICK_BAY" } });
    here("room-plastic", "plastic_scraps", "room");
    here("room-metal", "metal_scraps", "room");
    here("own-plastic", "plastic_scraps", "player");
    here("own-metal", "metal_scraps", "player");
    const used: string[] = [];
    let cur = s;
    for (let i = 0; i < 4; i++) {
      const before = new Set(cur.items.map((it) => it.id));
      cur = must(applyAction(cur, "p0", reinforce({ equipment: SHOWER })));
      shower(cur).shield = 0; // keep it under the cap
      used.push([...before].find((id) => !cur.items.some((it) => it.id === id))!);
    }
    expect(used).toEqual(["own-metal", "own-plastic", "room-metal", "room-plastic"]);
  });

  it("caps at 50, and stops offering a target at 50", () => {
    const s = ship();
    shower(s).shield = 45;
    const after = must(applyAction(s, "p0", reinforce({ equipment: SHOWER })));
    expect(shower(after).shield).toBe(50);
    after.items.push({ id: "m2", type: "metal_scraps", at: { kind: "player", id: "p0" } });
    expect(offered(after, "p0")).not.toContainEqual(reinforce({ equipment: SHOWER }));
    expect(applyAction(after, "p0", reinforce({ equipment: SHOWER })).ok).toBe(false);
  });

  it("keeps the scrap on a failed roll, still spending the AP", () => {
    const s = ship();
    s.config.reinforce.chance = 0;
    const ap = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", reinforce({ equipment: SHOWER })));
    expect(shower(after).shield).toBeUndefined();
    expect(scraps(after, "metal_scraps")).toBe(1);
    expect(player(after, "p0").ap).toBe(ap - 1);
  });

  it("refuses illegal tries and leaves the state unchanged", () => {
    const s = ship();
    for (const [id, action] of [["p1", reinforce({ item: "knife" })], ["p0", reinforce({ item: "wrench" })]] as const) expect(applyAction(s, id, action).ok).toBe(false);
    s.items = s.items.filter((i) => i.type !== "metal_scraps");
    expect(applyAction(s, "p0", reinforce({ item: "knife" })).ok).toBe(false);
    const after = JSON.stringify(s);
    expect(JSON.stringify(s)).toBe(after);
  });

  it("shielding of 25 or more blocks Dismantle and Sabotage", () => {
    for (const [shield, blocked] of [[24, false], [25, true]] as const) {
      const s = ship();
      s.items.find((i) => i.id === "knife")!.shield = shield;
      shower(s).shield = shield;
      const dismantle = offered(s, "p0").some((a) => a.type === "dismantle" && "item" in a && a.item === "knife");
      const sabotage = offered(s, "p2").some((a) => a.type === "sabotage" && "equipment" in a && a.equipment === SHOWER);
      expect([dismantle, sabotage]).toEqual([!blocked, !blocked]);
      expect(applyAction(s, "p0", { type: "dismantle", item: "knife" }).ok).toBe(!blocked);
    }
  });

  it("shows the shielding to living Engineers and Mush only", () => {
    const s = ship();
    shower(s).shield = 20;
    s.items.find((i) => i.id === "knife")!.shield = 15;
    const seen = (id: string) => {
      const v = viewFor(s, id);
      return [v.roomEquipment.find((e) => e.id === SHOWER)?.shield, [...v.inventory, ...v.roomItems].find((i) => i.id === "knife")?.shield];
    };
    expect(seen("p0")).toEqual([20, 15]);
    expect(seen("p2")).toEqual([20, undefined]);
    expect(seen("p1")).toEqual([undefined, undefined]);
    player(s, "p0").alive = false;
    expect(seen("p0")[0]).toBeUndefined();
  });
});
