import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT, cameraEquipmentId } from "../src/equipment.ts";
import { hasCamera, logCovert } from "../src/log.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { installCameraIn } from "./cameras.ts";
import { makeSeats, player, must, offered } from "./support.ts";

const seats = makeSeats(3);
const config = { ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [], dismantle: { ...DEFAULT_CONFIG.dismantle, successChance: 1 } };
const equipmentIn = (s: GameState, room: string) => s.config.equipment[room]?.filter((e) => e.type === CAMERA_EQUIPMENT) ?? [];
const dismantleEquipment = (room: string): Action => ({ type: "dismantle", equipment: cameraEquipmentId(room) });

/** p0 carries a camera in the refectory; p1 is there too; p2 is in the laboratory. */
function ship(): { s: GameState; camera: string; install: Action } {
  const s = createGame(seats, config, 3);
  s.config = structuredClone(s.config); // createGame shares the config with DEFAULT_CONFIG
  player(s, "p0").room = "REFECTORY";
  player(s, "p1").room = "REFECTORY";
  player(s, "p2").room = "LABORATORY";
  const id = `item-${s.nextItemId++}`;
  s.items.push({ id, type: "camera", at: { kind: "player", id: "p0" } });
  return { s, camera: id, install: { type: "install", item: id } };
}

describe("install", () => {
  it("defaults to 2 AP", () => {
    expect(DEFAULT_CONFIG.install).toEqual({ cost: { ap: 2 } });
  });

  it("turns the carried camera into the room's equipment, for 2 AP, with a public log line", () => {
    const { s, camera, install } = ship();
    expect(offered(s, "p0")).toContainEqual(install);
    const after = must(applyAction(s, "p0", install));
    expect(after.items.some((i) => i.id === camera)).toBe(false);
    expect(equipmentIn(after, "REFECTORY")).toEqual([{ id: "REFECTORY:CAMERA", type: CAMERA_EQUIPMENT }]);
    expect(hasCamera(after, "REFECTORY")).toBe(true);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - 2);
    expect(viewFor(after, "p1").roomEquipment).toContainEqual({ id: "REFECTORY:CAMERA", type: CAMERA_EQUIPMENT });
    expect(viewFor(after, "p1").log.some((e) => e.key === "cameraInstalled")).toBe(true);
    // The other room learns nothing.
    expect(viewFor(after, "p2").roomEquipment.some((e) => e.type === CAMERA_EQUIPMENT)).toBe(false);
    expect(viewFor(after, "p2").log.some((e) => e.key === "cameraInstalled")).toBe(false);
  });

  it("is what makes a room a filmed one: a camera item alone changes nothing", () => {
    const { s, camera, install } = ship();
    s.items.find((i) => i.id === camera)!.at = { kind: "room", id: "REFECTORY" };
    expect(hasCamera(s, "REFECTORY")).toBe(false);
    s.items.find((i) => i.id === camera)!.at = { kind: "player", id: "p0" };
    expect(hasCamera(s, "REFECTORY")).toBe(false);
    logCovert(s, "p0", "covert");
    expect(s.log.at(-1)!.visibleTo).toEqual(["p0"]);
    const after = must(applyAction(s, "p0", install));
    logCovert(after, "p0", "covert");
    expect(after.log.at(-1)!.visibleTo).toBe("all");
  });

  it("works in every room of the ship", () => {
    const { s, install } = ship();
    for (const room of Object.keys(s.config.rooms)) {
      const t = structuredClone(s);
      player(t, "p0").room = room;
      expect(hasCamera(t, room)).toBe(false);
      expect(hasCamera(must(applyAction(t, "p0", install)), room)).toBe(true);
    }
  });

  it("is refused, leaving state unchanged, where a camera already is, when broke, or for an item you don't carry", () => {
    const { s, camera, install } = ship();

    const filmed = structuredClone(s);
    installCameraIn(filmed, "REFECTORY");
    expect(offered(filmed, "p0").some((a) => a.type === "install")).toBe(false);
    expect(applyAction(filmed, "p0", install).ok).toBe(false);

    const broke = structuredClone(s);
    player(broke, "p0").ap = 0;
    expect(applyAction(broke, "p0", install).ok).toBe(false);

    const onFloor = structuredClone(s);
    onFloor.items.find((i) => i.id === camera)!.at = { kind: "room", id: "REFECTORY" };
    expect(applyAction(onFloor, "p0", install).ok).toBe(false);
    expect(applyAction(s, "p1", install).ok).toBe(false);
  });

  it("is accepted from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "install", item: "item-9" } }))).toEqual({
      type: "action",
      action: { type: "install", item: "item-9" },
    });
  });
});

describe("uninstall", () => {
  it("removes the camera from the room's equipment and gives you a camera item, for a public line", () => {
    const { s } = ship();
    installCameraIn(s, "REFECTORY");
    s.items = s.items.filter((i) => i.type !== "camera");
    const uninstall: Action = { type: "uninstall", equipment: "REFECTORY:CAMERA" };
    expect(offered(s, "p0")).toContainEqual(uninstall);
    const after = must(applyAction(s, "p0", uninstall));
    expect(hasCamera(after, "REFECTORY")).toBe(false);
    expect(equipmentIn(after, "REFECTORY")).toEqual([]);
    expect(after.items.filter((i) => i.type === "camera")).toEqual([expect.objectContaining({ at: { kind: "player", id: "p0" } })]);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - 1);
    expect(viewFor(after, "p1").log.some((e) => e.key === "cameraUninstalled")).toBe(true);
    // And it can be installed again, here or elsewhere.
    expect(offered(after, "p0").some((a) => a.type === "install")).toBe(true);
  });

  it("puts the camera in the room if your inventory is full", () => {
    const { s } = ship();
    installCameraIn(s, "REFECTORY");
    s.items = s.items.filter((i) => i.type !== "camera");
    for (let i = 0; i < s.config.inventorySlots; i++) s.items.push({ id: `junk-${i}`, type: "wrench", at: { kind: "player", id: "p0" } });
    const after = must(applyAction(s, "p0", { type: "uninstall", equipment: "REFECTORY:CAMERA" }));
    expect(after.items.find((i) => i.type === "camera")!.at).toEqual({ kind: "room", id: "REFECTORY" });
    expect(hasCamera(after, "REFECTORY")).toBe(false);
  });

  it("is refused without a camera in the room, from another room, or when broke", () => {
    const { s } = ship();
    expect(applyAction(s, "p0", { type: "uninstall", equipment: "REFECTORY:CAMERA" }).ok).toBe(false);
    installCameraIn(s, "REFECTORY");
    expect(applyAction(s, "p2", { type: "uninstall", equipment: "REFECTORY:CAMERA" }).ok).toBe(false);
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", { type: "uninstall", equipment: "REFECTORY:CAMERA" }).ok).toBe(false);
  });

  it("is accepted from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "uninstall", equipment: "X:CAMERA" } }))).toEqual({
      type: "action",
      action: { type: "uninstall", equipment: "X:CAMERA" },
    });
  });
});

describe("dismantling a camera", () => {
  it("removes an installed camera from the room's equipment and leaves a metal scrap, not a camera", () => {
    const { s } = ship();
    installCameraIn(s, "REFECTORY");
    s.items = s.items.filter((i) => i.type !== "camera");
    const dismantle = dismantleEquipment("REFECTORY");
    expect(offered(s, "p0")).toContainEqual(dismantle);
    const after = must(applyAction(s, "p0", dismantle));
    expect(hasCamera(after, "REFECTORY")).toBe(false);
    expect(after.items.filter((i) => i.type === "camera")).toEqual([]);
    expect(after.items.filter((i) => i.type === "metal_scraps")).toEqual([expect.objectContaining({ at: { kind: "room", id: "REFECTORY" } })]);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - DEFAULT_CONFIG.dismantle.cost.ap);
    expect(viewFor(after, "p1").log.some((e) => e.key === "dismantledEquipment")).toBe(true);
  });

  it("can still fail, leaving the camera installed and the cost paid", () => {
    const { s } = ship();
    s.config.dismantle = { ...s.config.dismantle, successChance: 0 };
    installCameraIn(s, "REFECTORY");
    const after = must(applyAction(s, "p0", dismantleEquipment("REFECTORY")));
    expect(hasCamera(after, "REFECTORY")).toBe(true);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - s.config.dismantle.cost.ap);
    expect(viewFor(after, "p0").log.some((e) => e.key === "dismantleEquipmentFailed")).toBe(true);
    expect(viewFor(after, "p1").log.some((e) => e.key === "dismantleEquipmentFailed")).toBe(false);
  });

  it("works on a camera item that is not installed yet, carried or on the floor", () => {
    const { s, camera } = ship();
    for (const at of [{ kind: "player" as const, id: "p0" }, { kind: "room" as const, id: "REFECTORY" }]) {
      const t = structuredClone(s);
      t.items.find((i) => i.id === camera)!.at = at;
      const after = must(applyAction(t, "p0", { type: "dismantle", item: camera }));
      expect(after.items.some((i) => i.type === "camera")).toBe(false);
      expect(after.items.filter((i) => i.type === "metal_scraps")).toHaveLength(1);
      expect(hasCamera(after, "REFECTORY")).toBe(false);
    }
  });

  it("is refused for a camera in another room, and is accepted from the wire", () => {
    const { s } = ship();
    installCameraIn(s, "LABORATORY");
    expect(applyAction(s, "p0", dismantleEquipment("LABORATORY")).ok).toBe(false);
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "dismantle", equipment: "X:CAMERA" } }))).toEqual({
      type: "action",
      action: { type: "dismantle", equipment: "X:CAMERA" },
    });
  });
});
