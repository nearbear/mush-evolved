import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipMap } from "@mush2/shared";
import { decodeDraft, decodePlace, encodeDraft, restore, SAVED_STEPS, sameMap } from "../../src/editor/draft.ts";

const room = (id: string, x = 0): RoomLayout => ({ id, tiles: [{ kind: "floor", layer: "floor", slice: "f", frame: 0, x, y: 0 }] }) as unknown as RoomLayout;
const a = room("a");
const b = room("b");
const disk: ShipMap = { rooms: [a, b] };
const edited: ShipMap = { rooms: [a, room("b", 1)] };

describe("encodeDraft / decodeDraft", () => {
  it("round-trips the map and its history", () => {
    const d = decodeDraft(encodeDraft({ base: disk, map: edited, past: [disk], future: [] }))!;
    expect(d.map).toEqual(edited);
    expect(d.base).toEqual(disk);
    expect(d.past).toEqual([disk]);
    expect(d.future).toEqual([]);
  });

  it("writes a room shared between maps once", () => {
    const text = encodeDraft({ base: disk, map: edited, past: [disk, disk], future: [disk] });
    expect(JSON.parse(text).rooms).toHaveLength(3);
    const d = decodeDraft(text)!;
    expect(d.map.rooms[0]).toBe(d.base.rooms[0]);
  });

  it(`keeps only the last ${SAVED_STEPS} undo steps`, () => {
    const past = Array.from({ length: 30 }, (_, i) => ({ rooms: [room("a", i)] }));
    const d = decodeDraft(encodeDraft({ base: disk, map: edited, past, future: [] }))!;
    expect(d.past).toHaveLength(SAVED_STEPS);
    expect(d.past.at(-1)).toEqual(past.at(-1));
  });

  it("reads nothing from missing or broken text", () => {
    expect(decodeDraft(null)).toBeUndefined();
    expect(decodeDraft("{")).toBeUndefined();
    expect(decodeDraft(JSON.stringify({ v: 1, rooms: [], base: [0], map: [], past: [], future: [] }))).toBeUndefined();
  });
});

describe("restore", () => {
  it("restores changes made on the map that is on disk, as unsaved", () => {
    const r = restore({ base: { rooms: [room("a"), room("b")] }, map: edited, past: [disk], future: [] }, disk);
    expect(r).toEqual({ map: edited, saved: disk, past: [disk], future: [] });
    expect(r !== "stale" && r!.saved).toBe(disk);
  });

  it("starts clean when the draft is the map on disk, keeping the history", () => {
    const r = restore({ base: edited, map: { rooms: [room("a"), room("b")] }, past: [edited], future: [] }, disk);
    expect(r !== "stale" && r!.map).toBe(disk);
  });

  it("calls a draft stale when the file changed under it", () => {
    expect(restore({ base: { rooms: [room("a", 5), b] }, map: edited, past: [], future: [] }, disk)).toBe("stale");
  });

  it("compares maps whatever order their keys were written in", () => {
    const t = { y: 0, x: 0, frame: 0, slice: "f", layer: "floor", kind: "floor" };
    expect(sameMap({ rooms: [{ tiles: [t], id: "a" } as unknown as RoomLayout, b] }, disk)).toBe(true);
  });
});

describe("decodePlace", () => {
  it("keeps what is still on the map and drops the rest", () => {
    const text = JSON.stringify({ zoom: 3, cam: { x: 4, y: 5 }, view: { from: "a", depth: 2 }, selected: { room: "b", index: 0 }, roomSel: "b" });
    expect(decodePlace(text, disk, 4)).toEqual({ zoom: 3, cam: { x: 4, y: 5 }, view: { from: "a", depth: 2 }, selected: { room: "b", index: 0 }, roomSel: "b" });
    const gone = JSON.stringify({ zoom: 9, view: { from: "zz", depth: 1 }, selected: { room: "b", index: 3 }, roomSel: "zz" });
    expect(decodePlace(gone, disk, 4)).toEqual({});
    expect(decodePlace(JSON.stringify({ view: { from: "a", depth: 0 } }), disk, 4)).toEqual({ view: { from: "a", depth: 0 } });
    expect(decodePlace(JSON.stringify({ view: { from: "a", depth: 3 } }), disk, 4)).toEqual({});
    expect(decodePlace("nope", disk, 4)).toEqual({});
  });
});
