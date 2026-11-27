// One room of the original isometric ship, with the rooms around it. This is the view's controller:
// it decides what is where (placement, walking, the camera) and how it looks (describeScene), and
// handles input; a renderer behind the SceneRenderer seam (scene.ts) only draws the result. People
// emit a selection, doors move intents; legality comes from props.
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
// a wall is drawn over (PlacedSprite.occluded) also gets a see-through outline
// above everything. People in this room still take clicks through it.

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { CAMERA_EQUIPMENT, CORPSE_ITEM, DYNARCADE_EQUIPMENT, EQUIPMENT_TYPES, PROJECT_COMPLETE, RESEARCH_COMPLETE, SUPPORT_DRONE_ITEM, SUPER_CALC_EQUIPMENT, doorOtherRoom, placedEquipment, type EquipmentView, type RoomId, type RoomLayout, type ShipLayout, type Spot, type Target } from "@mush2/shared";
import type { Bubble } from "../scene/useSpeechBubbles.ts";
import { useNames } from "../i18n/names.ts";
import { CAMERA_SLICES, LOCKER_HOVER_KEY, equipmentByTileKey, isLockerSlice, roomAsBuilt } from "./equipmentTiles.ts";
import { SLICE_OUTLINES, insideOutline } from "./outlines.ts";
import { opaqueAt, preloadImage } from "./hitMask.ts";
import { useWalkers, type Goal } from "./useWalkers.ts";
import type { ActingOn } from "./useActingOn.ts";
import type { RendererChoice } from "../rendererChoice.ts";
import { DomScene } from "./dom/DomScene.tsx";
import { SceneOverlay, type Anchor } from "./SceneOverlay.tsx";
import {
  CORPSE_PREFIX,
  DRONE_PREFIX,
  DRONE_SHIFT,
  DRONE_SIZE,
  LYING_SIZE,
  corpseOf,
  droneOf,
  HOSTILE_PREFIX,
  hostileOf,
  describeScene,
  doorOpenMs,
  FADE_MS,
  imageOf,
  type Corpse,
  type Drone,
  type Hostile,
  type FrameTarget,
  type Occupant,
  type SceneRendererProps,
  type Seat,
  type ShipPace,
  type ShipTurn,
} from "./scene.ts";
import type { DoorMove } from "./doorMoves.ts";
import {
  bounds,
  cellAtPoint,
  doorPassage,
  doorSpot,
  hitTest,
  neighborRooms,
  placeWithSlots,
  prepareScene,
  spreadActors,
  lyingPose,
  offFloorStep,
  standSpot,
  stepsOnto,
  terminalSpot,
  walkableCells,
  walkPath,
  type DoorStep,
  type PlacedSprite,
} from "./placement.ts";

/** What can draw the scene. Pixi is loaded only when picked, so it stays out of the main bundle. */
const RENDERERS: Record<RendererChoice, ComponentType<SceneRendererProps>> = {
  dom: DomScene,
  pixi: lazy(() => import("./pixi/PixiScene.tsx")),
};

/** Something in this room that can be clicked, with its box in client (viewport) pixels. */
interface IsoTarget {
  key: string;
  kind: "door" | "equipment" | "person" | "item" | "hostile";
  title: string;
  you: boolean;
  reachable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dev builds put this on `.iso-viewport` as `isoProbe`, for tools/src/play. */
interface IsoProbe {
  /** The key of what the pointer is over, as hit-testing sees it. */
  hover: string | null;
  /** The drawn scene, in CSS pixels. */
  size: { width: number; height: number };
  targets(): IsoTarget[];
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

/**
 * The direction of the chair on a cell of the room, "" for one without a direction (a stool), or undefined
 * if there's no chair there.
 */
function chairAt(layout: ShipLayout, room: RoomLayout | undefined, cell: { x: number; y: number }): string | undefined {
  const t = room?.tiles.find((t) => t.kind === "entity" && t.x === cell.x && t.y === cell.y && layout.slices[t.slice]?.flags.includes("chair"));
  return t ? layout.slices[t.slice]?.dir ?? "" : undefined;
}

/** Scenery swaps (`looks`) from completed ship projects, researches, and stateful equipment. */
export function roomLooks(
  pilgredRepaired: boolean,
  humanTankFull?: boolean,
  superCalcBuilt?: boolean,
  neronThread?: boolean,
  bayDoorXxl?: boolean,
  plasmaShield?: boolean,
  takeoffThruster?: boolean,
  extraAmmo?: boolean,
  blasterGun?: boolean,
  fissionCoffee?: boolean,
  guaranaCoffee?: boolean,
  auxiliaryTerminal?: boolean,
  heatLamp?: boolean,
  hydroponicIncubator?: boolean,
  icarusAntigrav?: boolean,
  icarusLargerBay?: boolean,
): ReadonlyMap<string, string> {
  const looks = new Map<string, string>();
  if (auxiliaryTerminal) {
    looks.set("auxiliary_terminal_neron", neronThread ? "auxiliary_terminal_neron_upgrade_b" : "auxiliary_terminal_neron_upgrade_a");
  }
  if (pilgredRepaired) looks.set("core_pilgred", "core_pilgred_upgrade");
  if (humanTankFull) looks.set("human_tank", "human_tank_full");
  if (superCalcBuilt) looks.set("server", "server_active");
  if (bayDoorXxl) looks.set("bay_window", "bay_window_upgrade");
  if (plasmaShield) looks.set("plasma_shield", "plasma_shield_upgrade");
  if (takeoffThruster) {
    looks.set("bay_alpha_platform", "bay_alpha_platform_upgrade");
    looks.set("bay_beta_platform", "bay_beta_platform_upgrade");
  }
  if (extraAmmo && blasterGun) looks.set("spaceship", "spaceship_upgrade_ab");
  else if (extraAmmo) looks.set("spaceship", "spaceship_upgrade_a");
  else if (blasterGun) looks.set("spaceship", "spaceship_upgrade_b");
  if (fissionCoffee && guaranaCoffee) looks.set("coffee", "coffee_upgrade_ab");
  else if (fissionCoffee) looks.set("coffee", "coffee_upgrade_a");
  else if (guaranaCoffee) looks.set("coffee", "coffee_upgrade_b");
  if (hydroponicIncubator && heatLamp) looks.set("garden", "garden_upgrade_ab");
  else if (hydroponicIncubator) looks.set("garden", "garden_upgrade_a");
  else if (heatLamp) looks.set("garden", "garden_upgrade_b");
  if (icarusAntigrav && icarusLargerBay) looks.set("icarus", "icarus_upgrade_ab");
  else if (icarusAntigrav) looks.set("icarus", "icarus_upgrade_a");
  else if (icarusLargerBay) looks.set("icarus", "icarus_upgrade_b");
  return looks;
}

/** The index of the last step in a doorway. */
const lastInDoorway = (steps: readonly DoorStep[]) => steps.reduce((last, s, i) => (s.door ? i : last), -1);

/** Someone who just went out of your room: by the door to `to`, or with no door to show, fading out at `cell`. */
type Leaver = { visit: number; person: Occupant; to?: RoomId; cell?: { x: number; y: number } };

export function IsoRoom({
  layout,
  room,
  occupants,
  nearby,
  fogDepth,
  renderer,
  corpses,
  drones,
  hostiles = [],
  equipment,
  reachable,
  brokenDoors,
  reportedBroken,
  selected,
  selectedDoor,
  actingOn,
  sentCount,
  atTerminal = false,
  teleport,
  snap = false,
  leavingTo,
  onLeft,
  doorMoves,
  onMove,
  onWalk,
  onSelect,
  onClear,
  onDoorTap,
  onOpenInventory,
  inventoryOpen = false,
  bubbles,
  zoom,
  onZoomStep,
  pilgredRepaired,
  humanTankFull,
  projects,
  research,
  pace,
  planet,
  turn,
  onFire,
  titleId,
}: {
  layout: ShipLayout;
  room: RoomId;
  occupants: Occupant[];
  /** People the view places in other rooms, by room. Only the rooms behind this room's doors are drawn. */
  nearby: Partial<Record<RoomId, Occupant[]>>;
  /** How many rooms out from this one are drawn (fogged): 1 is just those behind its doors, "all" is the whole ship. */
  fogDepth: 1 | 2 | "all";
  /** Which renderer draws the room (a viewer setting). */
  renderer: RendererChoice;
  /** Magnification of the drawn room (a viewer setting, 1 = one screen pixel per source pixel). */
  zoom: number;
  /** One zoom step in (1) or out (-1), from the + and - keys while the room view has focus. */
  onZoomStep: (dir: 1 | -1) => void;
  /** Corpses on this room's floor (items, drawn lying down). A carried corpse isn't on the floor, so isn't here. */
  corpses: Corpse[];
  /** Support drones on this room's floor (items, #411). A carried one isn't on the floor, so isn't here. */
  drones: Drone[];
  /** Hostile NPCs in this room (shared/src/hostiles.ts), drawn standing; clicking one selects it (`Target` kind `hostile`). */
  hostiles?: Hostile[];
  /** Equipment in this room, from the view. Only these sprites are clickable. */
  equipment: EquipmentView[];
  reachable: Set<RoomId>;
  /** Rooms whose door from this room is broken (drawn shut and marked). */
  brokenDoors?: ReadonlySet<RoomId>;
  /** Ids of broken equipment on the alert bar (reported, or found by the Anomaly detector): smoking in the rooms next door too. */
  reportedBroken?: ReadonlySet<string>;
  selected: Target | null;
  /** The door whose target is shown in the peek bar, if any. */
  selectedDoor: RoomId | null;
  /** Whether the room is currently on fire (PlayerView.roomOnFire). */
  onFire?: boolean;
  /** The id of the room's name, on the location plate over the room view (GameView): it labels the scene. */
  titleId: string;
  /** What your latest action is on: you walk up to it when this changes (useActingOn). */
  actingOn: ActingOn | null;
  /** Changes whenever you send an action: you get up from your chair. */
  sentCount: number;
  /** A terminal's window is open: you stay at it (the server's `occupancy` spot, #192); once it closes, you get up. */
  atTerminal?: boolean;
  /** The instant actions cheat is on: you jump wherever you'd walk (others still walk), except with a wheelchair, which walks for you both. */
  teleport: boolean;
  /** Everyone jumps to where they should be this render, nobody walks (a replay's jump back or across cycles). */
  snap?: boolean;
  /** You've already moved there: walk to the door to it, then `onLeft` (LeavingIsoRoom shows the next room). */
  leavingTo: RoomId | null;
  onLeft: () => void;
  /** Where people last came in from or went out to, if just now (by player id): they walk through that door, or fade in or out where they stand. */
  doorMoves: ReadonlyMap<string, DoorMove>;
  onMove: (to: RoomId) => void;
  /** You walked to a cell (sitting if it's a chair): the server tells your roommates (spot.ts in shared). Pushing a wheelchair, the cell is where it goes and `behind` where you end up. */
  /** Absent in a read-only view (a replay): clicking the floor then walks nowhere. */
  onWalk?: ((cell: { x: number; y: number }, sitting: boolean, behind?: { x: number; y: number }) => void) | undefined;
  onSelect: (target: Target) => void;
  /** Bare floor was tapped: drop the selection (and any peeked door). */
  onClear: () => void;
  /** A single click or tap on any door, reachable or not. */
  onDoorTap: (to: RoomId) => void;
  /** The room's shelf/locker was clicked: open the inventory overlay. */
  onOpenInventory?: () => void;
  /** Whether the inventory overlay is currently open (highlights the room's shelf/locker). */
  inventoryOpen?: boolean;
  /** Recent global chat per sender, oldest first, shown as speech bubbles over their heads. */
  bubbles: ReadonlyMap<string, Bubble[]>;
  /** PILGRED works (public): its core in the engine room is drawn as the animated globe. */
  pilgredRepaired: boolean;
  /** A Mush has died on the ship (public): the sick bay's human_tank shows a person in it. */
  humanTankFull?: boolean;
  /** Visible NERON projects (percent done); completed ones swap bay doors, plasma shield coils and auxiliary terminals. */
  projects?: Readonly<Record<string, number>>;
  /** Visible researches (percent done); completed ones swap equipment looks such as the coffee machine. */
  research?: Readonly<Record<string, number>>;
  /** How fast the ship is going: the stars behind it stream at that rate. */
  pace: ShipPace;
  /** The planet the ship orbits, as an image URL (public), or null. */
  planet: string | null;
  /** The ship's latest turn (public): the stars turn the other way. */
  turn: ShipTurn | null;
}) {
  const names = useNames();
  const { t } = useTranslation();
  // Built equipment (a sofa, the MycoScan) is drawn at the room's spot; only here, like the camera.
  const builtKey = equipment
    .filter((e) => EQUIPMENT_TYPES[e.type]?.builtOnly)
    .map((e) => e.type)
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: builtKey stands in for equipment: the room only changes when built equipment comes or goes.
  const roomLayout = useMemo(() => {
    const r = layout.rooms.find((r) => r.id === room);
    return r && roomAsBuilt(r, equipment);
  }, [layout, room, builtKey]);
  // The layout has a camera tile in every room. It is drawn only here, and only once a camera is installed
  // (other rooms' cameras are hidden information, so they are never drawn).
  const hasCamera = equipment.some((e) => e.type === CAMERA_EQUIPMENT);
  const occupantKey = occupants.map((o) => `${o.id}${o.lying ?? ""}`).join(",");
  const corpseKey = corpses.map((c) => c.id).join(",");
  const droneKey = drones.map((d) => d.id).join(",");
  const hostileKey = hostiles.map((h) => `${h.id}${h.kind}`).join(",");
  const viewportRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FrameTarget | null>(null);
  const overlayRef = useRef<FrameTarget>(null);
  // Where you've clicked to walk, drawn at once. The server hears of it too (`onWalk`) and shows it to your
  // roommates, except walks up to what a non-public action is on. It resets when you change rooms (it belongs
  // to one visit; the view's spot says where you came in). Sitting on a chair is the walk's end point plus the seat taken there.
  // Pushing a wheelchair, `steer` is where you clicked, where the wheelchair goes, and `cell` the one you end up in behind it.
  const [walk, setWalk] = useState<{ visit: number; cell: { x: number; y: number }; seat?: Seat; steer?: { x: number; y: number } } | null>(null);
  const cells = useMemo(() => (roomLayout ? walkableCells(layout, roomLayout) : []), [layout, roomLayout]);
  const mySpot = occupants.find((o) => o.you)?.spot;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only sending an action gets you up; at a terminal, its own actions keep you there.
  useEffect(() => {
    if (mySpot?.kind !== "occupancy") setWalk((w) => (w?.seat ? { ...w, seat: undefined } : w));
  }, [sentCount]);
  const spots = useMemo(
    () => spreadActors(cells, occupants.length + corpses.length + drones.length + hostiles.length),
    [cells, occupants.length, corpses.length, drones.length, hostiles.length],
  );
  /** Where the `i`th drone sits: the spots after the people's and the bodies'. */
  const droneSpot = (i: number) => spots[occupants.length + corpses.length + i];
  /** Where the `i`th hostile NPC stands: the spots after the drones'. */
  const hostileSpot = (i: number) => spots[occupants.length + corpses.length + drones.length + i];

  // The tiles of this room and the rooms behind its doors, sorted once; people walking only re-place the people.
  const prepared = useMemo(() => {
    if (!roomLayout) return undefined;
    const rooms = neighborRooms(layout, roomLayout, fogDepth).map((n) => ({ ...n, cells: walkableCells(layout, n.room) }));
    return { rooms, scene: prepareScene(layout, [{ room: roomLayout, dx: 0, dy: 0 }, ...rooms]) };
  }, [layout, roomLayout, fogDepth]);

  // Neighbours' equipment reported broken smokes as it would in its own room (sprite keys as `tileSortables` names them).
  const smokingNeighbors = useMemo(() => {
    const keys = new Set<string>();
    if (!prepared || !reportedBroken?.size) return keys;
    for (const { room: n } of prepared.rooms) {
      for (const p of placedEquipment(n)) if (reportedBroken.has(p.id)) keys.add(`${n.id}/t${p.tile}`);
    }
    return keys;
  }, [prepared, reportedBroken]);

  // The walk through each door, worked out once per scene.
  const passages = useMemo(() => {
    const found = new Map<string, DoorStep[] | undefined>();
    return (to: string) => {
      if (!found.has(to)) found.set(to, prepared && doorPassage(prepared.scene, cells, to));
      return found.get(to);
    };
  }, [prepared, cells]);
  const openMs = useMemo(() => {
    const ms = new Map(prepared?.scene.statics.filter((s) => s.door).map((s) => [s.key, doorOpenMs(layout.slices[s.slice])]));
    return (door: string) => ms.get(door) ?? 0;
  }, [prepared, layout]);

  // Everyone walks to their spot (you to where you clicked). Coming into a room, you step out of the
  // doorway you came through and stand in front of it until you walk off. Cosmetic like the spots: nothing waits for it.
  const visit = useRef<{ room: RoomId; from: RoomId | null; n: number }>({ room, from: null, n: 0 });
  if (visit.current.room !== room) visit.current = { room, from: visit.current.room, n: visit.current.n + 1 };
  const here = walk?.visit === visit.current.n ? walk : undefined;
  const me = occupants.find((o) => o.you);
  // You can't wander the room while lying in bed or while someone pushes your wheelchair.
  const rooted = !!me?.lying || !!me?.statuses.includes("accommodated");
  /** Whoever `id` pushes in a wheelchair here: they steer it, and `id` walks behind (useWalkers' `Goal.behind`). */
  const pusheeOf = (id: string | undefined) => (id === undefined ? undefined : occupants.find((o) => o.pushedBy === id));
  const myPushee = pusheeOf(me?.id);
  const entryCell = roomLayout && visit.current.from ? doorSpot(layout, roomLayout, visit.current.from, cells) : undefined;
  const exitCell = roomLayout && leavingTo ? doorSpot(layout, roomLayout, leavingTo, cells) : undefined;
  /** The way out through the door to `to`, from the cell in front of it: to the far side, or (`you`) into the doorway, where the view changes rooms. */
  const wayOut = (to: string, you: boolean) => {
    const out = passages(to)?.slice().reverse();
    return out && out.slice(1, you ? lastInDoorway(out) + 1 : undefined);
  };
  /** The way in through the door from `from`, to the cell in front of it: from the far side, or (`you`) from the doorway you left the last room by. */
  const wayIn = (from: string, you: boolean) => {
    const way = passages(from);
    return way && (you ? way.slice(lastInDoorway(way)) : way);
  };

  // Others who just went out: through a door, drawn walking out until they're through it; or with no door to show
  // (the view gives no direction without Tracker), drawn fading out where they stood (`cell`) for `FADE_MS`.
  const [leavers, setLeavers] = useState<Leaver[]>([]);
  // Others who just came in with no door to show, fading in for `FADE_MS`.
  const [fadingIn, setFadingIn] = useState<{ visit: number; ids: readonly string[] }>({ visit: -1, ids: [] });
  // Where each walker stands, for the effect below, which runs after `useWalkers` has given them.
  const walkerCells = useRef<ReadonlyMap<string, { cell: { x: number; y: number } }>>(new Map());
  const walkingOut = leavers.filter((l) => l.visit === visit.current.n && !occupants.some((o) => o.id === l.person.id));
  // Who was here last time, to tell who just came in or went out.
  const lastSeen = useRef({ visit: visit.current.n, ids: new Set(occupants.map((o) => o.id)), occupants });
  const seen = lastSeen.current.visit === visit.current.n ? lastSeen.current : undefined;
  const visitN = visit.current.n;
  // biome-ignore lint/correctness/useExhaustiveDependencies: occupantKey stands in for occupants; a new room counts too, though the same people may be there.
  useEffect(() => {
    const before = lastSeen.current;
    lastSeen.current = { visit: visit.current.n, ids: new Set(occupants.map((o) => o.id)), occupants };
    if (before.visit !== visit.current.n) return;
    const gone = before.occupants.flatMap((person): Leaver[] => {
      if (person.you || lastSeen.current.ids.has(person.id)) return [];
      const move = doorMoves.get(person.id);
      if (move?.to && wayOut(move.to, false)) return [{ visit: visit.current.n, person, to: move.to }];
      const cell = walkerCells.current.get(person.id)?.cell;
      return move?.fadeOut && cell ? [{ visit: visit.current.n, person, cell }] : [];
    });
    if (gone.length) setLeavers((ls) => [...ls.filter((l) => l.visit === visit.current.n && !gone.some((g) => g.person.id === l.person.id)), ...gone]);
    const came = occupants.filter((o) => !o.you && !before.ids.has(o.id) && doorMoves.get(o.id)?.fadeIn).map((o) => o.id);
    if (came.length) setFadingIn((f) => ({ visit: visit.current.n, ids: [...(f.visit === visit.current.n ? f.ids : []), ...came] }));
  }, [occupantKey, visitN]);
  const drawnPeople = [...occupants, ...walkingOut.map((l) => l.person)];
  // Fades end on their own clock: a fading leaver is gone, a newcomer fully drawn.
  const fadingOutKey = walkingOut
    .filter((l) => !l.to)
    .map((l) => l.person.id)
    .join(",");
  useEffect(() => {
    if (!fadingOutKey) return;
    const ids = fadingOutKey.split(",");
    const t = setTimeout(() => setLeavers((ls) => ls.filter((l) => l.to || !ids.includes(l.person.id))), FADE_MS);
    return () => clearTimeout(t);
  }, [fadingOutKey]);
  const fadingInKey = fadingIn.ids.join(",");
  useEffect(() => {
    if (!fadingInKey) return;
    const t = setTimeout(() => setFadingIn({ visit: -1, ids: [] }), FADE_MS);
    return () => clearTimeout(t);
  }, [fadingInKey]);
  // Who fades, by person id. A newcomer counts from the render they first appear in, before the effect above records them.
  const fading = new Map<string, "in" | "out">();
  for (const o of occupants) {
    const fresh = !!seen && !seen.ids.has(o.id) && !o.you && !!doorMoves.get(o.id)?.fadeIn;
    if (fresh || (fadingIn.visit === visit.current.n && fadingIn.ids.includes(o.id))) fading.set(o.id, "in");
  }
  for (const l of walkingOut) if (!l.to) fading.set(l.person.id, "out");
  const fadingKey = [...fading].map(([id, f]) => `${id}:${f}`).join(";");
  // Someone in bed lies where the original put them (`lyingPose`), mirrored to run along the bed.
  const beds = new Map<string, NonNullable<ReturnType<typeof lyingPose>>>();
  const equipmentByKey = useMemo(() => equipmentByTileKey(roomLayout, equipment), [roomLayout, equipment]);
  // A patrol ship in flight isn't drawn in its bay (owner, 2026-10-24); the view marks its interface out.
  const flownKey = [...equipmentByKey].filter(([, e]) => e.out).map(([key]) => key).join(",");
  // Once CALL_OF_DIRTY completes, the Dynarcade replaces the broken patrol ship in Alpha Bay 2.
  const dynarcadeDone = (projects?.CALL_OF_DIRTY ?? 0) >= PROJECT_COMPLETE || equipment.some((e) => e.type === DYNARCADE_EQUIPMENT);
  const tileOf = new Map([...equipmentByKey].map(([key, e]) => [e.id, Number(key.slice(1))]));
  for (const o of occupants) {
    const tile = o.lying ? tileOf.get(o.lying) : undefined;
    const pose = tile === undefined || !roomLayout ? undefined : lyingPose(layout, roomLayout, tile);
    if (pose) beds.set(o.id, pose);
  }
  const myExit = leavingTo ? wayOut(leavingTo, true) : undefined;
  // Where the view says someone stands: a cell of this floor, or in front of the door they came in by. A cell
  // that isn't this room's floor (an old or tampered spot) counts as no spot.
  const floorKeys = useMemo(() => new Set(cells.map((c) => `${c.x},${c.y}`)), [cells]);
  // At a terminal (#192): its chair, or its standing spot.
  const atTerminalOf = (spot: Spot | undefined) => (spot?.kind === "occupancy" && roomLayout ? terminalSpot(layout, roomLayout, spot.equipment, spot.chair, cells) : undefined);
  const spotCell = (spot: Spot | undefined) =>
    !spot || !roomLayout
      ? undefined
      : spot.kind === "door"
        ? doorSpot(layout, roomLayout, spot.door, cells)
        : spot.kind === "occupancy"
          ? atTerminalOf(spot)?.cell
          : floorKeys.has(`${spot.x},${spot.y}`)
            ? { x: spot.x, y: spot.y }
            : undefined;
  /** Going to `cell`: a seat off the floor (inside a turret, #192) is climbed into from the floor cell nearest it. */
  const onto = (cell: { x: number; y: number }): Goal => {
    const step = offFloorStep(cells, cell);
    return step ? { cell: step, then: stepsOnto(step, cell) } : { cell };
  };
  const targets = new Map<string, Goal>(
    occupants.map((o, i) => {
      const bed = beds.get(o.id)?.cell;
      if (bed) return [o.id, { cell: bed }];
      // Pushing a wheelchair, you walk behind it rather than to a cell of your own (except out through a door).
      const behind = pusheeOf(o.id)?.id;
      if (o.you) {
        // Pushed in a wheelchair, you go where your pusher steers you (your spot), not where you came in.
        const cell = exitCell ?? (o.pushedBy !== undefined ? spotCell(o.spot) : undefined) ?? here?.cell ?? entryCell ?? spotCell(o.spot) ?? spots[i] ?? { x: 0, y: 0 };
        return [o.id, { ...(myExit ? { cell, then: myExit } : onto(cell)), ...(visit.current.from && { from: wayIn(visit.current.from, true) }), ...(behind && !myExit && { behind }) }];
      }
      // Someone who just came in walks in through the door they came by. The wheelchair you push goes where you steered it, at once.
      const from = seen && !seen.ids.has(o.id) ? doorMoves.get(o.id)?.from : undefined;
      const steered = o.pushedBy === me?.id ? here?.steer : undefined;
      return [o.id, { ...onto(steered ?? spotCell(o.spot) ?? spots[i] ?? { x: 0, y: 0 }), ...(from && { from: wayIn(from, false) }), ...(behind && { behind }) }];
    }),
  );
  for (const l of walkingOut) {
    if (!l.to) {
      if (l.cell) targets.set(l.person.id, { cell: l.cell });
      continue;
    }
    const out = wayOut(l.to, false);
    const cell = doorSpot(layout, roomLayout!, l.to, cells);
    if (out && cell) targets.set(l.person.id, { cell, then: out });
  }
  // Each animation frame while anyone walks: the camera and the walkers' pixel shifts, to the renderer and the overlay.
  const paint = useRef<((offsetOf: (id: string) => { x: number; y: number }) => void) | null>(null);
  const { at: walkers, doors, apply: applyWalkers, offsetOf } = useWalkers(room, cells, targets, openMs, paint, teleport && !myPushee && me?.pushedBy === undefined ? me?.id : undefined, snap);
  walkerCells.current = walkers;
  const myWalker = me && walkers.get(me.id);
  const standsAt = (w: { cell: { x: number; y: number }; moving: boolean } | undefined, c: { x: number; y: number }) => !!w && !w.moving && w.cell.x === c.x && w.cell.y === c.y;
  // Walking out: done once you stand in the doorway (straight away if there's no door to go through).
  const exitAt = myExit?.at(-1) ?? exitCell;
  const outside = !!leavingTo && (!exitAt || !myWalker || standsAt(myWalker, exitAt));
  // Others walking out are gone once through.
  const throughKey = walkingOut
    .filter((l) => {
      if (!l.to) return false;
      const end = targets.get(l.person.id)?.then?.at(-1);
      return !end || standsAt(walkers.get(l.person.id), end);
    })
    .map((l) => l.person.id)
    .join(",");
  useEffect(() => {
    if (throughKey) setLeavers((ls) => ls.filter((l) => !throughKey.split(",").includes(l.person.id)));
  }, [throughKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onLeft is rebuilt every render; reaching the door is what matters.
  useEffect(() => {
    if (outside) onLeft();
  }, [outside]);
  const arrived = !!myWalker && !myWalker.moving && !!here && myWalker.cell.x === here.cell.x && myWalker.cell.y === here.cell.y;
  // Who sits, once they've reached the chair: you on the one you clicked (or, back from a reload, the view's), others by the view.
  const seats = new Map<string, Seat>();
  for (const o of occupants) {
    const w = walkers.get(o.id);
    if (o.lying || !w || w.moving) continue;
    if (o.you && here) {
      if (arrived && here.seat) seats.set(o.id, here.seat);
      continue;
    }
    const terminal = atTerminalOf(o.spot);
    const spot = terminal?.chair !== undefined ? terminal.cell : o.spot?.kind === "cell" && o.spot.sitting ? o.spot : undefined;
    const dir = spot && w.cell.x === spot.x && w.cell.y === spot.y ? (terminal?.chair ?? chairAt(layout, roomLayout, spot)) : undefined;
    if (dir !== undefined) seats.set(o.id, seatFor(dir || undefined));
  }
  const seatsKey = [...seats].map(([id, s]) => `${id}:${s.facing}${s.flip ? "f" : ""}`).join(";");
  const walkersKey = [...walkers].map(([id, w]) => `${id}@${w.cell.x},${w.cell.y}${w.facing.flip ? "f" : ""}`).join(";");
  const doorsKey = [...doors].map(([k, d]) => `${k}:${d}`).join(";");
  // How they look on top of where they are: the strip and the walk cycle can change without a step into another cell (stopping, mostly).
  const walkersLook = [...walkers].map(([id, w]) => `${id}:${w.facing.strip}${w.moving ? "m" : ""}${w.arriving ? "a" : ""}`).join(";");

  // This room and the rooms behind its doors, each with its people, drawn as one scene so that
  // whichever is in front covers the other. Display only: where people stand isn't game state.
  const nearbyKey = JSON.stringify(Object.entries(nearby).map(([r, os]) => [r, os?.map((o) => o.id)]));
  // biome-ignore lint/correctness/useExhaustiveDependencies: occupantKey, corpseKey, droneKey, hostileKey, nearbyKey, walkersKey, flownKey and leavers stand in for occupants, corpses, drones, hostiles, nearby, walkers, flown ships and those walking out: positions only change when who or what is where changes.
  const { scene, sprites, neighborSprites, neighbors, box, ownCells, fireSlots } = useMemo(() => {
    if (!roomLayout || !prepared) return { scene: [], sprites: [], neighborSprites: [], neighbors: [], box: bounds([]), ownCells: new Set<string>(), fireSlots: undefined };
    const flown = new Set(flownKey.split(","));
    const actors = [
      ...drawnPeople.map((o, i) => ({
        id: o.id,
        cell: walkers.get(o.id)?.cell ?? spots[i] ?? { x: 0, y: 0 },
        ...(o.lying ? { ...LYING_SIZE, onTop: true, shift: beds.get(o.id)?.shift } : { width: 32, height: 48 }),
      })),
      // A corpse is placed like a person (so paint order and walls treat it the same) but drawn lying down.
      ...corpses.map((c, i) => ({ id: `${CORPSE_PREFIX}${c.id}`, cell: spots[occupants.length + i] ?? { x: 0, y: 0 }, ...LYING_SIZE })),
      // So is a drone, its shadow on the cell's centre.
      ...drones.map((d, i) => ({ id: `${DRONE_PREFIX}${d.id}`, cell: droneSpot(i) ?? { x: 0, y: 0 }, ...DRONE_SIZE, shift: DRONE_SHIFT })),
      // A hostile NPC stands like a person, on a spot of its own.
      ...hostiles.map((h, i) => ({ id: `${HOSTILE_PREFIX}${h.id}`, cell: hostileSpot(i) ?? { x: 0, y: 0 }, width: 32, height: 48 })),
    ];
    const neighbors = prepared.rooms.map(({ room: n, ring, cells }) => {
      // Someone still walking out of this room isn't drawn where they went yet.
      const people = (nearby[n.id as RoomId] ?? []).filter((o) => !walkingOut.some((l) => l.person.id === o.id));
      const spots = spreadActors(cells, people.length);
      const actors = people.map((o, i) => ({ id: o.id, cell: spots[i] ?? { x: 0, y: 0 }, width: 32, height: 48 }));
      return { actors, id: n.id as RoomId, people, ring };
    });
    const floorCells = new Set(roomLayout.tiles.filter((t) => t.kind === "ground").map((t) => `${t.x},${t.y}`));
    // A room on fire burns all over its floor, each cell at its own place in the paint order.
    const burning = onFire ? [...floorCells].map((c) => c.split(",").map(Number)).map(([x, y]) => ({ x: x!, y: y! })) : [];
    const placed = placeWithSlots(prepared.scene, [actors, ...neighbors.map((n) => n.actors)], burning);
    const scene = placed.sprites
      .filter((s) => !CAMERA_SLICES.has(s.slice) || (hasCamera && s.room === room))
      .filter((s) => !(dynarcadeDone && s.slice === "spaceship_broken"))
      .filter((s) => s.room !== room || !flown.has(s.key))
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
    const ownCells = new Set<string>();
    for (const c of floorCells) {
      const [x, y] = c.split(",").map(Number) as [number, number];
      for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) ownCells.add(`${ax},${ay}`);
    }
    return { scene, sprites, neighborSprites, neighbors, box: bounds(sprites), ownCells, fireSlots: onFire ? placed.slots : undefined };
  }, [prepared, spots, walkersKey, occupantKey, corpseKey, droneKey, hostileKey, nearbyKey, hasCamera, dynarcadeDone, flownKey, leavers, onFire]);

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
  const camX = Math.round(panel.width / zoom / 2 - youX);
  const camY = Math.round(panel.height / zoom / 2 - youY);
  /** Where the camera puts the world now: as rendered, shifted with you while you walk. */
  const cameraNow = () => {
    const o = me ? offsetOf(me.id) : { x: 0, y: 0 };
    return { x: camX - o.x, y: camY - o.y };
  };
  paint.current = (offsetOf) => {
    const frame = { camera: cameraNow(), offsetOf };
    rendererRef.current?.setFrame(frame);
    overlayRef.current?.setFrame(frame);
  };
  // After every render: put the walkers' in-between pixel shifts (and the camera) back on what was drawn.
  useLayoutEffect(applyWalkers);
  // A lazily loaded renderer (Pixi) mounts after that first frame went out, so it gets one as soon as it exists,
  // or it would draw with the camera at 0,0 until something next re-renders the room.
  const attachRenderer = useCallback(
    (r: FrameTarget | null) => {
      rendererRef.current = r;
      if (r) applyWalkers();
    },
    [applyWalkers],
  );


  // Acting on something walks you up to it: equipment's standing spot (as clicking it does), the
  // last cell before a person or a body on the floor, or the door you're moving through. Things not in this room, or not on its floor
  // (an item in an inventory), stay where they are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request walks; the rest is read as it stands then.
  useEffect(() => {
    // Pushing a wheelchair or pushed in one, you stay with it, unless what you do ends the push (shared `endsAccommodation`).
    if (!actingOn || !roomLayout || !myWalker || leavingTo || ((myPushee || me?.pushedBy !== undefined) && !actingOn.endsPush)) return;
    const { target } = actingOn;
    // Seated at a terminal (#192), what you do there keeps you in your chair: a walk would end it. With its window open
    // here, everything you do is its own; without, it may still be one sent from another tab where it is open.
    if (mySpot?.kind === "occupancy" && (atTerminal || (target.kind === "equipment" && target.id === mySpot.equipment))) return;
    let cell: { x: number; y: number } | undefined;
    if (target.kind === "door") {
      const to = "to" in target ? target.to : doorOtherRoom(target.id, room);
      cell = to ? doorSpot(layout, roomLayout, to, cells) : undefined;
    }
    else if (target.kind === "equipment") {
      const key = [...equipmentByKey].find(([, e]) => e.id === target.id)?.[0];
      cell = key ? standSpot(layout, roomLayout, Number(key.slice(1)), cells) : undefined;
    } else {
      const i = corpses.findIndex((c) => c.id === target.id);
      const d = drones.findIndex((c) => c.id === target.id);
      const h = target.kind === "hostile" ? hostiles.findIndex((c) => c.id === target.id) : -1;
      const onFloor = i >= 0 ? spots[occupants.length + i] : d >= 0 ? droneSpot(d) : h >= 0 ? hostileSpot(h) : undefined;
      const at = target.kind === "player" ? (target.id === me?.id ? undefined : walkers.get(target.id)?.cell) : onFloor;
      const path = at && walkPath(cells, myWalker.cell, at);
      cell = path && path.length > 1 ? path[path.length - 2] : undefined;
    }
    if (!cell) return;
    setWalk({ visit: visit.current.n, cell });
    // Opening a terminal: the server seats you (an `occupancy` spot), and a walk would undo it.
    if (actingOn.share && !actingOn.seats) onWalk?.(cell, false);
  }, [actingOn?.n]);

  // At a terminal (#192): you go to the chair the server gave you, or stand at it. Once its window is closed here (or
  // you were already seated when this view loaded, after a reload), you get up and step to its standing spot, which
  // ends it for your roommates too. Seated from another tab (the game open twice), where the window is, you stay put:
  // a walk from here would end the seat under that window.
  const occupancyKey = mySpot?.kind === "occupancy" ? `${mySpot.equipment}:${mySpot.chair ?? ""}` : "";
  /** This tab may get you up: it opened a terminal window since you last got up here, or loaded with you seated. */
  const mayGetUp = useRef<boolean | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new seat, or the window closing, moves you.
  useEffect(() => {
    const at = atTerminalOf(mySpot);
    if (atTerminal) mayGetUp.current = true;
    else mayGetUp.current ??= !!at;
    if (!at || !roomLayout || leavingTo) return;
    if (atTerminal || !mayGetUp.current) {
      setWalk({ visit: visit.current.n, cell: at.cell, ...(at.chair !== undefined && { seat: seatFor(at.chair || undefined) }) });
      return;
    }
    mayGetUp.current = false;
    const key = mySpot?.kind === "occupancy" ? [...equipmentByKey].find(([, e]) => e.id === mySpot.equipment)?.[0] : undefined;
    const stand = key ? standSpot(layout, roomLayout, Number(key.slice(1)), cells) : undefined;
    walkTo(stand ?? at.cell);
  }, [occupancyKey, atTerminal]);

  const ringOf = new Map(neighbors.map((n) => [n.id as string, n.ring]));
  const byId = new Map([...drawnPeople, ...neighbors.flatMap((n) => n.people)].map((o) => [o.id, o]));
  const superCalcBuilt = equipment.some((e) => e.type === SUPER_CALC_EQUIPMENT);
  const auxiliaryTerminal = (projects?.AUXILIARY_TERMINAL ?? 0) >= PROJECT_COMPLETE;
  const neronThread = (projects?.NERON_PROJECT_THREAD ?? 0) >= PROJECT_COMPLETE;
  const bayDoorXxl = (projects?.BAY_DOOR_XXL ?? 0) >= PROJECT_COMPLETE;
  const plasmaShield = (projects?.PLASMA_SHIELD ?? 0) >= PROJECT_COMPLETE;
  const takeoffThruster = (projects?.PATROL_SHIP_LAUNCHER ?? 0) >= PROJECT_COMPLETE;
  const extraAmmo = (projects?.PATROLSHIP_EXTRA_AMMO ?? 0) >= PROJECT_COMPLETE;
  const blasterGun = (projects?.PATROLSHIP_BLASTER_GUN ?? 0) >= PROJECT_COMPLETE;
  const fissionCoffee = (projects?.FISSION_COFFEE_ROASTER ?? 0) >= PROJECT_COMPLETE;
  const guaranaCoffee = (research?.GUARANA_CAPUCCINO ?? 0) >= RESEARCH_COMPLETE;
  const heatLamp = (projects?.HEAT_LAMP ?? 0) >= PROJECT_COMPLETE;
  const hydroponicIncubator = (projects?.HYDROPONIC_INCUBATOR ?? 0) >= PROJECT_COMPLETE;
  const icarusAntigrav = (projects?.ICARUS_ANTIGRAV_PROPELLER ?? 0) >= PROJECT_COMPLETE;
  const icarusLargerBay = (projects?.ICARUS_LARGER_BAY ?? 0) >= PROJECT_COMPLETE;
  const looks = useMemo(
    () => roomLooks(pilgredRepaired, humanTankFull, superCalcBuilt, neronThread, bayDoorXxl, plasmaShield, takeoffThruster, extraAmmo, blasterGun, fissionCoffee, guaranaCoffee, auxiliaryTerminal, heatLamp, hydroponicIncubator, icarusAntigrav, icarusLargerBay),
    [pilgredRepaired, humanTankFull, superCalcBuilt, neronThread, bayDoorXxl, plasmaShield, takeoffThruster, extraAmmo, blasterGun, fissionCoffee, guaranaCoffee, auxiliaryTerminal, heatLamp, hydroponicIncubator, icarusAntigrav, icarusLargerBay],
  );
  const imageInput = { layout, room, people: byId, walkers, seats, fading, corpses, drones, hostiles, looks };

  // Load every image this room hit-tests against, so masks are ready by the first click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-preload only when the sprite set changes; the image input is rebuilt every render.
  useEffect(() => {
    for (const s of scene) {
      const url = imageOf(s, imageInput).url;
      if (url) preloadImage(url);
    }
  }, [scene]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverAt, setHoverAt] = useState({ x: 0, y: 0 });

  // What the renderer draws. Rebuilt when the placed scene, the people, or what's selected, hovered or reachable changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: walkersKey and walkersLook stand in for walkers, doorsKey for doors; occupants, nearby, corpses, drones and hostiles for the image input and beds built from them.
  const drawn = useMemo(
    () =>
      describeScene({
        ...imageInput,
        placed: scene,
        box,
        beds,
        equipment: equipmentByKey,
        reachable,
        brokenDoors,
        smokingNeighbors,
        selected,
        selectedDoor,
        inventoryOpen,
        hoverKey,
        ownCells,
        doors,
        pace,
        planet,
        turn,
        fireSlots,
      }),
    [scene, box, walkersKey, walkersLook, doorsKey, seatsKey, fadingKey, occupants, nearby, corpses, drones, hostiles, equipmentByKey, reachable, brokenDoors, smokingNeighbors, selected, selectedDoor, inventoryOpen, hoverKey, ownCells, looks, pace, planet, turn, fireSlots],
  );
  // Badges and bubbles go over the people in this room.
  const anchors = drawn.sprites.flatMap((s): Anchor[] => {
    const person = s.role === "person" && sprites.some((p) => p.key === s.key) ? byId.get(s.key.slice(2)) : undefined;
    return person ? [{ key: s.key, x: s.x, y: s.y, width: s.width, height: s.height, person }] : [];
  });

  const Renderer = RENDERERS[renderer];

  // Dev builds only: what the screenshot tools need to find things to click, whichever renderer draws
  // the room (the Pixi one has no element per sprite). Rebuilt every render, so it reads what's current.
  useEffect(() => {
    const el = viewportRef.current as (HTMLElement & { isoProbe?: IsoProbe }) | null;
    if (!import.meta.env.DEV || !el) return;
    el.isoProbe = {
      hover: hoverKey,
      size: { width: drawn.width, height: drawn.height },
      targets: () => {
        if (!roomLayout) return [];
        const rect = el.getBoundingClientRect();
        const cam = cameraNow();
        return sprites.flatMap((s): IsoTarget[] => {
          const action = interaction(s);
          if (!action || action.kind === "chair" || action.kind === "locker") return [];
          const o = s.kind === "actor" ? offsetOf(s.key.slice(2)) : { x: 0, y: 0 };
          return [{
            key: s.key,
            kind: action.kind,
            title: action.title,
            you: action.kind === "person" && action.person.you,
            reachable: action.kind === "door" && reachable.has(action.to),
            x: rect.left + (cam.x - box.minX + s.left + o.x) * zoom,
            y: rect.top + (cam.y - box.minY + s.top + o.y) * zoom,
            width: s.width * zoom,
            height: s.height * zoom,
          }];
        });
      },
    };
  });

  if (!roomLayout) return <section className="iso-room missing">No map for {names.room(room)}</section>;

  /** What a sprite does when clicked, or null for scenery. */
  const interaction = (s: PlacedSprite) => {
    const corpse = corpseOf(s, corpses);
    if (corpse) return { kind: "item" as const, item: corpse.id, title: names.item(CORPSE_ITEM) };
    const drone = droneOf(s, drones);
    if (drone) return { kind: "item" as const, item: drone.id, title: names.item(SUPPORT_DRONE_ITEM) };
    const hostile = hostileOf(s, hostiles);
    if (hostile) return { kind: "hostile" as const, hostile: hostile.id, title: names.hostileName(hostile.kind) };
    if (s.kind === "actor") {
      const o = byId.get(s.key.slice(2));
      return o ? { kind: "person" as const, person: o, title: o.name } : null;
    }
    if (s.door) return { kind: "door" as const, to: s.door.target, title: names.room(s.door.target) };
    const eq = equipmentByKey.get(s.key);
    if (!eq && s.kind === "entity" && layout.slices[s.slice]?.flags.includes("chair")) {
      return { kind: "chair" as const, cell: s.cell, dir: layout.slices[s.slice]?.dir, title: t("common.chair") };
    }
    if (!eq && s.kind === "entity" && isLockerSlice(layout, s.slice)) {
      return { kind: "locker" as const, title: t("inventory.title") };
    }
    return eq ? { kind: "equipment" as const, equipment: eq, title: names.equipment(eq.type) } : null;
  };

  /** Room-pixel point under the pointer: the viewport holds the world at the camera's offset. */
  const pointIn = (e: MouseEvent<HTMLElement>) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const cam = cameraNow();
    return { x: (e.clientX - rect.left) / zoom - cam.x + box.minX, y: (e.clientY - rect.top) / zoom - cam.y + box.minY };
  };

  /**
   * The interactive sprite visibly under the pointer, if any. Scenery in front blocks what's behind it.
   * This room takes clicks before its neighbours, even where a neighbour's wall is drawn over it, so
   * its floor stays walkable. Any visible part of a neighbour counts as its door.
   */
  const pick = (e: MouseEvent<HTMLElement>) => {
    const { x, y } = pointIn(e);
    const opaque = (s: PlacedSprite, px: number, py: number) => {
      // A slab of room around its equipment (outlines.ts): only the equipment's part takes clicks.
      const outline = SLICE_OUTLINES[s.slice];
      if (outline && equipmentByKey.has(s.key) && !insideOutline(outline, px, py)) return false;
      const { url, frame, keyed } = imageOf(s, imageInput);
      return !url || opaqueAt(url, frame, px, py, keyed);
    };
    // People part-way between cells are drawn shifted from their placed box.
    const shifted = sprites.map((s) => {
      if (s.kind !== "actor") return s;
      const o = offsetOf(s.key.slice(2));
      return o.x || o.y ? { ...s, left: s.left + o.x, top: s.top + o.y } : s;
    });
    const hit = hitTest(shifted, x, y, opaque);
    const action = hit && interaction(hit);
    if (hit && action) return { sprite: hit, key: action.kind === "locker" ? LOCKER_HOVER_KEY : hit.key, ...action };
    const behind = hitTest(neighborSprites, x, y, opaque);
    // A neighbour's door on this room's front edges is drawn over this room's floor; plain floor yields to it (walls don't).
    if (hit && !(behind?.door && ringOf.get(behind.room) === 1)) return null;
    // Only the rooms behind this room's own doors count as doors; the second ring is scenery.
    if (!behind || ringOf.get(behind.room) !== 1) return null;
    const to = behind.room as RoomId;
    return { sprite: behind, key: `n:${to}`, kind: "door" as const, to, title: names.room(to) };
  };

  /**
   * Walk to `cell`, sitting there on `seat`. Pushing a wheelchair, steer it there instead (nobody sits): you end up in
   * the cell before it on its way, as useWalkers draws you following it.
   */
  const walkTo = (cell: { x: number; y: number }, seat?: Seat) => {
    if (!onWalk) return;
    if (!myPushee) {
      setWalk({ visit: visit.current.n, cell, ...(seat && { seat }) });
      onWalk(cell, !!seat);
      return;
    }
    const from = walkers.get(myPushee.id)?.cell;
    const path = from && walkPath(cells, from, cell);
    const behind = path && path.length > 1 ? path[path.length - 2]! : myWalker?.cell;
    if (!behind) return;
    setWalk({ visit: visit.current.n, cell: behind, steer: cell });
    onWalk(cell, false, behind);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (leavingTo) return;
    const hit = pick(e);
    if (hit?.kind === "person") onSelect({ kind: "player", id: hit.person.id });
    else if (hit?.kind === "item") onSelect({ kind: "item", id: hit.item });
    else if (hit?.kind === "hostile") onSelect({ kind: "hostile", id: hit.hostile });
    // Selecting equipment doesn't walk you up to it: you step up once an action on it begins (useActingOn).
    else if (hit?.kind === "equipment") onSelect({ kind: "equipment", id: hit.equipment.id });
    else if (hit?.kind === "chair") {
      // Sit down (cosmetic, like walking): you stand on the chair's cell in the sitting pose.
      onClear();
      if (!rooted) walkTo(hit.cell, seatFor(hit.dir));
    } else if (hit?.kind === "locker") onOpenInventory?.();
    else if (hit?.kind === "door") onDoorTap(hit.to);
    else {
      // Bare floor (or scenery): clear the selection and walk there; the camera follows, revealing doors off-panel.
      onClear();
      const at = pointIn(e);
      const cell = cellAtPoint(cells, at.x, at.y);
      if (cell && !rooted) walkTo(cell);
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
  const hoverTitle =
    hoverKey === LOCKER_HOVER_KEY
      ? t("inventory.title")
      : hoveredNeighbor
        ? names.room(hoveredNeighbor.id)
        : hovered && interaction(hovered)?.title;

  return (
    // data-leaving marks the walk out of a room you have already left (tools wait for it to end).
    <section className="iso-room" data-leaving={leavingTo ? "" : undefined}>
      {/* The scroller clips the scene inside the frame. */}
      <div className="iso-scroll">
        <div
          ref={viewportRef}
          role="group"
          aria-labelledby={titleId}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the room view takes focus so the + and - keys can zoom it; picking things in it is pointer-only for now, and keyboard access to the room is not built yet.
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const dir = e.key === "+" || e.key === "=" ? 1 : e.key === "-" || e.key === "_" ? -1 : 0;
            if (dir) {
              e.preventDefault();
              onZoomStep(dir);
            }
          }}
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
          {/* Zoom scales a layer 1/zoom as big as the panel, so the room fills it at any magnification. */}
          <div className="iso-zoom" style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}>
          <Suspense fallback={null}>
            <Renderer scene={drawn} ref={attachRenderer} />
          </Suspense>
          {/* Status badges and speech bubbles above the scene, so no sprite or wall can ever cover them. */}
          <SceneOverlay anchors={anchors} width={drawn.width} height={drawn.height} bubbles={bubbles} ref={overlayRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
