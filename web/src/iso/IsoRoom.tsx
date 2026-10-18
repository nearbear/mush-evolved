// DOM renderer for one room of the original isometric ship. Every sprite is
// an absolutely positioned div cropped from its atlas; DOM order is paint
// order. Presentational only: doors emit move intents, and people and
// equipment emit a selection; legality comes from props.
//
// Sprites don't take pointer events themselves: their boxes overlap a lot.
// The viewport hit-tests against the pixels actually drawn (hitTest + hitMask),
// so a click lands on whatever is visibly under the pointer.
//
// The rooms behind the doors are drawn dimmed around this one, in one paint
// order with it (placeScene), so a neighbour in front covers this room and
// one behind is covered by it. They show only what the view already gives
// you: their fixed scenery, and the people the view places there (everyone
// while ACTOPI is on, nobody while it's off). Clicking one counts as clicking
// its door.
//
// Walls cover people standing behind them, but nobody can hide there: anyone
// a wall is drawn over (PlacedSprite.occluded) also gets a glowing outline in
// a layer above everything. People in this room still take clicks through it.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { CAMERA_EQUIPMENT, CORPSE_ITEM, placedEquipment, type CharacterId, type EquipmentView, type ItemId, type RoomId, type ShipLayout, type Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { lyingFrame, spriteStrip, sittingFrame } from "../art/assets.ts";
import { CrewSprite } from "../scene/CrewSprite.tsx";
import { ActionBar, type Bar } from "../scene/ActionBar.tsx";
import { StatusBadges } from "../scene/StatusBadges.tsx";
import { BUBBLE_MS, type Bubble } from "../scene/useSpeechBubbles.ts";
import { useNames } from "../i18n/names.ts";
import { atlasUrl } from "./shipLayout.ts";
import { CAMERA_SLICES, equipmentByTileKey } from "./equipmentTiles.ts";
import { opaqueAt, preloadImage } from "./hitMask.ts";
import { Markdown } from "../hud/Markdown.tsx";
import { useWalkers } from "./useWalkers.ts";
import type { ActingOn } from "./useActingOn.ts";
import {
  bounds,
  cellAtPoint,
  doorSpot,
  hitTest,
  neighborRooms,
  placeScene,
  spreadActors,
  standSpot,
  walkableCells,
  walkPath,
  type PlacedSprite,
} from "./placement.ts";

export interface Occupant {
  id: string;
  name: string;
  isBot: boolean;
  character: CharacterId | undefined;
  you: boolean;
  /** The bed (equipment id) they lie in, drawn in the lying pose like a corpse. The view gives it for you and for people in your room. */
  lying?: string;
  /** Public statuses, shown over the head (the view decides which; see statuses.ts). */
  statuses: readonly string[];
  /** The bar of the timed action they are busy with, when the view shows it, and your own action's name. */
  busy?: { bar: Bar; label?: string };
}

/** A corpse item on the floor, and whose body it is (from `ItemView.of`). */
export interface Corpse {
  id: ItemId;
  character: CharacterId | undefined;
}

/** The original Flash client ran at 30 ticks a second; animation rhythms are counted in ticks. */
const TICK_MS = 1000 / 30;

/** Actor ids for corpses get this prefix, so they can't collide with player ids. */
const CORPSE_PREFIX = "corpse:";
/** How someone sits on a chair: which sitting frame, and whether it is mirrored. */
interface Seat {
  facing: "face" | "back";
  flip: boolean;
}

/**
 * The seat for a chair that faces the given way. The art has two sitting poses, facing down-right
 * (+x) and up-left (-x); the other two directions mirror them. Chairs without a direction (stools)
 * are sat on facing down-right.
 */
function seatFor(dir: string | undefined): Seat {
  if (dir === "left") return { facing: "back", flip: false };
  if (dir === "up") return { facing: "back", flip: true };
  if (dir === "down") return { facing: "face", flip: true };
  return { facing: "face", flip: false };
}

/** The lying pose's cell on the cast sheet (art/assets.ts). */
const LYING_SIZE = { width: 50, height: 48 };

export function IsoRoom({
  layout,
  room,
  occupants,
  nearby,
  fogDepth,
  corpses,
  equipment,
  reachable,
  selected,
  selectedDoor,
  actingOn,
  sentCount,
  teleport,
  leavingTo,
  onLeft,
  onMove,
  onSelect,
  onClear,
  onDoorTap,
  bubbles,
  clockOffset,
}: {
  layout: ShipLayout;
  room: RoomId;
  occupants: Occupant[];
  /** People the view places in other rooms, by room. Only the rooms behind this room's doors are drawn. */
  nearby: Partial<Record<RoomId, Occupant[]>>;
  /** How many rooms out from this one are drawn (fogged): 1 is just those behind its doors, "all" is the whole ship. */
  fogDepth: 1 | 2 | "all";
  /** Corpses on this room's floor (items, drawn lying down). A carried corpse isn't on the floor, so isn't here. */
  corpses: Corpse[];
  /** Equipment in this room, from the view. Only these sprites are clickable. */
  equipment: EquipmentView[];
  reachable: Set<RoomId>;
  selected: Target | null;
  /** The door whose target is shown in the peek bar, if any. */
  selectedDoor: RoomId | null;
  /** What your latest action is on: you walk up to it when this changes (useActingOn). */
  actingOn: ActingOn | null;
  /** Changes whenever you send an action: you get up from your chair. */
  sentCount: number;
  /** The instant actions cheat is on: you jump wherever you'd walk (others still walk). */
  teleport: boolean;
  /** You've already moved there: walk to the door to it, then `onLeft` (LeavingIsoRoom shows the next room). */
  leavingTo: RoomId | null;
  onLeft: () => void;
  onMove: (to: RoomId) => void;
  onSelect: (target: Target) => void;
  /** Bare floor was tapped: drop the selection (and any peeked door). */
  onClear: () => void;
  /** A single click or tap on any door, reachable or not. */
  onDoorTap: (to: RoomId) => void;
  /** Recent global chat per sender, oldest first, shown as speech bubbles over their heads. */
  bubbles: ReadonlyMap<string, Bubble[]>;
  /** Server clock minus this browser's, for drawing action bars. */
  clockOffset: number;
}) {
  const names = useNames();
  const { t } = useTranslation();
  const roomLayout = layout.rooms.find((r) => r.id === room);
  // The layout has a camera tile in every room. It is drawn only here, and only once a camera is installed
  // (other rooms' cameras are hidden information, so they are never drawn).
  const hasCamera = equipment.some((e) => e.type === CAMERA_EQUIPMENT);
  const occupantKey = occupants.map((o) => `${o.id}${o.lying ?? ""}`).join(",");
  const corpseKey = corpses.map((c) => c.id).join(",");
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  // Where you've clicked to walk. Client-only and cosmetic: the server never hears of it,
  // and it resets when you change rooms (it belongs to one visit, so coming back doesn't restore it).
  // Sitting on a chair is the same kind of local state: the walk's end point plus the seat taken there.
  const [walk, setWalk] = useState<{ visit: number; cell: { x: number; y: number }; seat?: Seat } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only sending an action gets you up.
  useEffect(() => setWalk((w) => (w?.seat ? { ...w, seat: undefined } : w)), [sentCount]);
  const cells = useMemo(() => (roomLayout ? walkableCells(layout, roomLayout) : []), [layout, roomLayout]);
  const spots = useMemo(() => spreadActors(cells, occupants.length + corpses.length), [cells, occupants.length, corpses.length]);

  // Everyone walks to their spot (you to where you clicked). Coming into a room, you stand in front
  // of the door back to the room you left until you walk off. Cosmetic like the spots: nothing waits for it.
  const visit = useRef<{ room: RoomId; from: RoomId | null; n: number }>({ room, from: null, n: 0 });
  if (visit.current.room !== room) visit.current = { room, from: visit.current.room, n: visit.current.n + 1 };
  const here = walk?.visit === visit.current.n ? walk : undefined;
  const me = occupants.find((o) => o.you);
  const entryCell = roomLayout && visit.current.from ? doorSpot(layout, roomLayout, visit.current.from, cells) : undefined;
  const exitCell = roomLayout && leavingTo ? doorSpot(layout, roomLayout, leavingTo, cells) : undefined;
  // Someone in bed lies in the middle of the bed's footprint, mirrored to run along the bed.
  const beds = new Map<string, { cell: { x: number; y: number }; flip: boolean }>();
  for (const o of occupants) {
    const tile = o.lying && roomLayout ? placedEquipment(roomLayout).find((e) => e.id === o.lying)?.tile : undefined;
    const t = tile === undefined ? undefined : roomLayout?.tiles[tile];
    if (!t) continue;
    const [w, h] = layout.slices[t.slice]?.footprint ?? [1, 1];
    beds.set(o.id, { cell: { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) }, flip: w > h });
  }
  const targets = new Map(
    occupants.map((o, i) => [o.id, beds.get(o.id)?.cell ?? ((o.you && (exitCell ?? here?.cell ?? entryCell)) || spots[i] || { x: 0, y: 0 })]),
  );
  // Where the camera sits as rendered; the walkers shift it while you walk, so it stays on you.
  const camera = useRef({ x: 0, y: 0, follow: me?.id });
  const { at: walkers, apply: applyWalkers, offsetOf } = useWalkers(room, cells, targets, worldRef, camera, teleport ? me?.id : undefined);
  const myWalker = me && walkers.get(me.id);
  // Walking out: done once you stand at the door (straight away if there's no door to go through).
  const outside = !!leavingTo && (!exitCell || !myWalker || (!myWalker.moving && myWalker.cell.x === exitCell.x && myWalker.cell.y === exitCell.y));
  // biome-ignore lint/correctness/useExhaustiveDependencies: onLeft is rebuilt every render; reaching the door is what matters.
  useEffect(() => {
    if (outside) onLeft();
  }, [outside]);
  const arrived = !!myWalker && !myWalker.moving && !!here && myWalker.cell.x === here.cell.x && myWalker.cell.y === here.cell.y;
  const mySeat = arrived ? here?.seat : undefined;
  const walkersKey = [...walkers].map(([id, w]) => `${id}@${w.cell.x},${w.cell.y}${w.facing.flip ? "f" : ""}`).join(";");


  // This room and the rooms behind its doors, each with its people, drawn as one scene so that
  // whichever is in front covers the other. Display only: where people stand isn't game state.
  const nearbyKey = JSON.stringify(Object.entries(nearby).map(([r, os]) => [r, os?.map((o) => o.id)]));
  // biome-ignore lint/correctness/useExhaustiveDependencies: occupantKey, corpseKey, nearbyKey and walkersKey stand in for occupants, corpses, nearby and walkers: positions only change when who or what is where changes.
  const { scene, sprites, neighborSprites, neighbors, box, ownCells } = useMemo(() => {
    if (!roomLayout) return { scene: [], sprites: [], neighborSprites: [], neighbors: [], box: bounds([]), ownCells: new Set<string>() };
    const actors = [
      ...occupants.map((o, i) => ({
        id: o.id,
        cell: walkers.get(o.id)?.cell ?? spots[i] ?? { x: 0, y: 0 },
        ...(o.lying ? { ...LYING_SIZE, onTop: true } : { width: 32, height: 48 }),
      })),
      // A corpse is placed like a person (so paint order and walls treat it the same) but drawn lying down.
      ...corpses.map((c, i) => ({ id: `${CORPSE_PREFIX}${c.id}`, cell: spots[occupants.length + i] ?? { x: 0, y: 0 }, ...LYING_SIZE })),
    ];
    const neighbors = neighborRooms(layout, roomLayout, fogDepth).map(({ room: n, dx, dy, ring }) => {
      const people = nearby[n.id as RoomId] ?? [];
      const spots = spreadActors(walkableCells(layout, n), people.length);
      const actors = people.map((o, i) => ({ id: o.id, cell: spots[i] ?? { x: 0, y: 0 }, width: 32, height: 48 }));
      return { room: n, dx, dy, actors, id: n.id as RoomId, people, ring };
    });
    const scene = placeScene(layout, [{ room: roomLayout, dx: 0, dy: 0, actors }, ...neighbors])
      .filter((s) => !CAMERA_SLICES.has(s.slice) || (hasCamera && s.room === room))
      // A walker facing right is drawn mirrored; hit-testing mirrors with it.
      .map((s) => {
        if (s.kind !== "actor" || s.room !== room) return s;
        const bed = beds.get(s.key.slice(2));
        return (bed ? bed.flip : walkers.get(s.key.slice(2))?.facing.flip) ? { ...s, flipX: true } : s;
      });
    // Both in paint order, for hit-testing this room before its neighbours.
    const sprites = scene.filter((s) => s.room === room);
    const neighborSprites = scene.filter((s) => s.room !== room);
    // Cells next to this room's floor: a neighbour's wall drawn there (beside a door, say) is this room's wall.
    const floorCells = new Set(roomLayout.tiles.filter((t) => t.kind === "ground").map((t) => `${t.x},${t.y}`));
    const ownCells = new Set<string>();
    for (const c of floorCells) {
      const [x, y] = c.split(",").map(Number) as [number, number];
      for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) ownCells.add(`${ax},${ay}`);
    }
    return { scene, sprites, neighborSprites, neighbors, box: bounds(sprites), ownCells };
  }, [layout, roomLayout, fogDepth, cells, spots, walkersKey, occupantKey, corpseKey, nearbyKey, hasCamera]);

  // Sprites draw at exactly one screen pixel per source pixel, so art stays crisp.
  // The camera always keeps you centred, even near a room's edges (the neighbours fill the space
  // around it, so a door in a far corner is never pinned to the panel's edge). There is no manual
  // panning. It moves the world with a transform rather than scrolling, so it can go past the edges.
  const youSprite = sprites.find((s) => s.kind === "actor" && occupants.some((o) => o.you && o.id === s.key.slice(2)));
  const youX = youSprite ? youSprite.left - box.minX + youSprite.width / 2 : box.width / 2;
  const youY = youSprite ? youSprite.top - box.minY + youSprite.height / 2 : box.height / 2;
  const [panel, setPanel] = useState({ width: 0, height: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomLayout is a trigger: the viewport only exists once the room has a layout.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanel({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [roomLayout]);
  const camX = Math.round(panel.width / 2 - youX);
  const camY = Math.round(panel.height / 2 - youY);
  camera.current = { x: camX, y: camY, follow: me?.id };
  // After every render: put the walkers' in-between pixel shifts (and the camera) back on the DOM.
  useLayoutEffect(applyWalkers);

  const equipmentByKey = useMemo(() => equipmentByTileKey(roomLayout, equipment), [roomLayout, equipment]);

  // Acting on something walks you up to it: equipment's standing spot (as clicking it does), the
  // last cell before a person or a body on the floor, or the door you're moving through. Things not in this room, or not on its floor
  // (an item in an inventory), stay where they are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request walks; the rest is read as it stands then.
  useEffect(() => {
    if (!actingOn || !roomLayout || !myWalker || leavingTo) return;
    const { target } = actingOn;
    let cell: { x: number; y: number } | undefined;
    if (target.kind === "door") cell = doorSpot(layout, roomLayout, target.to, cells);
    else if (target.kind === "equipment") {
      const key = [...equipmentByKey].find(([, e]) => e.id === target.id)?.[0];
      cell = key ? standSpot(layout, roomLayout, Number(key.slice(1)), cells) : undefined;
    } else {
      const i = corpses.findIndex((c) => c.id === target.id);
      const at = target.kind === "player" ? (target.id === me?.id ? undefined : walkers.get(target.id)?.cell) : i >= 0 ? spots[occupants.length + i] : undefined;
      const path = at && walkPath(cells, myWalker.cell, at);
      cell = path && path.length > 1 ? path[path.length - 2] : undefined;
    }
    if (cell) setWalk({ visit: visit.current.n, cell });
  }, [actingOn?.n]);

  const ringOf = new Map(neighbors.map((n) => [n.id as string, n.ring]));
  const byId = new Map([...occupants, ...neighbors.flatMap((n) => n.people)].map((o) => [o.id, o]));
  /** The corpse an actor sprite draws, if it is one. */
  const corpseOf = (s: PlacedSprite) => (s.kind === "actor" && s.key.startsWith(`a:${CORPSE_PREFIX}`) ? corpses.find((c) => `a:${CORPSE_PREFIX}${c.id}` === s.key) : undefined);
  /** The image a sprite's pixels come from, its frame in that image, and whether its background is color-keyed. */
  const source = (s: PlacedSprite): { url: string | undefined; frame: { sx: number; sy: number; width: number; height: number }; keyed: boolean } => {
    if (s.kind !== "actor") return { url: atlasUrl(layout, s.sheet), frame: s, keyed: false };
    const corpse = corpseOf(s);
    if (corpse) {
      const lying = lyingFrame(corpse.character);
      return { url: lying?.url, frame: lying ?? { sx: 0, sy: 0, ...LYING_SIZE }, keyed: false };
    }
    const o = byId.get(s.key.slice(2));
    const lying = o?.lying ? lyingFrame(o.character) : undefined;
    if (lying) return { url: lying.url, frame: lying, keyed: false };
    const sitting = o?.you && mySeat ? sittingFrame(o.character, mySeat.facing) : undefined;
    if (sitting) return { url: sitting.url, frame: sitting, keyed: false };
    const strip = (o && s.room === room && walkers.get(o.id)?.facing.strip) || "face";
    return { url: spriteStrip(o?.character, strip), frame: { sx: 0, sy: 0, width: 32, height: 48 }, keyed: true };
  };

  // Load every image this room hit-tests against, so masks are ready by the first click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-preload only when the sprite set changes; `source` is rebuilt every render.
  useEffect(() => {
    for (const s of scene) {
      const url = source(s).url;
      if (url) preloadImage(url);
    }
  }, [scene]);

  // Every camera step lasts the animation's rhythm (6 ticks for both camera tiles).
  const [cameraStep, setCameraStep] = useState(0);
  useEffect(() => {
    if (!hasCamera) return;
    const id = setInterval(() => setCameraStep((n) => n + 1), 6 * TICK_MS);
    return () => clearInterval(id);
  }, [hasCamera]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverAt, setHoverAt] = useState({ x: 0, y: 0 });
  const espFilter = `iso-esp-${useId().replace(/[^\w-]/g, "")}`;

  if (!roomLayout) return <section className="iso-room missing">No map for {names.room(room)}</section>;
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);

  /** What a sprite does when clicked, or null for scenery. */
  const interaction = (s: PlacedSprite) => {
    const corpse = corpseOf(s);
    if (corpse) return { kind: "item" as const, item: corpse.id, title: names.item(CORPSE_ITEM) };
    if (s.kind === "actor") {
      const o = byId.get(s.key.slice(2));
      return o ? { kind: "person" as const, person: o, title: o.name } : null;
    }
    if (s.door) return { kind: "door" as const, to: s.door.target, title: names.room(s.door.target) };
    const eq = equipmentByKey.get(s.key);
    if (!eq && s.kind === "entity" && layout.slices[s.slice]?.flags.includes("chair")) {
      return { kind: "chair" as const, cell: s.cell, dir: layout.slices[s.slice]?.dir, title: t("common.chair") };
    }
    return eq ? { kind: "equipment" as const, equipment: eq, title: names.equipment(eq.type) } : null;
  };

  /**
   * The interactive sprite visibly under the pointer, if any. Scenery in front blocks what's behind it.
   * This room takes clicks before its neighbours, even where a neighbour's wall is drawn over it, so
   * its floor stays walkable. Any visible part of a neighbour counts as its door.
   */
  const pick = (e: MouseEvent<HTMLElement>) => {
    const rect = worldRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) + box.minX;
    const y = (e.clientY - rect.top) + box.minY;
    const opaque = (s: PlacedSprite, px: number, py: number) => {
      const { url, frame, keyed } = source(s);
      return !url || opaqueAt(url, frame, px, py, keyed);
    };
    // People part-way between cells are drawn shifted from their placed box.
    const shifted = sprites.map((s) => {
      if (s.kind !== "actor") return s;
      const o = offsetOf(s.key.slice(2));
      return o.x || o.y ? { ...s, left: s.left + o.x, top: s.top + o.y } : s;
    });
    const hit = hitTest(shifted, x, y, opaque);
    if (hit) {
      const action = interaction(hit);
      return action ? { sprite: hit, key: hit.key, ...action } : null;
    }
    const behind = hitTest(neighborSprites, x, y, opaque);
    // Only the rooms behind this room's own doors count as doors; the second ring is scenery.
    if (!behind || ringOf.get(behind.room) !== 1) return null;
    const to = behind.room as RoomId;
    return { sprite: behind, key: `n:${to}`, kind: "door" as const, to, title: names.room(to) };
  };

  /** Room-pixel point under the pointer, for walking. */
  const pointIn = (e: MouseEvent<HTMLElement>) => {
    const rect = worldRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left + box.minX, y: e.clientY - rect.top + box.minY };
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (leavingTo) return;
    const hit = pick(e);
    if (hit?.kind === "person") onSelect({ kind: "player", id: hit.person.id });
    else if (hit?.kind === "item") onSelect({ kind: "item", id: hit.item });
    // Selecting equipment doesn't walk you up to it: you step up once an action on it begins (useActingOn).
    else if (hit?.kind === "equipment") onSelect({ kind: "equipment", id: hit.equipment.id });
    else if (hit?.kind === "chair") {
      // Sit down (cosmetic, like walking): you stand on the chair's cell in the sitting pose.
      onClear();
      if (!me?.lying) setWalk({ visit: visit.current.n, cell: hit.cell, seat: seatFor(hit.dir) });
    }
    else if (hit?.kind === "door") onDoorTap(hit.to);
    else {
      // Bare floor (or scenery): clear the selection and walk there; the camera follows, revealing doors off-panel.
      onClear();
      const at = pointIn(e);
      const cell = cellAtPoint(cells, at.x, at.y);
      if (cell && !me?.lying) setWalk({ visit: visit.current.n, cell });
    }
  };
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (leavingTo) return;
    const hit = pick(e);
    if (hit?.kind === "door" && reachable.has(hit.to)) onMove(hit.to);
  };
  // Hover feedback only for real pointers; touch has no hover.
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const key = pick(e)?.key ?? null;
    if (key !== hoverKey) {
      setHoverKey(key);
      setHoverAt({ x: e.clientX, y: e.clientY });
    }
  };
  const hovered = sprites.find((s) => s.key === hoverKey);
  const hoveredNeighbor = neighbors.find((n) => `n:${n.id}` === hoverKey);
  const hoverTitle = hoveredNeighbor ? names.room(hoveredNeighbor.id) : hovered && interaction(hovered)?.title;
  /** The camera swivels: its auto animation (Camera.xml) steps through the frames of its strip. */
  const sx = (s: PlacedSprite) => {
    const anim = CAMERA_SLICES.has(s.slice) ? layout.slices[s.slice]?.anims[0] : undefined;
    const frame = anim?.frames[cameraStep % anim.frames.length];
    return frame === undefined ? s.sx : s.sx + frame * s.width;
  };
  const spriteStyle = (s: PlacedSprite) => ({
    ...place(s),
    backgroundImage: `url(${atlasUrl(layout, s.sheet)})`,
    backgroundPosition: `${-sx(s)}px ${-s.sy}px`,
    transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
  });
  const place = (s: PlacedSprite) => ({ left: s.left - box.minX, top: s.top - box.minY, width: s.width, height: s.height });

  return (
    <section className="iso-room">
      <h2 className="room-title">{names.room(room)}</h2>
      {/* The scroller is separate so the title stays put when a wide room scrolls. */}
      <div className="iso-scroll">
        <div
          ref={viewportRef}
          className={`iso-viewport${hoverTitle ? " pointing" : ""}`}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverKey(null)}
        >
          {/* A mouse-only label; the same name is in the Inspect panel once the thing is selected. */}
          {hoverTitle &&
            createPortal(
              <div className="tooltip" aria-hidden="true" style={{ position: "fixed", left: hoverAt.x + 14, top: hoverAt.y + 18 }}>
                {hoverTitle}
              </div>,
              document.body,
            )}
          <div
            ref={worldRef}
            className="iso-world"
            style={{ width: box.width, height: box.height }}
          >
            <div className="iso-layer">
              {scene.map((s) => {
                if (s.room !== room) {
                  const n = s.room as RoomId;
                  // A door into the room you're in stays lit, so the way back reads clearly.
                  // So do a neighbour's walls standing next to this room's floor.
                  const lit = s.kind !== "actor" && (s.door?.target === room || (s.kind === "wall" && ownCells.has(`${s.cell.x},${s.cell.y}`)));
                  const state = `${lit ? "" : "neighbor"}${reachable.has(n) ? " reachable" : ""}${n === selectedDoor ? " selected" : ""}${
                    `n:${n}` === hoverKey ? " hover" : ""
                  }`;
                  return s.kind === "actor" ? (
                    <div key={s.key} className={`iso-actor ${state}`} style={place(s)}>
                      <CrewSprite character={byId.get(s.key.slice(2))?.character} />
                    </div>
                  ) : (
                    <div key={s.key} className={`iso-sprite ${state}`} style={spriteStyle(s)} />
                  );
                }
                const corpse = corpseOf(s);
                if (corpse) {
                  const lying = lyingFrame(corpse.character);
                  return (
                    <div
                      key={s.key}
                      className={`iso-actor corpse${isSelected("item", corpse.id) ? " selected" : ""}${s.key === hoverKey ? " hover" : ""}`}
                      style={{ ...place(s), backgroundImage: lying && `url(${lying.url})`, backgroundPosition: lying && `${-lying.sx}px ${-lying.sy}px` }}
                    />
                  );
                }
                if (s.kind === "actor") {
                  const o = byId.get(s.key.slice(2))!;
                  const w = walkers.get(o.id);
                  return (
                    <div
                      key={s.key}
                      className={`iso-actor${o.you ? " you" : ""}${isSelected("player", o.id) ? " selected" : ""}${s.key === hoverKey ? " hover" : ""}`}
                      style={place(s)}
                      data-walker={o.id}
                    >
                      {o.lying ? <LyingSprite character={o.character} flip={beds.get(o.id)?.flip} /> : o.you && mySeat ? <SeatedSprite character={o.character} seat={mySeat} /> : <CrewSprite character={o.character} facing={w?.facing} walking={w?.moving} arriving={w?.arriving} />}
                    </div>
                  );
                }
                const door = s.door;
                const canGo = door ? reachable.has(door.target) : false;
                const eq = equipmentByKey.get(s.key);
                const eqClass = eq ? ` equipment${isSelected("equipment", eq.id) ? " selected" : ""}` : "";
                const doorClass = door ? ` door${door.target === selectedDoor ? " selected" : ""}` : "";
                const hoverClass = s.key === hoverKey ? " hover" : "";
                return <div key={s.key} className={`iso-sprite${doorClass}${canGo ? " reachable" : ""}${eqClass}${hoverClass}`} style={spriteStyle(s)} />;
              })}
            </div>
            {/* Every person, in paint order; only those a wall covers show (CSS). Always mounted, so the copy
                plays its walk-in in step with the person. */}
            <div className="iso-layer iso-esp">
              {scene.map((s) => {
                if (s.kind !== "actor" || corpseOf(s)) return null;
                const o = byId.get(s.key.slice(2));
                const w = s.room === room && o ? walkers.get(o.id) : undefined;
                return (
                  <div
                    key={s.key}
                    className={`iso-actor${s.occluded ? " occluded" : ""}${s.room !== room ? " neighbor" : ""}`}
                    style={{ ...place(s), filter: `url(#${espFilter})` }}
                    data-walker={w && o?.id}
                  >
                    {o?.lying ? (
                      <LyingSprite character={o.character} flip={beds.get(o.id)?.flip} />
                    ) : o?.you && mySeat ? (
                      <SeatedSprite character={o.character} seat={mySeat} />
                    ) : (
                      <CrewSprite character={o?.character} facing={w?.facing} walking={w?.moving} arriving={w?.arriving} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Status badges and speech bubbles last, so no sprite or wall can ever cover them. */}
            <div className="iso-layer iso-badges">
              {scene.map((s) => {
                const o = s.kind === "actor" && s.room === room ? byId.get(s.key.slice(2)) : undefined;
                return o ? (
                  <div key={s.key} className={`iso-badge-anchor${o.busy ? " busy" : ""}`} style={place(s)} data-walker={o.id}>
                    {o.busy && (
                      <ActionBar
                        bar={o.busy.bar}
                        clockOffset={clockOffset}
                        label={o.busy.label ? t("queue.underWay", { action: o.busy.label }) : t("queue.busy")}
                      />
                    )}
                    <StatusBadges statuses={o.statuses} />
                    {bubbles.get(o.id) && (
                      <div className={`speech-bubbles${o.statuses.length ? " raised" : ""}`}>
                        {bubbles.get(o.id)!.map((b) => (
                          <div key={b.id} className="speech-bubble" style={{ "--bubble-ms": `${BUBBLE_MS}ms` } as CSSProperties}>
                            <Markdown text={b.text} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>
      <EspFilter id={espFilter} />
    </section>
  );
}

/** The lying pose of the cast sheet (what a corpse is drawn with), for someone in bed. */
function LyingSprite({ character, flip }: { character: CharacterId | undefined; flip?: boolean }) {
  const frame = lyingFrame(character);
  return <div className="lying-sprite" style={{ backgroundImage: frame && `url(${frame.url})`, backgroundPosition: frame && `${-frame.sx}px ${-frame.sy}px`, transform: flip ? "scaleX(-1)" : undefined }} />;
}

/** One sitting frame of the cast sheet, drawn at 1x like the lying corpse. */
function SeatedSprite({ character, seat }: { character: CharacterId | undefined; seat: Seat }) {
  const frame = sittingFrame(character, seat.facing);
  return (
    <div
      className="seated-sprite"
      style={{
        backgroundImage: frame && `url(${frame.url})`,
        backgroundPosition: frame && `${-frame.sx}px ${-frame.sy}px`,
        transform: seat.flip ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

/**
 * The see-through outline: a 1px rim around the person's silhouette with a soft glow, over a faint fill.
 * An SVG filter, because CSS alone can't outline a sprite without also drawing it.
 */
function EspFilter({ id }: { id: string }) {
  const ALPHA = "SourceAlpha"; // i18n-ignore: SVG filter input name
  return (
    <svg className="iso-esp-defs" aria-hidden="true" width="0" height="0">
      <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
        <feMorphology in={ALPHA} operator="dilate" radius="1" result="grown" />
        <feComposite in="grown" in2={ALPHA} operator="out" result="rim" />
        <feFlood className="iso-esp-color" result="color" />
        <feComposite in="color" in2="rim" operator="in" result="outline" />
        <feGaussianBlur in="outline" stdDeviation="1.5" result="glow" />
        <feComposite in="color" in2={ALPHA} operator="in" result="body" />
        <feComponentTransfer in="body" result="fill">
          <feFuncA type="linear" slope="0.3" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="fill" />
          <feMergeNode in="outline" />
        </feMerge>
      </filter>
    </svg>
  );
}
