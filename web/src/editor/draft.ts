// The ship map editor's autosave (pure): the map being edited, the last 20 undo and redo steps, and what
// it was edited from, as one string for localStorage, so a reload (a hot reload, a crash, a closed tab)
// loses nothing. Edits share the rooms they don't touch (edits.ts), so each room object is written once
// and every map is a list of room numbers: twenty steps cost about one room each, not a whole map.

import type { RoomLayout, ShipMap } from "@mush2/shared";
import type { TileAt } from "./edits.ts";
import type { ShipView } from "./shipScene.ts";

/** Undo (and redo) steps kept in the autosave; the editor keeps more in memory. */
export const SAVED_STEPS = 20;

export interface Draft {
  /** What the map was last saved as or loaded from: ship-map.json as it was then. */
  base: ShipMap;
  map: ShipMap;
  past: ShipMap[];
  future: ShipMap[];
}

interface Stored {
  v: 1;
  rooms: RoomLayout[];
  base: number[];
  map: number[];
  past: number[][];
  future: number[][];
}

export function encodeDraft(d: Draft, steps = SAVED_STEPS): string {
  const rooms: RoomLayout[] = [];
  const index = new Map<RoomLayout, number>();
  const refs = (m: ShipMap) =>
    m.rooms.map((r) => {
      let i = index.get(r);
      if (i === undefined) {
        i = rooms.push(r) - 1;
        index.set(r, i);
      }
      return i;
    });
  const stored: Stored = {
    v: 1,
    base: refs(d.base),
    map: refs(d.map),
    past: steps > 0 ? d.past.slice(-steps).map(refs) : [],
    future: d.future.slice(0, steps).map(refs),
    rooms,
  };
  return JSON.stringify(stored);
}

/** The draft in `text`, or undefined if there is none or it can't be read. Rooms are shared again between its maps. */
export function decodeDraft(text: string | null): Draft | undefined {
  if (!text) return undefined;
  try {
    const s = JSON.parse(text) as Stored;
    if (s.v !== 1 || !Array.isArray(s.rooms)) return undefined;
    const map = (refs: number[]): ShipMap => {
      const rooms = refs.map((i) => s.rooms[i]);
      if (rooms.some((r) => !r)) throw new Error("bad room");
      return { rooms: rooms as RoomLayout[] };
    };
    return { base: map(s.base), map: map(s.map), past: s.past.map(map), future: s.future.map(map) };
  } catch {
    return undefined;
  }
}

/** JSON with keys sorted, so two maps compare equal however their objects were built. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const sameMap = (a: ShipMap, b: ShipMap): boolean => a === b || canonical(a) === canonical(b);

export interface Restored {
  map: ShipMap;
  /** Always the map on disk: a restored draft shows as unsaved changes against it. */
  saved: ShipMap;
  past: ShipMap[];
  future: ShipMap[];
}

/**
 * What to start the editor from, given the autosaved draft and the map on disk. "stale" when the draft
 * was edited from another version of the file than the one there now (another session saved it, or a
 * pull changed it) and has changes of its own: restoring it then would undo that, so the editor asks.
 */
export function restore(draft: Draft | undefined, disk: ShipMap): Restored | "stale" | undefined {
  if (!draft) return undefined;
  const unchanged = sameMap(draft.map, disk);
  if (!unchanged && !sameMap(draft.base, disk)) return "stale";
  return { map: unchanged ? disk : draft.map, saved: disk, past: draft.past, future: draft.future };
}

/** Where the editor was looking and what it had selected. */
export interface EditorPlace {
  zoom: number;
  cam: { x: number; y: number } | null;
  view: ShipView;
  selected: TileAt | null;
  roomSel: string | null;
}

/** The remembered place, with anything no longer on `map` dropped (a room gone, a tile index past the end). */
export function decodePlace(text: string | null, map: ShipMap, maxZoom: number): Partial<EditorPlace> {
  if (!text) return {};
  try {
    const p = JSON.parse(text) as Partial<EditorPlace>;
    const room = (id: unknown) => typeof id === "string" && map.rooms.some((r) => r.id === id);
    const out: Partial<EditorPlace> = {};
    if (Number.isInteger(p.zoom) && p.zoom! >= 1 && p.zoom! <= maxZoom) out.zoom = p.zoom;
    if (p.cam && Number.isFinite(p.cam.x) && Number.isFinite(p.cam.y)) out.cam = { x: p.cam.x, y: p.cam.y };
    if (p.view && (p.view.from === null || (room(p.view.from) && "depth" in p.view && (p.view.depth === 1 || p.view.depth === 2)))) out.view = p.view;
    const sel = p.selected;
    if (sel && room(sel.room) && Number.isInteger(sel.index) && map.rooms.find((r) => r.id === sel.room)!.tiles[sel.index]) {
      out.selected = { room: sel.room, index: sel.index };
    }
    if (room(p.roomSel)) out.roomSel = p.roomSel;
    return out;
  } catch {
    return {};
  }
}
