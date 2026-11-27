// The ship map editor (dev builds only, at /editor; #209). Draws the ship from ship-map.json with the
// game's own placement and Pixi renderer, nothing fogged, with drag to pan and whole-number zoom (an
// editor-only exception to the room view's 1x, no-panning rules, owner 2026-10-21), and edits it: select
// a tile (Tab cycles through what's stacked under the click), move it a cell at a time, delete,
// duplicate, change its frame or its room, place new tiles from the palette, undo and redo, and save
// back to the file (tools/src/editor/vitePlugin.ts). It can also show the room picked (in the hierarchy
// or the scene) alone, or the ship as the game draws it from that room at fog depth 1 or 2, where seams
// between rooms show. A room can be moved whole on the plan, and the map is checked as you edit (Checks.tsx): each problem found takes you to where it is.
//
// Laid out like a game engine's scene editor: a menu bar (File, Edit, View), a hierarchy of rooms and
// tiles with an inspector under it on the left (the split and the column's width can be dragged), the
// scene in the middle with its own toolbar (camera, what's shown, zoom, the checks) and a status bar, and
// the palette docked on the right as the assets panel. Player-facing rules don't apply here: no
// translations, and desktop only (owner 2026-10-24).

import { Menubar } from "@base-ui/react/menubar";
import { lazy, type PointerEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { placedEquipment, type RoomId, type ShipArt, type ShipLayout, type ShipMap } from "@mush2/shared";
import { opaqueAt, preloadImage } from "../iso/hitMask.ts";
import { lyingFrame } from "../art/assets.ts";
import { bounds, gridToPx, lyingPose, type PlacedSprite } from "../iso/placement.ts";
import { describeScene, type FrameTarget, type FrameUpdate, imageOf, LYING_SIZE, type Scene, type SceneImage } from "../iso/scene.ts";
import { loadShip } from "../iso/shipLayout.ts";
import {
  ARROWS,
  deleteTile,
  duplicateTile,
  kindFor,
  moveRoom,
  moveTile,
  moveToRoom,
  nudgeSleeper,
  placeTile,
  roomForCell,
  setDoorTarget,
  rotateSofa,
  sleeperData,
  sleeperStep,
  stepFrame,
  type TileAt,
  tileAt,
} from "./edits.ts";
import type { Problem } from "./checks.ts";
import { Check, EditorMenu, Heading, Item, PopoverPanel, Radios, Separator } from "./EditorMenus.tsx";
import { checkCounts, Checks, useChecks } from "./Checks.tsx";
import { Hierarchy, hideKey, LAYER_NAMES } from "./Hierarchy.tsx";
import { Inspector, isSofa } from "./Inspector.tsx";
import { decodeDraft, decodePlace, type EditorPlace, encodeDraft, type Restored, restore } from "./draft.ts";
import { Palette } from "./Palette.tsx";
import { Splitter, useStoredSize } from "./Splitter.tsx";
import {
  cellAt,
  diamonds,
  footprint,
  gridLines,
  hitAll,
  LAYERS,
  type Layer,
  layerOf,
  roomOutlines,
  type ShipView,
  shipCells,
  shipScene,
  sleeperOf,
  tileOf,
} from "./shipScene.ts";
import "./editor.css";

const PixiScene = lazy(() => import("../iso/pixi/PixiScene.tsx"));

const MAX_ZOOM = 4;
/** Undo steps kept. */
const HISTORY = 300;
/** What the checks badge calls one problem of each severity. */
const NOUN = { error: "error", warning: "warning", info: "note" } as const;
const STILL = () => ({ x: 0, y: 0 });
const NOBODY = { people: new Map(), walkers: new Map(), seats: new Map(), corpses: [] };
/** Who lies in every bed when the editor shows sleepers. */
const SLEEPER_FRAME = lyingFrame("frieda")!;
const SLEEPER_IMAGE: SceneImage = { url: SLEEPER_FRAME.url, frame: SLEEPER_FRAME, keyed: false };
/** localStorage keys for the autosave (draft.ts): the map and its history, and where the editor was looking. */
const DRAFT_KEY = "editor.draft";
const PLACE_KEY = "editor.place";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The autosaved draft to start from, if any; a stale one (edited from another version of the file) only if confirmed. */
function restoredDraft(disk: ShipMap): Restored | undefined {
  const draft = decodeDraft(readStored(DRAFT_KEY));
  const r = restore(draft, disk);
  if (r !== "stale" || !draft) return r === "stale" ? undefined : r;
  const keep = window.confirm(
    "The autosaved draft was edited from an older ship-map.json than the one on disk now (another save or a pull changed it). " +
      "Restore the draft anyway? Saving it would undo those changes. Cancel starts from the file and discards the draft.",
  );
  return keep ? { map: draft.map, saved: disk, past: draft.past, future: draft.future } : undefined;
}

const VIEW_NAMES = { ship: "whole ship", 0: "picked room only", 1: "picked room, fog 1", 2: "picked room, fog 2" } as const;

export default function ShipEditor() {
  const [ship, setShip] = useState<{ art: ShipArt; map: ShipMap; restored?: Restored; place: Partial<EditorPlace> }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    // Once only (StrictMode mounts twice in dev), so a stale draft asks once.
    let gone = false;
    loadShip().then(
      ({ rooms, ...art }) => {
        if (gone) return;
        const map = { rooms };
        const restored = restoredDraft(map);
        setShip({ art, map, restored, place: decodePlace(readStored(PLACE_KEY), restored?.map ?? map, MAX_ZOOM) });
      },
      (e: unknown) => setError(String(e)),
    );
    return () => {
      gone = true;
    };
  }, []);
  if (error) return <p className="editor-message">{error}</p>;
  if (!ship) return <p className="editor-message">Loading the ship…</p>;
  return <Editor art={ship.art} initial={ship.map} restored={ship.restored} place={ship.place} />;
}

type SaveState = { state: "clean" | "dirty" | "saving" | "saved" } | { state: "failed"; errors: string[] };

function Editor({ art, initial, restored, place: start }: { art: ShipArt; initial: ShipMap; restored?: Restored; place: Partial<EditorPlace> }) {
  // The map, what was last saved (or loaded), and the undo and redo stacks: from the autosave if there is one.
  const [map, setMap] = useState(restored?.map ?? initial);
  const [saved, setSaved] = useState(restored?.saved ?? initial);
  const [past, setPast] = useState<ShipMap[]>(restored?.past ?? []);
  const [future, setFuture] = useState<ShipMap[]>(restored?.future ?? []);
  const [save, setSave] = useState<SaveState>({ state: "clean" });
  const [selected, setSelected] = useState<TileAt | null>(start.selected ?? null);
  // The room the room tools act on: the selected tile's, or one picked from the list.
  const [roomSel, setRoomSel] = useState<string | null>(start.roomSel ?? start.selected?.room ?? null);
  const [picked, setPicked] = useState<Problem | null>(null);
  const [message, setMessage] = useState<string | undefined>(restored && restored.map !== restored.saved ? "Restored the unsaved changes from the autosave." : undefined);
  const dirty = map !== saved;
  // What was under the last click, front first: Tab steps through it.
  const stack = useRef<{ keys: string[]; at: number }>({ keys: [], at: 0 });

  const commit = (next: ShipMap, select: TileAt | null = selected) => {
    setPast((p) => [...p.slice(-(HISTORY - 1)), map]);
    setFuture([]);
    if (select !== selected) stack.current = { keys: [], at: 0 };
    setMap(next);
    setSelected(select);
    if (select) setRoomSel(select.room);
    setMessage(undefined);
    if (save.state === "failed") setSave({ state: "dirty" });
  };
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([map, ...future]);
    setMap(prev);
    setSelected(null);
    stack.current = { keys: [], at: 0 };
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, map]);
    setMap(next);
    setSelected(null);
    stack.current = { keys: [], at: 0 };
  };
  const doSave = async () => {
    setSave({ state: "saving" });
    const sent = map;
    try {
      const r = await fetch("/__editor/map", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) });
      const body = (await r.json().catch(() => ({}))) as { errors?: string[] };
      if (!r.ok) return setSave({ state: "failed", errors: body.errors ?? [`HTTP ${r.status}`] });
      setSaved(sent);
      setSave({ state: "saved" });
    } catch (e) {
      setSave({ state: "failed", errors: [String(e)] });
    }
  };
  const revert = async () => {
    if (dirty && !window.confirm("Throw away the changes since the last save?")) return;
    const { rooms } = await loadShip();
    const fresh = { rooms };
    setMap(fresh);
    setSaved(fresh);
    setPast([]);
    setFuture([]);
    setSelected(null);
    setSave({ state: "clean" });
  };
  // Autosave on every change (draft.ts), so a reload of any kind loses nothing. If the browser won't
  // hold the history too, the map alone is kept.
  const autosaveFailed = useRef(false);
  useEffect(() => {
    const draft = { base: saved, map, past, future };
    const ok = writeStored(DRAFT_KEY, encodeDraft(draft)) || writeStored(DRAFT_KEY, encodeDraft(draft, 0));
    if (!ok && !autosaveFailed.current) setMessage("Autosave failed: this browser won't store the draft. Save often.");
    autosaveFailed.current = !ok;
  }, [saved, map, past, future]);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const layout: ShipLayout = useMemo(() => ({ ...art, ...map }), [art, map]);
  // What's drawn: the whole ship, or the picked room alone or at a fog depth. The room views follow the
  // picked room, so picking another (in the hierarchy or the scene) redraws from it; with none picked, or
  // one off the plan, the whole ship shows.
  const [viewMode, setViewMode] = useState<"ship" | 0 | 1 | 2>(start.view?.from ? start.view.depth : "ship");
  const view: ShipView = useMemo(
    () => (viewMode !== "ship" && roomSel && map.rooms.find((r) => r.id === roomSel)?.at ? { from: roomSel, depth: viewMode } : { from: null }),
    [viewMode, roomSel, map],
  );
  // Sleepers lie mirrored where their bed says so, as in the game (IsoRoom); hit-testing mirrors with them.
  const placed = useMemo(
    () =>
      shipScene(layout, view, LYING_SIZE).map((s) => {
        const bed = sleeperOf(s.key);
        const room = bed && layout.rooms.find((r) => r.id === bed.room);
        return room && lyingPose(layout, room, bed.index)?.flip ? { ...s, flipX: true } : s;
      }),
    [layout, view],
  );
  const box = useMemo(() => bounds(shipScene({ ...art, ...initial })), [art, initial]);
  const outlines = useMemo(() => roomOutlines(layout), [layout]);
  const cells = useMemo(() => shipCells(layout), [layout]);
  const grid = useMemo(() => gridLines(cells), [cells]);
  const imageInput = useMemo(() => ({ layout, room: "" as RoomId, ...NOBODY }), [layout]);
  const planRooms = useMemo(() => map.rooms.filter((r) => r.at).map((r) => r.id).sort(), [map]);
  const checks = useChecks(art, map);

  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set());
  const [showGrid, setShowGrid] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [showSleepers, setShowSleepers] = useState(true);
  // Rooms and rooms' layers hidden from the hierarchy (hideKey), on top of the layers hidden for all.
  const [hiddenIn, setHiddenIn] = useState<ReadonlySet<string>>(new Set());
  const visible = useMemo(
    () =>
      placed.filter((s) => {
        if (s.kind === "actor") return showSleepers && !hiddenIn.has(s.room);
        const l = layerOf(s.kind)!;
        return !hidden.has(l) && !hiddenIn.has(s.room) && !hiddenIn.has(hideKey(s.room, l));
      }),
    [placed, hidden, hiddenIn, showSleepers],
  );
  const toggleIn = (key: string) => {
    const next = new Set(hiddenIn);
    if (!next.delete(key)) next.add(key);
    setHiddenIn(next);
  };
  const toggleLayer = (l: Layer, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(l);
    else next.add(l);
    setHidden(next);
  };
  const [showAssets, setShowAssets] = useState(true);
  const [columnWidth, setColumnWidth] = useStoredSize("column", 300);
  const [inspectorHeight, setInspectorHeight] = useStoredSize("inspector", 320);
  const [assetsWidth, setAssetsWidth] = useStoredSize("assets", 280);

  /** Sprite key -> map tile, and back. */
  const { tileOfKey, keyOfTile } = useMemo(() => {
    const tileOfKey = new Map<string, TileAt>();
    const keyOfTile = new Map<string, string>();
    for (const s of placed) {
      // Clicking a sleeper picks their bed.
      const bed = sleeperOf(s.key);
      if (bed) {
        tileOfKey.set(s.key, bed);
        continue;
      }
      const ref = tileOf(layout, s);
      if (!ref) continue;
      tileOfKey.set(s.key, { room: ref.room.id, index: ref.index });
      keyOfTile.set(`${ref.room.id}#${ref.index}`, s.key);
    }
    return { tileOfKey, keyOfTile };
  }, [placed, layout]);
  const selectedKey = selected ? keyOfTile.get(`${selected.room}#${selected.index}`) : undefined;

  // Everything lit: describeScene fogs every room that isn't "yours", so its effects are dropped.
  const base = useMemo(() => {
    const d = describeScene({
      ...imageInput,
      placed: visible,
      box,
      doors: new Map(),
      beds: new Map(),
      equipment: new Map(),
      reachable: new Set(),
      selected: null,
      selectedDoor: null,
      hoverKey: null,
      ownCells: new Set(),
    });
    // Sleepers are nobody in particular: drawn in the lying frame, mirrored with their bed, as tiles.
    const sprites = d.sprites.map(({ effect: _, ...s }) => {
      const p = sleeperOf(s.key) && visible.find((v) => v.key === s.key);
      return p ? { ...s, image: SLEEPER_IMAGE, flipX: p.flipX || undefined, role: "tile" as const, shadow: "lying" as const } : s;
    });
    return { ...d, sprites, outlines: d.outlines.filter((o) => !sleeperOf(o.key)) };
  }, [imageInput, visible, box]);
  const imageFor = useCallback((s: PlacedSprite) => (sleeperOf(s.key) ? SLEEPER_IMAGE : imageOf(s, imageInput)), [imageInput]);

  // Load every atlas, so hit-testing reads drawn pixels from the first hover.
  useEffect(() => {
    for (const s of placed) {
      const url = imageFor(s).url;
      if (url) preloadImage(url);
    }
  }, [placed, imageFor]);

  const [hover, setHover] = useState<{ key: string | undefined; cell: { x: number; y: number } }>();
  const scene: Scene = useMemo(() => {
    if (!hover?.key && !selectedKey) return base;
    const effect = (key: string) => (key === selectedKey ? ("selected" as const) : key === hover?.key ? ("hover" as const) : undefined);
    return { ...base, sprites: base.sprites.map((s) => (effect(s.key) ? { ...s, effect: effect(s.key) } : s)) };
  }, [base, hover?.key, selectedKey]);

  // The camera: where the world's top-left is, in unzoomed pixels from the viewport's top-left. Until
  // the first pan or zoom, the ship is centred.
  const viewport = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = viewport.current!;
    const measure = () => setPanel({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const [zoom, setZoom] = useState(start.zoom ?? 2);
  const [cam, setCam] = useState<{ x: number; y: number } | null>(start.cam ?? null);
  // Where the editor is looking and what's selected, remembered for the next load.
  useEffect(() => {
    writeStored(PLACE_KEY, JSON.stringify({ zoom, cam, view, selected, roomSel } satisfies EditorPlace));
  }, [zoom, cam, view, selected, roomSel]);
  const camera = cam ?? { x: Math.round((panel.width / zoom - box.width) / 2), y: Math.round((panel.height / zoom - box.height) / 2) };

  const frame = useRef<FrameUpdate>({ camera, offsetOf: STILL });
  frame.current = { camera, offsetOf: STILL };
  const renderer = useRef<FrameTarget | null>(null);
  const rendererRef = useCallback((r: FrameTarget | null) => {
    renderer.current = r;
    r?.setFrame(frame.current);
  }, []);
  useEffect(() => {
    renderer.current?.setFrame({ camera: { x: camera.x, y: camera.y }, offsetOf: STILL });
  }, [camera.x, camera.y]);

  /** Placement pixels under the pointer. */
  const pointIn = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom - camera.x + box.minX, y: (clientY - rect.top) / zoom - camera.y + box.minY };
  };
  const opaque = (s: PlacedSprite, px: number, py: number) => {
    const { url, frame, keyed } = imageFor(s);
    return !url || opaqueAt(url, frame, px, py, keyed);
  };
  const hoverAt = (clientX: number, clientY: number) => {
    const { x, y } = pointIn(clientX, clientY);
    setHover({ key: hitAll(visible, x, y, opaque)[0]?.key, cell: cellAt(x, y) });
  };

  const [armed, setArmed] = useState<string | null>(null);
  const [newRoom, setNewRoom] = useState<string>("auto");

  const place = (cell: { x: number; y: number }) => {
    const room = newRoom !== "auto" ? newRoom : (roomForCell(map, cell) ?? selected?.room);
    if (!room) return setMessage("No room has anything near that cell: pick a room for new tiles.");
    const { kind, layer } = kindFor(map, art, armed!);
    const r = placeTile(map, room, cell, { kind, layer, slice: armed!, frame: 0, ...(kind === "door" && { door: { target: "" } }) });
    commit(r.map, r.at);
    if (kind === "door") setMessage("A new door: give it a room to go to before saving.");
  };
  const click = (clientX: number, clientY: number) => {
    const { x, y } = pointIn(clientX, clientY);
    if (armed) return place(cellAt(x, y));
    const keys = hitAll(visible, x, y, opaque).map((s) => s.key);
    stack.current = { keys, at: 0 };
    const hit = (keys[0] && tileOfKey.get(keys[0])) || null;
    setSelected(hit);
    if (hit) setRoomSel(hit.room);
    hoverAt(clientX, clientY);
  };

  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Clicking the ship takes the keys back from a search box or a list.
    (document.activeElement as HTMLElement | null)?.blur();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: camera };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setCam({ x: Math.round(d.from.x + (e.clientX - d.x) / zoom), y: Math.round(d.from.y + (e.clientY - d.y) / zoom) });
    else if (e.pointerType === "mouse") hoverAt(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    // A click that didn't drag selects (or places).
    if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) click(e.clientX, e.clientY);
  };

  /** Zooms to `to`, keeping the point under (clientX, clientY), or the middle of the viewport, where it is. */
  const zoomTo = (to: number, clientX?: number, clientY?: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, to));
    if (z === zoom) return;
    const rect = viewport.current!.getBoundingClientRect();
    const sx = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const sy = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setCam({ x: Math.round(sx / z - (sx / zoom - camera.x)), y: Math.round(sy / z - (sy / zoom - camera.y)) });
    setZoom(z);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => zoomTo(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);

  // The selection's edits, shared by the keys and the buttons.
  const sel = selected && tileAt(map, selected) ? selected : null;
  const edit = {
    move: (dx: number, dy: number) => sel && commit(moveTile(map, sel, dx, dy)),
    remove: () => sel && commit(deleteTile(map, sel), null),
    duplicate: () => {
      if (!sel) return;
      const r = duplicateTile(map, sel);
      commit(r.map, r.at);
    },
    frame: (step: number) => sel && commit(stepFrame(map, art, sel, step)),
    rotate: () => sel && commit(rotateSofa(map, sel)),
    toRoom: (room: string) => {
      const r = sel && moveToRoom(map, sel, room);
      if (r) commit(r.map, r.at);
    },
    doorTo: (room: string) => sel && commit(setDoorTarget(map, sel, room)),
    moveRoom: (dx: number, dy: number) => roomSel && commit(moveRoom(map, roomSel, dx, dy)),
    nudgeSleeper: (dx: number, dy: number) => sel && sleeperData(map, sel) && commit(nudgeSleeper(map, sel, dx, dy)),
  };
  const cycle = (step: number) => {
    const { keys, at } = stack.current;
    if (keys.length < 2) return;
    const next = (at + step + keys.length) % keys.length;
    stack.current = { keys, at: next };
    const hit = tileOfKey.get(keys[next]!) ?? null;
    setSelected(hit);
    if (hit) setRoomSel(hit.room);
  };

  /** Takes you to a problem: its view if it only shows in one, its tile or room selected, its first cell in the middle. */
  const jump = (p: Problem) => {
    setPicked(p);
    if (p.tile) {
      setSelected(p.tile);
      stack.current = { keys: [], at: 0 };
    }
    if (p.room) setRoomSel(p.room);
    // A problem that shows from one room only: draw from it, which picks that room.
    if (p.view) {
      setViewMode(p.view.from ? p.view.depth : "ship");
      if (p.view.from) setRoomSel(p.view.from);
    }
    const cell = p.cells[0];
    if (cell) centreOn(cell[0], cell[1]);
  };
  /** Puts cell (x, y) in the middle of the view. */
  const centreOn = (x: number, y: number) => {
    const at = gridToPx(x + 0.5, y + 0.5);
    setCam({ x: Math.round(panel.width / zoom / 2 + box.minX - at.x), y: Math.round(panel.height / zoom / 2 + box.minY - at.y) });
  };
  /** Frames the selected tile, or the room picked, as a game engine's F does. */
  const frameSelection = () => {
    const t = sel && tileAt(map, sel);
    const r = map.rooms.find((r) => r.id === (sel?.room ?? roomSel));
    if (!r?.at) return;
    if (t) return centreOn(t.x + r.at.x, t.y + r.at.y);
    const o = outlines.find((o) => o.id === r.id);
    if (o) setCam({ x: Math.round(panel.width / zoom / 2 + box.minX - o.x), y: Math.round(panel.height / zoom / 2 + box.minY - o.y) });
  };
  // The picked problem as it is now: gone once it is fixed.
  const pickedNow = picked && checks.problems ? (checks.problems.find((p) => p.id === picked.id) ?? null) : picked;

  // Keys work anywhere but in a text field or a list.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    // Menus and the splitters take their own arrow keys.
    if (e.defaultPrevented || t.closest("input, select, textarea, [role=menu], [role=menubar], [role=separator]")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const arrow = ARROWS[k];
    if (mod && k.toLowerCase() === "s") void doSave();
    else if (mod && k.toLowerCase() === "z") e.shiftKey ? redo() : undo();
    else if (mod && k.toLowerCase() === "y") redo();
    else if (mod && k.toLowerCase() === "d") edit.duplicate();
    else if (arrow && e.altKey && sel) {
      const step = sleeperStep(k, e.shiftKey)!;
      edit.nudgeSleeper(step.x, step.y);
    }
    else if (arrow && e.shiftKey && roomSel) edit.moveRoom(arrow.dx, arrow.dy);
    else if (arrow && sel) edit.move(arrow.dx, arrow.dy);
    else if ((k === "Delete" || k === "Backspace") && sel) edit.remove();
    else if (k === "[" && sel) edit.frame(-1);
    else if (k === "]" && sel) edit.frame(1);
    else if (k.toLowerCase() === "r" && !mod && sel) edit.rotate();
    else if (k.toLowerCase() === "f" && !mod) frameSelection();
    else if (k === "Tab" && stack.current.keys.length > 1) cycle(e.shiftKey ? -1 : 1);
    else if (k === "Escape") {
      if (armed) setArmed(null);
      else if (sel) setSelected(null);
      else {
        setRoomSel(null);
        setPicked(null);
      }
    }
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hit = hover?.key ? tileOfKey.get(hover.key) : undefined;
  const hoverRoom = hit && map.rooms.find((r) => r.id === hit.room);
  const hoverTile = hit && tileAt(map, hit);
  const selRoom = sel && map.rooms.find((r) => r.id === sel.room)!;
  const selTile = sel && tileAt(map, sel)!;
  const focusRoom = roomSel ? map.rooms.find((r) => r.id === roomSel) : undefined;
  const selEquipment =sel && placedEquipment(selRoom!).find((p) => p.tile === sel.index);
  const floorsHere = hover
    ? map.rooms.filter((r) => r.at && r.tiles.some((t) => t.kind === "ground" && t.x + r.at!.x === hover.cell.x && t.y + r.at!.y === hover.cell.y))
    : [];
  const offPlan = map.rooms.length - planRooms.length;
  const labels: { x: number; y: number; at: { x: number; y: number } }[] = [];
  if (showGrid) {
    for (let x = Math.ceil(cells.x0 / 10) * 10; x <= cells.x1; x += 10) {
      for (let y = Math.ceil(cells.y0 / 10) * 10; y <= cells.y1; y += 10) labels.push({ x, y, at: gridToPx(x, y) });
    }
  }
  const tiles = map.rooms.reduce((n, r) => n + r.tiles.length, 0);
  const saveLabel = save.state === "saving" ? "Saving…" : save.state === "failed" ? "Not saved" : dirty ? "Unsaved changes" : "Saved";

  const counts = checkCounts(checks.problems);
  const viewName = VIEW_NAMES[viewMode] + (viewMode !== "ship" && !view.from ? " (none picked)" : "");
  const selectTile = (at: TileAt) => {
    stack.current = { keys: [], at: 0 };
    setSelected(at);
    setRoomSel(at.room);
  };
  const selectRoom = (id: string) => {
    stack.current = { keys: [], at: 0 };
    setSelected(null);
    setRoomSel(id);
  };

  return (
    <div className="editor">
      <header className="editor-menubar">
        <Menubar className="editor-menus">
          <EditorMenu label="File">
            <Item onClick={() => void doSave()} disabled={!dirty || save.state === "saving"} keys="Ctrl+S">
              Save
            </Item>
            <Item onClick={() => void revert()}>Reload file</Item>
          </EditorMenu>
          <EditorMenu label="Edit">
            <Item onClick={undo} disabled={!past.length} keys="Ctrl+Z">
              Undo
            </Item>
            <Item onClick={redo} disabled={!future.length} keys="Ctrl+Shift+Z">
              Redo
            </Item>
            <Separator />
            <Item onClick={edit.duplicate} disabled={!sel} keys="Ctrl+D">
              Duplicate
            </Item>
            <Item onClick={edit.remove} disabled={!sel} keys="Delete">
              Delete
            </Item>
            <Item onClick={() => edit.frame(-1)} disabled={!sel} keys="[">
              Previous frame
            </Item>
            <Item onClick={() => edit.frame(1)} disabled={!sel} keys="]">
              Next frame
            </Item>
            <Item onClick={edit.rotate} disabled={!selTile || !isSofa(selTile)} keys="R">
              Rotate sofa
            </Item>
            <Separator />
            <Item
              onClick={() => {
                setSelected(null);
                setRoomSel(null);
              }}
              disabled={!sel && !roomSel}
            >
              Select nothing
            </Item>
          </EditorMenu>
          <EditorMenu label="View">
            <Item onClick={frameSelection} disabled={!sel && !roomSel} keys="F">
              Frame selection
            </Item>
            <Item onClick={() => setCam(null)}>Centre the ship</Item>
            <Item onClick={() => zoomTo(zoom + 1)} disabled={zoom >= MAX_ZOOM}>
              Zoom in
            </Item>
            <Item onClick={() => zoomTo(zoom - 1)} disabled={zoom <= 1}>
              Zoom out
            </Item>
            <Separator />
            <Check checked={showAssets} onChange={setShowAssets}>
              Assets panel
            </Check>
          </EditorMenu>
        </Menubar>
        <h1>Ship map</h1>
        <span className="spacer" />
        {save.state === "failed" ? (
          <PopoverPanel label="Not saved: why" className="save-state failed" trigger="Not saved ▾" align="end">
            <ul className="editor-errors">
              {save.errors.slice(0, 12).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {save.errors.length > 12 && <li>… {save.errors.length - 12} more</li>}
            </ul>
          </PopoverPanel>
        ) : (
          <span className={`save-state${dirty ? " dirty" : ""}`}>{saveLabel}</span>
        )}
        <PopoverPanel label="Keyboard shortcuts" trigger="Keys" align="end">
          <dl className="editor-keys">
            <dt>Arrows</dt>
            <dd>move the selection a cell: ↑ up-right, → down-right, ↓ down-left, ← up-left</dd>
            <dt>Shift+arrows</dt>
            <dd>move the selected tile's room (or the room picked in the hierarchy) a cell</dd>
            <dt>Alt+arrows</dt>
            <dd>move the selected bed's sleeper half a cell the arrow's way (2px across, 1px down or up)</dd>
            <dt>Alt+Shift+arrows</dt>
            <dd>move the selected bed's sleeper 1px up, right, down or left</dd>
            <dt>Tab, Shift+Tab</dt>
            <dd>the next or previous thing under the last click</dd>
            <dt>F</dt>
            <dd>frame the selection</dd>
            <dt>Delete</dt>
            <dd>delete it</dd>
            <dt>Ctrl+D</dt>
            <dd>duplicate it (on the same cell)</dd>
            <dt>[ ]</dt>
            <dd>previous or next frame</dd>
            <dt>R</dt>
            <dd>rotate a sofa</dd>
            <dt>Ctrl+Z, Ctrl+Shift+Z</dt>
            <dd>undo, redo</dd>
            <dt>Ctrl+S</dt>
            <dd>save</dd>
            <dt>Escape</dt>
            <dd>stop placing, or clear the selection, then the room and the picked problem</dd>
            <dt>Drag, wheel</dt>
            <dd>pan, zoom</dd>
          </dl>
        </PopoverPanel>
      </header>

      <div className="editor-main">
        <aside className="editor-column" style={{ width: columnWidth }}>
          <Hierarchy
            map={map}
            selected={sel}
            roomSel={roomSel}
            hidden={hiddenIn}
            onToggleHidden={toggleIn}
            onSelectTile={selectTile}
            onSelectRoom={selectRoom}
          />
          <Splitter axis="y" size={inspectorHeight} onSize={setInspectorHeight} min={120} max={Math.max(160, window.innerHeight - 200)} invert label="Resize the inspector" />
          <div className="editor-inspector-slot" style={{ height: inspectorHeight }}>
            <Inspector
              map={map}
              sel={sel}
              tile={selTile}
              room={selRoom}
              equipment={selEquipment || undefined}
              sleeper={sel ? sleeperData(map, sel) : undefined}
              stack={stack.current.keys.length > 1 ? { at: stack.current.at, of: stack.current.keys.length } : null}
              focusRoom={focusRoom}
              planRooms={planRooms}
              edit={edit}
            />
          </div>
        </aside>
        <Splitter axis="x" size={columnWidth} onSize={setColumnWidth} min={200} max={600} label="Resize the hierarchy column" />

        <main className="editor-scene">
          <div className="editor-scene-toolbar" role="toolbar" aria-label="Scene">
            <EditorMenu label={`View: ${viewName} ▾`}>
              <Radios
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "ship", label: "Whole ship" },
                  { value: 0, label: "Picked room only" },
                  { value: 1, label: "Picked room, fog depth 1" },
                  { value: 2, label: "Picked room, fog depth 2" },
                ]}
              />
              {viewMode !== "ship" && !view.from && <Heading>Pick a room on the plan to draw from it</Heading>}
            </EditorMenu>
            <EditorMenu label="Show ▾">
              <Heading>Layers</Heading>
              {LAYERS.map((l) => (
                <Check key={l} checked={!hidden.has(l)} onChange={(on) => toggleLayer(l, on)}>
                  {LAYER_NAMES[l]}
                </Check>
              ))}
              <Separator />
              <Heading>Overlays</Heading>
              <Check checked={showGrid} onChange={setShowGrid}>
                Grid
              </Check>
              <Check checked={showRooms} onChange={setShowRooms}>
                Room outlines
              </Check>
              <Check checked={showSleepers} onChange={setShowSleepers}>
                Sleepers in beds
              </Check>
              {hiddenIn.size > 0 && (
                <>
                  <Separator />
                  <Item onClick={() => setHiddenIn(new Set())}>Show what the hierarchy hides ({hiddenIn.size})</Item>
                </>
              )}
            </EditorMenu>
            <div className="editor-zoom" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom - 1)} disabled={zoom <= 1}>
                −
              </button>
              <span>{zoom}x</span>
              <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom + 1)} disabled={zoom >= MAX_ZOOM}>
                +
              </button>
            </div>
            <span className="spacer" />
            <PopoverPanel
              label="Checks"
              className={`checks-badge ${checks.failed ? "error" : (counts[0]?.severity ?? "clear")}`}
              align="end"
              trigger={
                <>
                  {checks.failed
                    ? "Checks failed"
                    : !checks.problems
                      ? "Checking…"
                      : counts.length
                        ? counts.map((c) => `${c.count} ${NOUN[c.severity]}${c.count > 1 ? "s" : ""}`).join(" · ")
                        : "All clear"}
                  {checks.checking && checks.problems && " …"} ▾
                </>
              }
            >
              <Checks problems={checks.problems} checking={checks.checking} failed={checks.failed} picked={pickedNow?.id ?? null} onPick={jump} />
            </PopoverPanel>
          </div>
            <div
              ref={viewport}
              className={`editor-viewport${armed ? " placing" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerLeave={() => !drag.current && setHover(undefined)}
              onWheel={onWheel}
            >
              <div className="editor-world" style={{ width: panel.width / zoom, height: panel.height / zoom, transform: `scale(${zoom})` }}>
                <Suspense fallback={null}>
                  <PixiScene scene={scene} ref={rendererRef} />
                </Suspense>
                <svg
                  className="editor-overlay"
                  width={box.width}
                  height={box.height}
                  viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
                  style={{ transform: `translate(${camera.x}px, ${camera.y}px)` }}
                  aria-hidden="true"
                >
                  {showGrid && (
                    <>
                      <path className="grid-minor" d={grid.minor} />
                      <path className="grid-major" d={grid.major} />
                      {labels.map((l) => (
                        <text key={`${l.x},${l.y}`} className="grid-label" x={l.at.x} y={l.at.y - 2} fontSize={11 / zoom}>
                          {l.x},{l.y}
                        </text>
                      ))}
                    </>
                  )}
                  {showRooms &&
                    outlines.map((o) => (
                      <g key={o.id}>
                        <path className={o.id === roomSel ? "room-outline selected" : "room-outline"} d={o.path} />
                        <text className="room-label" x={o.x} y={o.y} fontSize={12 / zoom}>
                          {o.label}
                        </text>
                      </g>
                    ))}
                  {pickedNow && pickedNow.cells.length > 0 && (
                    <path className={`problem-cells ${pickedNow.severity}`} d={diamonds(pickedNow.cells.map(([x, y]) => ({ x, y })))} />
                  )}
                  {hover && <path className={armed ? "place-cell" : "hover-cell"} d={diamonds([hover.cell])} />}
                  {hoverRoom && hoverTile && <path className="hover-footprint" d={diamonds(footprint(layout, hoverRoom, hoverTile))} />}
                  {selRoom && selTile && <path className="selected-footprint" d={diamonds(footprint(layout, selRoom, selTile))} />}
                </svg>
              </div>
            </div>
          <footer className="editor-status">
            {armed && (
              <span className="placing">
                Placing <b>{armed}</b>: click a cell · Esc to stop
              </span>
            )}
            <span role="status" className="editor-note">
              {message}
            </span>
            <span>
              {!hover ? (
                <span className="muted">Point at the ship.</span>
              ) : (
                <>
                  Cell {hover.cell.x}, {hover.cell.y}
                  {floorsHere.length > 0 && <> · floor of {floorsHere.map((r) => r.id).join(", ")}</>}
                  {hit && hoverTile && (
                    <>
                      {" "}
                      · {hit.room} #{hit.index}: {hoverTile.slice} frame {hoverTile.frame} ({hoverTile.kind})
                      {hoverTile.door && <> · door to {hoverTile.door.target || "nowhere"}</>}
                    </>
                  )}
                </>
              )}
            </span>
            <span className="spacer" />
            <span className="muted">
              {planRooms.length} rooms on the plan ({offPlan} off it), {tiles} tiles
            </span>
          </footer>
        </main>

        {showAssets && (
          <>
            <Splitter axis="x" size={assetsWidth} onSize={setAssetsWidth} min={200} max={520} invert label="Resize the assets panel" />
            <aside className="editor-pane editor-assets" style={{ width: assetsWidth }} aria-label="Assets">
              <header className="editor-pane-head">
                <h2>Assets</h2>
                <button type="button" className="editor-close" aria-label="Close the assets panel" onClick={() => setShowAssets(false)}>
                  ×
                </button>
              </header>
              <div className="editor-pane-body">
                <label className="editor-field">
                  New tiles go in{" "}
                  <select value={newRoom} onChange={(e) => setNewRoom(e.target.value)}>
                    <option value="auto">the room with floor or tiles there</option>
                    {planRooms.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <Palette layout={layout} armed={armed} onArm={setArmed} />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
