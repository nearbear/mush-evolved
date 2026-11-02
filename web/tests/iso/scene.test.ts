import { describe, expect, it } from "vitest";
import type { RoomId, ShipLayout, SliceInfo } from "@mush2/shared";
import type { PlacedSprite } from "../../src/iso/placement.ts";
import { animFrame, animStep, describeScene, doorAnim, doorOpenMs, frameAt, imageOf, type Occupant, type SceneInput } from "../../src/iso/scene.ts";
import type { Walker } from "../../src/iso/useWalkers.ts";

const HERE = "bridge" as RoomId;
const NEXT = "front_corridor" as RoomId;

/** Like DOOR_L in tiles.xml: opens over frames 0-9, shuts over 12-23 and back to 0. */
const DOOR = {
  flags: ["door"],
  anims: [
    { frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rhythm: [1, 3, 2, 2, 1, 1, 1, 1, 1, 2, 2, 20], auto: false },
    { frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0], rhythm: [3, 3, 2, 2, 2, 2, 3, 3, 2, 2, 3, 3, 1], auto: false },
  ],
} as unknown as SliceInfo;
const FRONT_DOOR = { flags: ["door"], anims: [{ frames: [0, 1, 2, 3, 4], rhythm: [5, 5, 5, 5, 5], auto: true }] } as unknown as SliceInfo;

/** Like the engine room's reactors: frames run down a column, looping on their own. */
const REACTOR = { framesX: 1, anims: [{ frames: [0, 1, 2], rhythm: [2, 2, 2], auto: true }] } as unknown as SliceInfo;
/** PILGRED's core: a still orb, and its animated look, elsewhere on another sheet. */
const CORE = { sheet: "S", x: 768, y: 1656, framesX: 1, anims: [] } as unknown as SliceInfo;
const CORE_UPGRADE = { sheet: "T", x: 0, y: 1656, width: 128, height: 110, framesX: 6, anims: [{ frames: [0, 1, 2, 3, 4, 5], rhythm: [3, 3, 3, 3, 3, 3], auto: true }] } as unknown as SliceInfo;
const TANK = { sheet: "MidFill2", x: 0, y: 1082, width: 42, height: 62, framesX: 9, anims: [{ frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], rhythm: [12, 12, 12, 12, 12, 12, 12, 12, 12], auto: true }] } as unknown as SliceInfo;
const TANK_FULL = { sheet: "MidFill2", x: 0, y: 1145, width: 42, height: 62, framesX: 9, anims: [{ frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], rhythm: [12, 12, 12, 12, 12, 12, 12, 12, 12], auto: true }] } as unknown as SliceInfo;

const layout = {
  roomSize: 32,
  sheets: {},
  slices: { camera: { anims: [{ frames: [0, 1, 2, 1] }] }, door: DOOR, rotational_reactor: REACTOR, core_pilgred: CORE, core_pilgred_upgrade: CORE_UPGRADE, human_tank: TANK, human_tank_full: TANK_FULL },
  rooms: [],
  autoBind: {},
} as unknown as ShipLayout;

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
    seats: new Map(),
    corpses: [],
    equipment: new Map(),
    reachable: new Set([NEXT]),
    selected: null,
    selectedDoor: null,
    hoverKey: null,
    ownCells: new Set(),
    doors: new Map(),
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

  it("loops the reactors on their own, at their rhythm, stepping down their column", () => {
    const s = only(scene([placed({ slice: "rotational_reactor", width: 228, height: 182, sx: 350, sy: 0 })]));
    expect(s.anim).toMatchObject({ frames: [0, 1, 2], frameMs: [200 / 3, 200 / 3, 200 / 3], loops: "forever" });
    expect(frameAt(s.image, 2)).toEqual({ sx: 350, sy: 364 });
  });

  it("starts each reactor at a different point in its loop, so they don't pulse in step", () => {
    const reactor = (key: string) => placed({ key, slice: "rotational_reactor", width: 228, height: 182 });
    const { sprites } = scene([reactor("t1"), reactor("t2"), reactor("t3")]);
    expect(sprites.map((s) => s.anim?.frames)).toEqual([
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
    ]);
  });

  it("draws PILGRED's core still until it is repaired, then as the animated globe", () => {
    const core = placed({ slice: "core_pilgred", width: 128, height: 110, sx: 768, sy: 1656 });
    expect(only(scene([core])).anim).toBeUndefined();
    const repaired = only(scene([core], { looks: new Map([["core_pilgred", "core_pilgred_upgrade"]]) }));
    expect(repaired.image.frame).toMatchObject({ sx: 0, sy: 1656, width: 128, height: 110 });
    expect(repaired.anim).toMatchObject({ frames: [0, 1, 2, 3, 4, 5], loops: "forever" });
    expect(frameAt(repaired.image, 4)).toEqual({ sx: 512, sy: 1656 });
    // Hit-testing reads the same look.
    expect(imageOf(core, { layout, room: HERE, people: new Map(), walkers: new Map(), seats: new Map(), corpses: [], looks: new Map([["core_pilgred", "core_pilgred_upgrade"]]) }).frame.sx).toBe(0);
  });

  it("draws the human_tank empty until a Mush has died, then as human_tank_full with a person in it", () => {
    const tank = placed({ slice: "human_tank", width: 42, height: 62, sx: 0, sy: 1082 });
    const empty = only(scene([tank]));
    expect(empty.image.frame).toMatchObject({ sx: 0, sy: 1082, width: 42, height: 62 });
    expect(empty.anim).toMatchObject({ frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], loops: "forever" });

    const full = only(scene([tank], { looks: new Map([["human_tank", "human_tank_full"]]) }));
    expect(full.image.frame).toMatchObject({ sx: 0, sy: 1145, width: 42, height: 62 });
    expect(full.anim).toMatchObject({ frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], loops: "forever" });
    expect(imageOf(tank, { layout, room: HERE, people: new Map(), walkers: new Map(), seats: new Map(), corpses: [], looks: new Map([["human_tank", "human_tank_full"]]) }).frame.sy).toBe(1145);
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

describe("animFrame", () => {
  const swivel = { frames: [0, 1, 2, 1], frameMs: 200, loops: "forever" as const };
  it("steps through the frames and loops forever", () => {
    expect([0, 199, 200, 650, 800, 1000].map((t) => animFrame(swivel, t))).toEqual([0, 0, 1, 1, 0, 1]);
  });
  it("rests on the first frame after its rounds", () => {
    const walkIn = { frames: [0, 1, 2], frameMs: 100, loops: 2 };
    expect([250, 550, 600, 5000].map((t) => animFrame(walkIn, t))).toEqual([2, 2, 0, 0]);
  });
});

describe("animStep", () => {
  it("plays a rhythm, one length per frame, and holds the last frame", () => {
    const anim = { frames: [4, 5, 6], frameMs: [100, 300, 50], loops: "hold" as const };
    expect([0, 99, 100, 399, 400, 449, 450, 9999].map((t) => animStep(anim, t).frame)).toEqual([4, 4, 5, 5, 6, 6, 6, 6]);
    expect(animStep(anim, 150).nextIn).toBe(250);
    expect(animStep(anim, 450).nextIn).toBeUndefined();
  });
});

describe("doors", () => {
  it("open over the first animation's rhythm, in 30ths of a second", () => {
    // 1+3+2+2+1+1+1+1+1+2 ticks for the ten opening frames.
    expect(doorOpenMs(DOOR)).toBeCloseTo(500);
    expect(doorOpenMs(FRONT_DOOR)).toBe(0);
  });

  it("play opening, stand open, or play shutting, and the floor-level front doors never move", () => {
    const opening = doorAnim(DOOR, "opening")!;
    expect([animFrame(opening, 0), animFrame(opening, 5000)]).toEqual([0, 9]);
    expect(animFrame(doorAnim(DOOR, "open")!, 0)).toBe(9);
    const closing = doorAnim(DOOR, "closing")!;
    expect([animFrame(closing, 0), animFrame(closing, 5000)]).toEqual([12, 0]);
    expect(doorAnim(DOOR, undefined)).toBeUndefined();
    expect(doorAnim(FRONT_DOOR, "opening")).toBeUndefined();
  });

  it("animate a door by its key, on either side of it", () => {
    const own = placed({ key: "t5", kind: "door", slice: "door", door: { target: NEXT } });
    const theirs = placed({ key: `${NEXT}/t2`, room: NEXT, kind: "door", slice: "door", door: { target: HERE } });
    expect(scene([own, theirs]).sprites.map((s) => s.anim)).toEqual([undefined, undefined]);
    const s = scene([own, theirs], { doors: new Map([["t5", "opening"], [`${NEXT}/t2`, "closing"]]) });
    expect(s.sprites.map((p) => p.anim?.frames[0])).toEqual([0, 12]);
  });
});
