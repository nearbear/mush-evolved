import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { installCameraIn } from "./cameras.ts";
import { makeSeats, must, nextCycle, offered, player, testConfig } from "./support.ts";

// Green Jelly (owner, 2026-11-07): the Electro-slime skill's secret action; the target breaks in 1-4 cycles.
const config = testConfig();
const snapshot = { equipment: { ...EQUIPMENT_TYPES }, items: { ...ITEM_TYPES } };
const SHOWER = "SICK_BAY:SHOWER";

beforeEach(() => {
  for (const [k, t] of Object.entries(EQUIPMENT_TYPES)) EQUIPMENT_TYPES[k] = { ...t, canBeSabotaged: false };
  for (const [k, t] of Object.entries(ITEM_TYPES)) ITEM_TYPES[k] = { ...t, canBeSabotaged: false };
  EQUIPMENT_TYPES.SHOWER = { ...snapshot.equipment.SHOWER!, canBeSabotaged: true };
  ITEM_TYPES.knife = { ...snapshot.items.knife!, canBreak: true, canBeSabotaged: true };
  ITEM_TYPES.soap = { ...snapshot.items.soap!, canBreak: true, isDestroyedWhenBroken: true, canBeSabotaged: true };
});
afterEach(() => {
  Object.assign(EQUIPMENT_TYPES, snapshot.equipment);
  Object.assign(ITEM_TYPES, snapshot.items);
});

/** p0 (Mush, with the skill) and p1 in the sick bay with a shower; p0 carries a knife and soap. */
function ship(skill = true): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.config = structuredClone(s.config);
  for (const id of ["p0", "p1"]) player(s, id).room = "SICK_BAY";
  player(s, "p0").role = "mush";
  player(s, "p1").role = "human";
  player(s, "p2").role = "human";
  player(s, "p0").mushSkills = skill ? ["electro_slime"] : [];
  if (!s.equipment.SICK_BAY!.some((e) => e.type === "SHOWER")) s.equipment.SICK_BAY!.push({ id: SHOWER, type: "SHOWER" });
  s.equipment.SICK_BAY!.find((e) => e.type === "SHOWER")!.id = SHOWER;
  for (const type of ["knife", "soap"]) s.items.push({ id: type, type, at: { kind: "player", id: "p0" } });
  return s;
}
const jelly = (target: { equipment: string } | { item: string }): Action => ({ type: "green_jelly", ...target });
const shower = (s: GameState) => s.equipment.SICK_BAY!.find((e) => e.id === SHOWER)!;
const chat = (s: GameState) => s.chat.filter((m) => m.system).map((m) => m.system!.key);

describe("green jelly", () => {
  it("is offered only to a Mush with the skill, for sabotageable targets without jelly", () => {
    expect(offered(ship(), "p0").filter((a) => a.type === "green_jelly")).toEqual(
      expect.arrayContaining([jelly({ equipment: SHOWER }), jelly({ item: "knife" }), jelly({ item: "soap" })]),
    );
    expect(offered(ship(false), "p0").some((a) => a.type === "green_jelly")).toBe(false);
    expect(applyAction(ship(false), "p0", jelly({ equipment: SHOWER })).ok).toBe(false);
    expect(applyAction(ship(), "p1", jelly({ equipment: SHOWER })).ok).toBe(false);
    const s = must(applyAction(ship(), "p0", jelly({ equipment: SHOWER })));
    expect(offered(s, "p0")).not.toContainEqual(jelly({ equipment: SHOWER }));
  });

  it("costs 1 AP, never fails, and sets 1 to 4 cycles", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const s0 = ship();
      s0.rng = seed;
      const ap = player(s0, "p0").ap;
      const s = must(applyAction(s0, "p0", jelly({ equipment: SHOWER })));
      expect(player(s, "p0").ap).toBe(ap - 1);
      seen.add(shower(s).jelly!);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it("breaks equipment after its cycles, with NERON's usual breakdown line and nothing about where or how", () => {
    let s = must(applyAction(ship(), "p0", jelly({ equipment: SHOWER })));
    shower(s).jelly = 2;
    s = nextCycle(s);
    expect(shower(s).broken).toBeUndefined();
    expect(shower(s).jelly).toBe(1);
    s = nextCycle(s);
    expect(shower(s).broken).toBe(true);
    expect(shower(s).jelly).toBeUndefined();
    expect(chat(s)).toContain("equipmentBroken");
  });

  it("breaks an item, or destroys one that is destroyed when broken, with a NERON line", () => {
    let s = ship();
    s.items.find((i) => i.id === "knife")!.jelly = 1;
    s.items.find((i) => i.id === "soap")!.jelly = 1;
    s = nextCycle(s);
    expect(s.items.find((i) => i.id === "knife")).toMatchObject({ broken: true });
    expect(s.items.find((i) => i.id === "knife")!.jelly).toBeUndefined();
    expect(s.items.some((i) => i.id === "soap")).toBe(false);
    expect(chat(s).filter((k) => k === "itemBroken")).toHaveLength(2);
  });

  it("shows the jelly and its cycles only to living Mush", () => {
    const s = must(applyAction(ship(), "p0", jelly({ equipment: SHOWER })));
    s.items.find((i) => i.id === "knife")!.jelly = 3;
    const cycles = shower(s).jelly;
    expect(viewFor(s, "p0").roomEquipment.find((e) => e.id === SHOWER)?.jelly).toBe(cycles);
    expect(viewFor(s, "p0").inventory.find((i) => i.id === "knife")?.jelly).toBe(3);
    for (const id of ["p1", "p2"]) expect(JSON.stringify({ ...viewFor(s, id), actions: [] })).not.toContain('"jelly"');
  });

  it("is not shown by a camera when it targets the camera itself, but is for any other target", () => {
    EQUIPMENT_TYPES.CAMERA = { ...snapshot.equipment.CAMERA!, canBeSabotaged: true };
    const s0 = ship();
    player(s0, "p1").room = "LABORATORY"; // p0 is alone, so only a camera could show it
    installCameraIn(s0, "SICK_BAY");
    const camera = s0.equipment.SICK_BAY!.find((e) => e.type === "CAMERA")!.id;
    const onCamera = must(applyAction(s0, "p0", jelly({ equipment: camera })));
    expect(onCamera.log.at(-1)).toMatchObject({ key: "greenJelly", visibleTo: ["p0"] });
    const onShower = must(applyAction(s0, "p0", jelly({ equipment: SHOWER })));
    expect(onShower.log.at(-1)).toMatchObject({ key: "greenJelly", visibleTo: "all" });
  });
});
