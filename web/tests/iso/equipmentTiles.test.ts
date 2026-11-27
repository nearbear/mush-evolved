import { describe, expect, it } from "vitest";
import type { EquipmentView, ShipLayout } from "@mush2/shared";
import { shipArt } from "./shipArt.ts";
import shipMapJson from "../../../Mush/derived/ship-map.json?raw";
import rooms from "../../../Mush/derived/ship-rooms.json";
import { equipmentByTileKey, roomAsBuilt, withoutBuiltOnly } from "../../src/iso/equipmentTiles.ts";
import { walkableCells } from "../../src/iso/placement.ts";

const raw = ({ ...shipArt(), ...JSON.parse(shipMapJson) }) as ShipLayout;
const layout = withoutBuiltOnly(raw);
const sofa: EquipmentView = { id: "X:SOFA:1", type: "SOFA" };
const roomOf = (l: ShipLayout, id: string) => l.rooms.find((r) => r.id === id)!;
const sofaTiles = (l: ShipLayout, id: string) => roomOf(l, id).tiles.filter((t) => t.slice === "sofa" || t.slice === "sofaReverse");

describe("built sofas", () => {
  it("are not drawn from the map: the turret room's sofa is gone until built", () => {
    expect(sofaTiles(raw, "LASER_TURRET_B_0")).toHaveLength(1);
    expect(layout.rooms.flatMap((r) => r.tiles).some((t) => t.slice === "sofa" || t.slice === "sofaReverse")).toBe(false);
  });

  it("appear at the room's spot once built, appended, and stand for the first sofa", () => {
    const room = roomOf(layout, "COMMAND_CENTER");
    expect(roomAsBuilt(room, [])).toBe(room);
    const built = roomAsBuilt(room, [sofa, { id: "X:SOFA:2", type: "SOFA" }]);
    expect(built.tiles.slice(0, -1)).toEqual(room.tiles);
    expect(built.tiles.at(-1)).toMatchObject({ ...sofaTiles(raw, "COMMAND_CENTER")[0]!, kind: "entity" });
    expect(equipmentByTileKey(built, [sofa]).get(`t${built.tiles.length - 1}`)).toEqual(sofa);
  });

  it("have a spot in every room but the Nexus and hydroponics, on free floor, leaving the floor connected", () => {
    const ids = rooms.map((r) => r.id);
    const withSofa = ids.filter((id) => sofaTiles(raw, id).length > 0);
    expect(ids.filter((id) => !withSofa.includes(id)).sort()).toEqual(["HYDROPONIC_CENTER", "NEXUS_ROOM"]);
    for (const id of withSofa) {
      const before = walkableCells(layout, roomOf(layout, id));
      const after = walkableCells(layout, roomAsBuilt(roomOf(layout, id), [sofa]));
      expect(before.length - after.length, id).toBe(3);
      const left = new Set(after.map((c) => `${c.x},${c.y}`));
      const seen = new Set([`${after[0]!.x},${after[0]!.y}`]);
      for (const queue = [...seen]; queue.length; ) {
        const [x, y] = queue.pop()!.split(",").map(Number) as [number, number];
        for (const k of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (left.has(k) && !seen.has(k)) (seen.add(k), queue.push(k));
      }
      expect(seen.size, id).toBe(left.size);
    }
  });
});

describe("Super Calculator in the Nexus", () => {
  const nexus = roomOf(layout, "NEXUS_ROOM");
  const superCalc: EquipmentView = { id: "NEXUS_ROOM:SUPER_CALC", type: "SUPER_CALC" };

  it("is not bound to the server tile before being built", () => {
    const keys = equipmentByTileKey(nexus, []);
    expect([...keys.values()].some((e) => e.type === "SUPER_CALC")).toBe(false);
  });

  it("is bound to the server tile once built", () => {
    const keys = equipmentByTileKey(nexus, [superCalc]);
    const entry = [...keys.entries()].find(([, e]) => e.type === "SUPER_CALC");
    expect(entry).toBeDefined();
    const serverIndex = nexus.tiles.findIndex((t) => t.slice === "server");
    expect(entry![0]).toBe(`t${serverIndex}`);
  });
});

describe("Surgery Pod in the Sick Bay", () => {
  const sickBay = roomOf(layout, "SICK_BAY");
  const pod: EquipmentView = { id: "SICK_BAY:SURGERY_POD", type: "SURGERY_POD" };

  it("is selected from both its console and the pod itself", () => {
    const keys = equipmentByTileKey(sickBay, [pod]);
    for (const slice of ["surgery_console", "surgery"]) {
      const index = sickBay.tiles.findIndex((t) => t.slice === slice);
      expect(index, slice).toBeGreaterThanOrEqual(0);
      expect(keys.get(`t${index}`), slice).toEqual(pod);
    }
  });
});

describe("Dynarcade in Alpha Bay 2", () => {
  const bay = roomOf(layout, "SPACESHIP_BAY_AA");
  const dynarcade: EquipmentView = { id: "SPACESHIP_BAY_AA:DYNARCADE", type: "DYNARCADE" };

  it("is stripped before CALL_OF_DIRTY completes and drawn once built", () => {
    expect(bay.tiles.some((t) => t.slice === "dynarcade")).toBe(false);
    expect([...equipmentByTileKey(bay, []).values()].some((e) => e.type === "DYNARCADE")).toBe(false);

    const built = roomAsBuilt(bay, [dynarcade]);
    expect(built.tiles.some((t) => t.slice === "dynarcade")).toBe(true);
    const keys = equipmentByTileKey(built, [dynarcade]);
    const entry = [...keys.entries()].find(([, e]) => e.type === "DYNARCADE");
    expect(entry).toBeDefined();
    expect(built.tiles[Number(entry![0].slice(1))]?.slice).toBe("dynarcade");
  });
});
