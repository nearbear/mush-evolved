// The ship map editor (dev builds only, at /editor; #209). Draws the ship from ship-map.json with the
// game's own placement and Pixi renderer, nothing fogged, with drag to pan and whole-number zoom (an
// editor-only exception to the room view's 1x, no-panning rules, owner 2026-10-21), and edits it: select
// a tile (Tab cycles through what's stacked under the click), move it a cell at a time, delete,
// duplicate, change its frame or its room, place new tiles from the palette, undo and redo, and save
// back to the file (tools/src/editor/vitePlugin.ts). It can also show the ship as the game draws it from
// one room at fog depth 1 or 2, where seams between rooms show. Player-facing rules don't apply here
// (no translations, desktop first), but every action has a button, so it works on a phone.

import { lazy, type PointerEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { placedEquipment, type RoomId, type ShipArt, type ShipLayout, type ShipMap } from "@mush2/shared";
import { opaqueAt, preloadImage } from "../iso/hitMask.ts";
import { bounds, gridToPx, type PlacedSprite } from "../iso/placement.ts";
import { describeScene, type FrameTarget, type FrameUpdate, imageOf, type Scene } from "../iso/scene.ts";
import { loadShip } from "../iso/shipLayout.ts";
import {
  ARROWS,
  deleteTile,
  duplicateTile,
  kindFor,
  moveTile,
  moveToRoom,
  placeTile,
  roomForCell,
  setDoorTarget,
  stepFrame,
  type TileAt,
  tileAt,
} from "./edits.ts";
import { Palette } from "./Palette.tsx";
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
  tileOf,
} from "./shipScene.ts";
import "./editor.css";

const PixiScene = lazy(() => import("../iso/pixi/PixiScene.tsx"));

const MAX_ZOOM = 4;
/** Undo steps kept. */
const HISTORY = 300;
const LAYER_NAMES: Record<Layer, string> = { ground: "Floor", wall: "Walls and doors", prop: "Props", entity: "Furniture and fittings" };
const STILL = () => ({ x: 0, y: 0 });
const NOBODY = { people: new Map(), walkers: new Map(), seats: new Map(), corpses: [] };

export default function ShipEditor() {
  const [ship, setShip] = useState<{ art: ShipArt; map: ShipMap }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadShip().then(({ rooms, ...art }) => setShip({ art, map: { rooms } }), (e: unknown) => setError(String(e)));
  }, []);
  if (error) return <p className="editor-message">{error}</p>;
  if (!ship) return <p className="editor-message">Loading the ship…</p>;
  return <Editor art={ship.art} initial={ship.map} />;
}

type SaveState = { state: "clean" | "dirty" | "saving" | "saved" } | { state: "failed"; errors: string[] };

function Editor({ art, initial }: { art: ShipArt; initial: ShipMap }) {
  // The map, what was last saved (or loaded), and the undo and redo stacks.
  const [map, setMap] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [past, setPast] = useState<ShipMap[]>([]);
  const [future, setFuture] = useState<ShipMap[]>([]);
  const [save, setSave] = useState<SaveState>({ state: "clean" });
  const [selected, setSelected] = useState<TileAt | null>(null);
  const [message, setMessage] = useState<string>();
  const dirty = map !== saved;
  // What was under the last click, front first: Tab steps through it.
  const stack = useRef<{ keys: string[]; at: number }>({ keys: [], at: 0 });

  const commit = (next: ShipMap, select: TileAt | null = selected) => {
    setPast((p) => [...p.slice(-(HISTORY - 1)), map]);
    setFuture([]);
    if (select !== selected) stack.current = { keys: [], at: 0 };
    setMap(next);
    setSelected(select);
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
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const layout: ShipLayout = useMemo(() => ({ ...art, ...map }), [art, map]);
  const [view, setView] = useState<ShipView>({ from: null });
  const placed = useMemo(() => shipScene(layout, view), [layout, view]);
  const box = useMemo(() => bounds(shipScene({ ...art, ...initial })), [art, initial]);
  const outlines = useMemo(() => roomOutlines(layout), [layout]);
  const cells = useMemo(() => shipCells(layout), [layout]);
  const grid = useMemo(() => gridLines(cells), [cells]);
  const imageInput = useMemo(() => ({ layout, room: "" as RoomId, ...NOBODY }), [layout]);
  const planRooms = useMemo(() => map.rooms.filter((r) => r.at).map((r) => r.id).sort(), [map]);

  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set());
  const [showGrid, setShowGrid] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const visible = useMemo(() => placed.filter((s) => !hidden.has(layerOf(s.kind)!)), [placed, hidden]);

  /** Sprite key -> map tile, and back. */
  const { tileOfKey, keyOfTile } = useMemo(() => {
    const tileOfKey = new Map<string, TileAt>();
    const keyOfTile = new Map<string, string>();
    for (const s of placed) {
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
    return { ...d, sprites: d.sprites.map(({ effect: _, ...s }) => s) };
  }, [imageInput, visible, box]);

  // Load every atlas, so hit-testing reads drawn pixels from the first hover.
  useEffect(() => {
    for (const s of placed) {
      const url = imageOf(s, imageInput).url;
      if (url) preloadImage(url);
    }
  }, [placed, imageInput]);

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
  const [zoom, setZoom] = useState(2);
  const [cam, setCam] = useState<{ x: number; y: number } | null>(null);
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
    const { url, frame, keyed } = imageOf(s, imageInput);
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
    setSelected((keys[0] && tileOfKey.get(keys[0])) || null);
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
    toRoom: (room: string) => {
      const r = sel && moveToRoom(map, sel, room);
      if (r) commit(r.map, r.at);
    },
    doorTo: (room: string) => sel && commit(setDoorTarget(map, sel, room)),
  };
  const cycle = (step: number) => {
    const { keys, at } = stack.current;
    if (keys.length < 2) return;
    const next = (at + step + keys.length) % keys.length;
    stack.current = { keys, at: next };
    setSelected(tileOfKey.get(keys[next]!) ?? null);
  };

  // Keys work anywhere but in a text field or a list.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, select, textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const arrow = ARROWS[k];
    if (mod && k.toLowerCase() === "s") void doSave();
    else if (mod && k.toLowerCase() === "z") e.shiftKey ? redo() : undo();
    else if (mod && k.toLowerCase() === "y") redo();
    else if (mod && k.toLowerCase() === "d") edit.duplicate();
    else if (arrow && sel) edit.move(arrow.dx, arrow.dy);
    else if ((k === "Delete" || k === "Backspace") && sel) edit.remove();
    else if (k === "[" && sel) edit.frame(-1);
    else if (k === "]" && sel) edit.frame(1);
    else if (k === "Tab" && stack.current.keys.length > 1) cycle(e.shiftKey ? -1 : 1);
    else if (k === "Escape") armed ? setArmed(null) : setSelected(null);
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
  const selEquipment = sel && placedEquipment(selRoom!).find((p) => p.tile === sel.index);
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

  return (
    <div className="editor">
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
                  <path className="room-outline" d={o.path} />
                  <text className="room-label" x={o.x} y={o.y} fontSize={12 / zoom}>
                    {o.label}
                  </text>
                </g>
              ))}
            {hover && <path className={armed ? "place-cell" : "hover-cell"} d={diamonds([hover.cell])} />}
            {hoverRoom && hoverTile && <path className="hover-footprint" d={diamonds(footprint(layout, hoverRoom, hoverTile))} />}
            {selRoom && selTile && <path className="selected-footprint" d={diamonds(footprint(layout, selRoom, selTile))} />}
          </svg>
        </div>
      </div>

      <aside className="editor-panel">
        <header className="editor-head">
          <h1>Ship map</h1>
          <span className={`save-state ${save.state === "failed" ? "failed" : dirty ? "dirty" : ""}`}>{saveLabel}</span>
        </header>
        <div className="editor-row">
          <button type="button" onClick={() => void doSave()} disabled={!dirty || save.state === "saving"}>
            Save
          </button>
          <button type="button" onClick={undo} disabled={!past.length}>
            Undo
          </button>
          <button type="button" onClick={redo} disabled={!future.length}>
            Redo
          </button>
          <button type="button" onClick={() => void revert()}>
            Reload file
          </button>
        </div>
        {save.state === "failed" && (
          <ul className="editor-errors">
            {save.errors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {save.errors.length > 12 && <li>… {save.errors.length - 12} more</li>}
          </ul>
        )}
        {message && <p className="editor-note">{message}</p>}
        <p className="muted">
          {planRooms.length} rooms on the plan ({offPlan} off it aren't shown), {tiles} tiles. Drag to pan, scroll or the buttons to zoom, click
          a tile to select it.
        </p>

        <div className="editor-row">
          <label>
            View{" "}
            <select
              value={view.from ?? ""}
              onChange={(e) => setView(e.target.value ? { from: e.target.value, depth: view.from ? view.depth : 1 } : { from: null })}
            >
              <option value="">Whole ship</option>
              {planRooms.map((id) => (
                <option key={id} value={id}>
                  From {id}
                </option>
              ))}
            </select>
          </label>
          {view.from && (
            <label>
              Fog depth{" "}
              <select value={view.depth} onChange={(e) => setView({ from: view.from, depth: Number(e.target.value) as 1 | 2 })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          )}
        </div>

        <div className="editor-row">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom - 1)} disabled={zoom <= 1}>
            −
          </button>
          <span className="zoom">{zoom}x</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom + 1)} disabled={zoom >= MAX_ZOOM}>
            +
          </button>
          <button type="button" onClick={() => setCam(null)}>
            Centre
          </button>
        </div>

        <fieldset>
          <legend>Show</legend>
          {LAYERS.map((l) => (
            <label key={l}>
              <input
                type="checkbox"
                checked={!hidden.has(l)}
                onChange={(e) => {
                  const next = new Set(hidden);
                  if (e.target.checked) next.delete(l);
                  else next.add(l);
                  setHidden(next);
                }}
              />
              {LAYER_NAMES[l]}
            </label>
          ))}
          <label>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid
          </label>
          <label>
            <input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} />
            Room outlines
          </label>
        </fieldset>

        <section className="editor-selection">
          <h2>Selected</h2>
          {!sel || !selTile || !selRoom ? (
            <p className="muted">Nothing. Click a tile; Tab steps through everything under that spot.</p>
          ) : (
            <>
              <dl>
                <dt>Tile</dt>
                <dd>
                  {sel.room} #{sel.index}
                  {stack.current.keys.length > 1 && ` (${stack.current.at + 1} of ${stack.current.keys.length} here)`}
                </dd>
                <dt>Slice</dt>
                <dd>
                  {selTile.slice}, frame {selTile.frame}
                </dd>
                <dt>Kind</dt>
                <dd>
                  {selTile.kind}, layer {selTile.layer}
                </dd>
                <dt>Cell</dt>
                <dd>
                  {selTile.x + (selRoom.at?.x ?? 0)}, {selTile.y + (selRoom.at?.y ?? 0)} (room cell {selTile.x}, {selTile.y})
                </dd>
                {selEquipment && (
                  <>
                    <dt>Equipment</dt>
                    <dd>
                      {selEquipment.id} ({selEquipment.type})
                    </dd>
                  </>
                )}
              </dl>
              <div className="editor-pad" role="group" aria-label="Move">
                {(["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"] as const).map((k) => (
                  <button key={k} type="button" aria-label={`Move ${ARROWS[k]!.label}`} onClick={() => edit.move(ARROWS[k]!.dx, ARROWS[k]!.dy)}>
                    {{ ArrowLeft: "↖", ArrowUp: "↗", ArrowDown: "↙", ArrowRight: "↘" }[k]}
                  </button>
                ))}
              </div>
              <div className="editor-row">
                <button type="button" onClick={() => edit.frame(-1)}>
                  Frame −
                </button>
                <button type="button" onClick={() => edit.frame(1)}>
                  Frame +
                </button>
                <button type="button" onClick={edit.duplicate}>
                  Duplicate
                </button>
                <button type="button" onClick={edit.remove}>
                  Delete
                </button>
              </div>
              <label className="editor-field">
                Belongs to{" "}
                <select value={sel.room} onChange={(e) => edit.toRoom(e.target.value)} disabled={!selRoom.at}>
                  {planRooms.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              {selTile.kind === "door" && (
                <label className="editor-field">
                  Door to{" "}
                  <select value={selTile.door?.target ?? ""} onChange={(e) => edit.doorTo(e.target.value)}>
                    <option value="">(none)</option>
                    {map.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </section>

        <section className="editor-readout" aria-live="polite">
          <h2>Under the pointer</h2>
          {!hover ? (
            <p className="muted">Point at the ship.</p>
          ) : (
            <p>
              Cell {hover.cell.x}, {hover.cell.y}
              {floorsHere.length > 0 && <> · floor of {floorsHere.map((r) => r.id).join(", ")}</>}
              {hit && hoverTile && (
                <>
                  <br />
                  {hit.room} #{hit.index}: {hoverTile.slice} frame {hoverTile.frame} ({hoverTile.kind})
                  {hoverTile.door && <> · door to {hoverTile.door.target || "nowhere"}</>}
                </>
              )}
            </p>
          )}
        </section>

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

        <details className="editor-keys">
          <summary>Keys</summary>
          <dl>
            <dt>Arrows</dt>
            <dd>move the selection a cell: ↑ up-right, → down-right, ↓ down-left, ← up-left</dd>
            <dt>Tab, Shift+Tab</dt>
            <dd>the next or previous thing under the last click</dd>
            <dt>Delete</dt>
            <dd>delete it</dd>
            <dt>Ctrl+D</dt>
            <dd>duplicate it (on the same cell)</dd>
            <dt>[ ]</dt>
            <dd>previous or next frame</dd>
            <dt>Ctrl+Z, Ctrl+Shift+Z</dt>
            <dd>undo, redo</dd>
            <dt>Ctrl+S</dt>
            <dd>save</dd>
            <dt>Escape</dt>
            <dd>stop placing, or clear the selection</dd>
          </dl>
        </details>
      </aside>
    </div>
  );
}
