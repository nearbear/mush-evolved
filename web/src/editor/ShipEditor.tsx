// The ship map editor (dev builds only, at /editor; #209). Draws the whole ship from ship-map.json with
// the game's own placement and Pixi renderer, nothing fogged, with drag to pan and whole-number zoom (an
// editor-only exception to the room view's 1x, no-panning rules, owner 2026-10-21), layer toggles, a grid
// and room outlines on the ship plan, and what is under the pointer. Read-only for now (#211); editing is #212.
// Player-facing rules don't apply here (no translations, desktop first), but it stays usable on a phone.

import { lazy, type PointerEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { placedEquipment, type RoomId, type ShipLayout } from "@mush2/shared";
import { opaqueAt, preloadImage } from "../iso/hitMask.ts";
import { bounds, gridToPx, hitTest, type PlacedSprite } from "../iso/placement.ts";
import { describeScene, type FrameTarget, type FrameUpdate, imageOf, type Scene } from "../iso/scene.ts";
import { loadShip } from "../iso/shipLayout.ts";
import { cellAt, diamonds, footprint, gridLines, LAYERS, type Layer, layerOf, roomOutlines, shipCells, shipScene, tileOf } from "./shipScene.ts";
import "./editor.css";

const PixiScene = lazy(() => import("../iso/pixi/PixiScene.tsx"));

const MAX_ZOOM = 4;
const LAYER_NAMES: Record<Layer, string> = { ground: "Floor", wall: "Walls and doors", prop: "Props", entity: "Furniture and fittings" };
const STILL = () => ({ x: 0, y: 0 });
const NOBODY = { people: new Map(), walkers: new Map(), seats: new Map(), corpses: [] };

export default function ShipEditor() {
  const [layout, setLayout] = useState<ShipLayout>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadShip().then(setLayout, (e: unknown) => setError(String(e)));
  }, []);
  if (error) return <p className="editor-message">{error}</p>;
  if (!layout) return <p className="editor-message">Loading the ship…</p>;
  return <Viewer layout={layout} />;
}

function Viewer({ layout }: { layout: ShipLayout }) {
  const placed = useMemo(() => shipScene(layout), [layout]);
  const box = useMemo(() => bounds(placed), [placed]);
  const outlines = useMemo(() => roomOutlines(layout), [layout]);
  const cells = useMemo(() => shipCells(layout), [layout]);
  const grid = useMemo(() => gridLines(cells), [cells]);
  const imageInput = useMemo(() => ({ layout, room: "" as RoomId, ...NOBODY }), [layout]);

  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set());
  const [showGrid, setShowGrid] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const visible = useMemo(() => placed.filter((s) => !hidden.has(layerOf(s.kind)!)), [placed, hidden]);

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
  const scene: Scene = useMemo(
    () => (hover?.key ? { ...base, sprites: base.sprites.map((s) => (s.key === hover.key ? { ...s, effect: "hover" as const } : s)) } : base),
    [base, hover?.key],
  );

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
  const pick = (clientX: number, clientY: number) => {
    const { x, y } = pointIn(clientX, clientY);
    const opaque = (s: PlacedSprite, px: number, py: number) => {
      const { url, frame, keyed } = imageOf(s, imageInput);
      return !url || opaqueAt(url, frame, px, py, keyed);
    };
    setHover({ key: hitTest(visible, x, y, opaque)?.key, cell: cellAt(x, y) });
  };

  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: camera };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setCam({ x: Math.round(d.from.x + (e.clientX - d.x) / zoom), y: Math.round(d.from.y + (e.clientY - d.y) / zoom) });
    else if (e.pointerType === "mouse") pick(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    // A tap that didn't drag shows what's under it (touch has no hover).
    if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) pick(e.clientX, e.clientY);
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

  const hit = hover?.key ? visible.find((s) => s.key === hover.key) : undefined;
  const ref = hit && tileOf(layout, hit);
  const floorsHere = hover
    ? layout.rooms.filter((r) => r.at && r.tiles.some((t) => t.kind === "ground" && t.x + r.at!.x === hover.cell.x && t.y + r.at!.y === hover.cell.y))
    : [];
  const equipment = ref && placedEquipment(ref.room).find((p) => p.tile === ref.index);
  const offPlan = layout.rooms.filter((r) => !r.at).length;
  const labels = [];
  if (showGrid) {
    for (let x = Math.ceil(cells.x0 / 10) * 10; x <= cells.x1; x += 10) {
      for (let y = Math.ceil(cells.y0 / 10) * 10; y <= cells.y1; y += 10) labels.push({ x, y, at: gridToPx(x, y) });
    }
  }

  return (
    <div className="editor">
      <div
        ref={viewport}
        className="editor-viewport"
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
            {hover && <path className="hover-cell" d={diamonds([hover.cell])} />}
            {ref && <path className="hover-footprint" d={diamonds(footprint(layout, ref.room, ref.tile))} />}
          </svg>
        </div>
      </div>

      <aside className="editor-panel">
        <h1>Ship map</h1>
        <p className="muted">
          {layout.rooms.length - offPlan} rooms on the plan ({offPlan} off it aren't shown), {placed.length} tiles drawn. Read-only: drag to
          pan, scroll or the buttons to zoom.
        </p>

        <div className="editor-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom - 1)} disabled={zoom <= 1}>
            −
          </button>
          <span>{zoom}x</span>
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

        <section className="editor-readout" aria-live="polite">
          <h2>Under the pointer</h2>
          {!hover ? (
            <p className="muted">Point at the ship (tap on a phone).</p>
          ) : (
            <dl>
              <dt>Cell</dt>
              <dd>
                {hover.cell.x}, {hover.cell.y}
                {floorsHere.length > 0 && <> · floor of {floorsHere.map((r) => r.id).join(", ")}</>}
              </dd>
              {ref && (
                <>
                  <dt>Tile</dt>
                  <dd>
                    {ref.room.id} #{ref.index}
                  </dd>
                  <dt>Slice</dt>
                  <dd>
                    {ref.tile.slice}, frame {ref.tile.frame}
                  </dd>
                  <dt>Kind</dt>
                  <dd>
                    {ref.tile.kind}, layer {ref.tile.layer}
                  </dd>
                  <dt>Room cell</dt>
                  <dd>
                    {ref.tile.x}, {ref.tile.y}
                  </dd>
                  {ref.tile.door && (
                    <>
                      <dt>Door to</dt>
                      <dd>{ref.tile.door.target}</dd>
                    </>
                  )}
                  {equipment && (
                    <>
                      <dt>Equipment</dt>
                      <dd>
                        {equipment.id} ({equipment.type})
                      </dd>
                    </>
                  )}
                </>
              )}
            </dl>
          )}
        </section>
      </aside>
    </div>
  );
}
