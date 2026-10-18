import { describe, expect, it } from "vitest";
import type { RoomId, ShipLayout } from "@mush2/shared";
import type { PlacedSprite } from "../../src/iso/placement.ts";
import { describeScene, type Occupant, type SceneInput } from "../../src/iso/scene.ts";
import type { Walker } from "../../src/iso/useWalkers.ts";

const HERE = "bridge" as RoomId;
const NEXT = "front_corridor" as RoomId;

const layout = { roomSize: 32, sheets: {}, slices: { camera: { anims: [{ frames: [0, 1, 2, 1] }] } }, rooms: [], autoBind: {} } as unknown as ShipLayout;

const placed = (over: Partial<PlacedSprite>): PlacedSprite => ({
  key: "t0",
  room: HERE,
  kind: "ground",
  cell: { x: 0, y: 0 },
  left: 0,
  top: 0,
  width: 32,
  height: 16,
  order: 0,
  slice: "floor",
  sheet: "S",
  sx: 0,
  sy: 0,
  flipX: false,
  flipY: false,
  ...over,
});

const person = (id: string, over: Partial<Occupant> = {}): Occupant => ({ id, name: id, isBot: false, character: "kuanti", you: false, statuses: [], ...over });
const actor = (id: string, over: Partial<PlacedSprite> = {}) => placed({ key: `a:${id}`, kind: "actor", width: 32, height: 48, ...over });
const walker = (over: Partial<Walker> = {}): Walker => ({ cell: { x: 0, y: 0 }, facing: { strip: "face", flip: false }, moving: false, arriving: false, ...over });

function scene(placedSprites: PlacedSprite[], over: Partial<SceneInput> = {}) {
  return describeScene({
    layout,
    room: HERE,
    placed: placedSprites,
    box: { minX: -100, minY: -50, width: 400, height: 300 },
    people: new Map(),
    walkers: new Map(),
    beds: new Map(),
    seat: undefined,
    corpses: [],
    equipment: new Map(),
    reachable: new Set([NEXT]),
    selected: null,
    selectedDoor: null,
    hoverKey: null,
    ownCells: new Set(),
    ...over,
  });
}
const only = (s: ReturnType<typeof scene>) => s.sprites[0]!;

describe("describeScene", () => {
  it("places sprites relative to the scene box, in paint order", () => {
    const s = scene([placed({ key: "t1", left: -100, top: -50 }), placed({ key: "t2", left: 20, top: 10 })]);
    expect(s.sprites.map((p) => [p.key, p.x, p.y])).toEqual([["t1", 0, 0], ["t2", 120, 60]]);
    expect([s.width, s.height]).toEqual([400, 300]);
  });

  it("fogs other rooms, lifting a selected or hovered reachable room", () => {
    const tile = placed({ room: NEXT });
    expect(only(scene([tile])).effect).toBe("fogged");
    expect(only(scene([tile], { selectedDoor: NEXT })).effect).toBe("foggedLifted");
    expect(only(scene([tile], { hoverKey: `n:${NEXT}` })).effect).toBe("foggedLifted");
    expect(only(scene([tile], { hoverKey: `n:${NEXT}`, reachable: new Set() })).effect).toBe("fogged");
  });

  it("keeps a neighbour's door back here and its walls beside this floor lit", () => {
    expect(only(scene([placed({ room: NEXT, kind: "door", door: { target: HERE } })])).effect).toBeUndefined();
    const wall = placed({ room: NEXT, kind: "wall", cell: { x: 3, y: 4 } });
    expect(only(scene([wall], { ownCells: new Set(["3,4"]) })).effect).toBeUndefined();
    expect(only(scene([wall])).effect).toBe("fogged");
  });

  it("lets hovering a reachable door outshine its selection, but not an unreachable one", () => {
    const door = placed({ key: "t5", kind: "door", door: { target: NEXT } });
    expect(only(scene([door], { hoverKey: "t5", selectedDoor: NEXT }))).toMatchObject({ role: "door", reachable: true, effect: "doorHover" });
    expect(only(scene([door], { selectedDoor: NEXT })).effect).toBe("selected");
    expect(only(scene([door], { hoverKey: "t5", reachable: new Set() })).effect).toBeUndefined();
  });

  it("keeps selected equipment's glow while it is hovered", () => {
    const eq = placed({ key: "t7", kind: "entity" });
    const equipment = new Map([["t7", { id: "e1", type: "TERMINAL" } as never]]);
    expect(only(scene([eq], { equipment, hoverKey: "t7" }))).toMatchObject({ role: "equipment", effect: "hover" });
    expect(only(scene([eq], { equipment, hoverKey: "t7", selected: { kind: "equipment", id: "e1" } as never })).effect).toBe("selected");
    const scenery = only(scene([eq], { hoverKey: "t7" }));
    expect([scenery.role, scenery.effect]).toEqual(["tile", undefined]);
  });

  it("animates the camera's swivel", () => {
    expect(only(scene([placed({ slice: "camera" })])).anim).toMatchObject({ frames: [0, 1, 2, 1], loops: "forever" });
  });

  it("draws walkers with their facing and walk cycle, and an outline for each", () => {
    const people = new Map([["p1", person("p1")]]);
    const walking = scene([actor("p1", { occluded: true })], { people, walkers: new Map([["p1", walker({ moving: true, facing: { strip: "back", flip: true } })]]) });
    expect(only(walking)).toMatchObject({ role: "person", walker: "p1", flipX: true, shadow: "standing", anim: { loops: "forever" }, image: { keyed: true } });
    expect(walking.outlines).toMatchObject([{ key: "a:p1", walker: "p1", occluded: true, faint: false, anim: { loops: "forever" } }]);
    const arriving = scene([actor("p1")], { people, walkers: new Map([["p1", walker({ arriving: true })]]) });
    expect(only(arriving).anim?.loops).toBe(2);
    expect(only(scene([actor("p1")], { people, walkers: new Map([["p1", walker()]]) })).anim).toBeUndefined();
  });

  it("marks you and the person selected", () => {
    const people = new Map([["me", person("me", { you: true })]]);
    expect(only(scene([actor("me")], { people, selected: { kind: "player", id: "me" } }))).toMatchObject({ you: true, effect: "selected" });
  });

  it("draws someone in bed lying, mirrored along the bed", () => {
    const people = new Map([["p1", person("p1", { lying: "bed1" })]]);
    expect(only(scene([actor("p1", { width: 50 })], { people, beds: new Map([["p1", { flip: true }]]) }))).toMatchObject({ shadow: "lying", flipX: true, image: { keyed: false } });
  });

  it("fogs people in the rooms around without walking them", () => {
    const people = new Map([["p2", person("p2")]]);
    const s = scene([actor("p2", { room: NEXT, occluded: true })], { people, walkers: new Map([["p2", walker({ moving: true })]]) });
    expect(only(s)).toMatchObject({ role: "person", effect: "fogged", shadow: "standing" });
    expect(only(s).walker).toBeUndefined();
    expect(s.outlines).toMatchObject([{ occluded: true, faint: true }]);
  });

  it("draws a corpse lying, selected over hovered, without an outline", () => {
    const corpses = [{ id: "c1" as never, character: "kuanti" as const }];
    const body = actor("corpse:c1", { width: 50 });
    const s = scene([body], { corpses, hoverKey: "a:corpse:c1" });
    expect(only(s)).toMatchObject({ role: "corpse", shadow: "lying", effect: "hover" });
    expect(s.outlines).toEqual([]);
    expect(only(scene([body], { corpses, hoverKey: "a:corpse:c1", selected: { kind: "item", id: "c1" } as never })).effect).toBe("selected");
  });
});
