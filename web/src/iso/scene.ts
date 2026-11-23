// What the iso room looks like, as plain data any renderer can draw: the seam between IsoRoom (which
// decides what is where and how it looks) and a renderer (which only draws it). Pure: no DOM and no
// renderer library, so it can be unit tested and a renderer can be swapped without touching
// placement, walking, the camera or input.
//
// Effects are described by what they mean (fogged, hovered, selected, see-through), never by how
// they are drawn (CSS filters, tints, shaders): each renderer maps them to its own means.

import type { Ref } from "react";
import type { CharacterId, EquipmentView, ItemId, RoomId, ShipLayout, SliceInfo, Spot, Target, TileKind } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { hostileFrame, lyingFrame, sittingFrame, spriteStrip } from "../art/assets.ts";
import type { Bar } from "../scene/ActionBar.tsx";
import { atlasUrl } from "./shipLayout.ts";
import { CAMERA_SLICES, LOCKER_HOVER_KEY, isLockerSlice } from "./equipmentTiles.ts";
import { SLICE_OUTLINES, type OutlinePoint } from "./outlines.ts";
import { type CellSlot, frameRect, gridToPx, type PlacedSprite, WALL_RUNS, wallRuns } from "./placement.ts";
import type { Walker } from "./useWalkers.ts";

export interface Occupant {
  id: string;
  name: string;
  isBot: boolean;
  character: CharacterId | undefined;
  you: boolean;
  /** The bed (equipment id) they lie in, drawn in the lying pose like a corpse. The view gives it for you and for people in your room. */
  lying?: string;
  /** Where they stand or sit in the room, from the view (you and people in your room); without one, they're spread out. */
  spot?: Spot;
  /** Who pushes their wheelchair, from the view (you and people in your room): they steer it, and the pusher walks behind. */
  pushedBy?: string;
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

/** A support drone on the floor (#411). */
export interface Drone {
  id: ItemId;
}

/** A hostile NPC in this room (shared/src/hostiles.ts), drawn standing by its kind's art. */
export interface Hostile {
  id: string;
  kind: string;
}

/** Actor ids for hostile NPCs get this prefix, so they can't collide with player ids. */
export const HOSTILE_PREFIX = "npc:";

/** How someone sits on a chair: which sitting frame, and whether it is mirrored. */
export interface Seat {
  facing: "face" | "back";
  flip: boolean;
}

/** The lying pose's cell on the cast sheet (art/assets.ts). */
export const LYING_SIZE = { width: 64, height: 48 };

/** Actor ids for corpses get this prefix, so they can't collide with player ids. */
export const CORPSE_PREFIX = "corpse:";

/** Actor ids for drones get this prefix, so they can't collide with player ids. */
export const DRONE_PREFIX = "drone:";

/** The drone's slice: frame 0 of `base_drone` in fx.png, the drone above its own shadow (tiles.xml). */
const DRONE_SLICE = "base_drone";
/** `base_drone`'s frame size. */
export const DRONE_SIZE = { width: 32, height: 56 };
/** Where the drone's frame splits: the drone in the rows above, its shadow below (measured in fx.png: drone 5-31, shadow 35-45). */
const DRONE_BODY_ROWS = 34;
/** Moves the frame so the shadow's centre sits on the cell's centre (placed like a 32x48 person, it would sit 5px right and 8px high). */
export const DRONE_SHIFT = { x: -5, y: 8 };

/** The original Flash client ran at 30 ticks a second; animation rhythms are counted in ticks. */
const TICK_MS = 1000 / 30;

/**
 * Scenery that plays its own animation (its first tiles.xml anim, at its rhythm) all the time: the
 * engine room's three reactors, PILGRED's core once it is repaired (its `_upgrade` look, `looks`),
 * the MidFill/MidFill2 equipment whose tiles.xml anim is `auto`, the NERON core auxiliary terminals,
 * the bridge's `planets` hologram, the bay lights, the bay doors (normal and Bay Door XXL), the
 * Plasma Shield coils once complete, and the lab's MycoScan once built.
 */
const AMBIENT_SLICES: ReadonlySet<string> = new Set([
  "rotational_reactor",
  "emergency_reactor",
  "core_pilgred_upgrade",
  "gravity_simulator",
  "surgery_console",
  "neron",
  "bios",
  "tank_o2_left_front",
  "tank_o2_right_front",
  "tank_fuel_right_front",
  "tank_o2_right_back",
  "tank_fuel_left_back",
  "pilot_leds",
  "pilot_astro_left",
  "radar_trans_void",
  "human_tank",
  "human_tank_full",
  "mycoscan",
  "server_active",
  "auxiliary_terminal_neron_upgrade_a",
  "auxiliary_terminal_neron_upgrade_b",
  "planets",
  "bay_light",
  "bay_window",
  "bay_window_upgrade",
  "plasma_shield_upgrade",
]);

/** Speed multiplier for ambient animations tuned faster (> 1) or slower (< 1) than their tiles.xml rhythm. */
const AMBIENT_SPEED: Readonly<Record<string, number>> = {
  bay_light: 0.7,
  bay_window: 0.7,
  bay_window_upgrade: 0.7,
  radar_trans_void: 0.5,
  rotational_reactor: 1.4,
  emergency_reactor: 1.4,
  tank_fuel_right_front: 0.5,
  tank_fuel_left_back: 0.5,
  surgery_console: 0.5,
  human_tank: 2,
  human_tank_full: 2,
  pilot_astro_left: 2,
  tank_o2_left_front: 0.5,
  tank_o2_right_front: 0.5,
  tank_o2_right_back: 0.5,
};

/** One walk cycle: the six 32x48 frames of a crew strip, half a second in all. */
const WALK_CYCLE = { frames: [0, 1, 2, 3, 4, 5], frameMs: 500 / 6 } as const;

/** A rectangle of an image. */
export interface Frame {
  sx: number;
  sy: number;
  width: number;
  height: number;
}

/** Where a sprite's pixels come from. `keyed`: the image has no alpha; its top-left color is the background (keyedSprite.ts). */
export interface SceneImage {
  url: string | undefined;
  frame: Frame;
  keyed: boolean;
  /** How many frames the sheet has per row (the slice's `framesX`; the reactors' run down a column). Unset: all in one row. */
  perRow?: number;
}

/** Where frame `n` of an image is: `frame` moved right by n widths, wrapping down a row every `perRow` frames. */
export function frameAt(image: SceneImage, n: number): { sx: number; sy: number } {
  const perRow = image.perRow ?? Infinity;
  return { sx: image.frame.sx + (n % perRow) * image.frame.width, sy: image.frame.sy + Math.floor(n / perRow) * image.frame.height };
}

/**
 * Frames played in place (`frameAt`). Ends on `frames[0]` after `loops` rounds; `"hold"` plays
 * once and rests on the last frame (a door left open or shut).
 */
export interface SceneAnim {
  frames: readonly number[];
  /** How long each frame shows: one length for all, or one per frame (the original's rhythm). */
  frameMs: number | readonly number[];
  loops: number | "forever" | "hold";
}

/** An animation's frame `elapsed` ms after it started, and how long until the next change (none once it has ended). */
export function animStep(anim: SceneAnim, elapsed: number): { frame: number; nextIn?: number } {
  const { frames, frameMs, loops } = anim;
  const ms = (i: number) => Math.max(1, typeof frameMs === "number" ? frameMs : (frameMs[i] ?? frameMs.at(-1) ?? 1));
  let cycle = 0;
  for (let i = 0; i < frames.length; i++) cycle += ms(i);
  const rounds = loops === "forever" ? Infinity : loops === "hold" ? 1 : loops;
  if (!frames.length || elapsed >= cycle * rounds) return { frame: (loops === "hold" ? frames.at(-1) : frames[0]) ?? 0 };
  let t = elapsed % cycle;
  for (let i = 0; ; i++) {
    if (t < ms(i)) return { frame: frames[i]!, nextIn: ms(i) - t };
    t -= ms(i);
  }
}

/** Which frame of `anim` shows `elapsed` ms after it started. */
export const animFrame = (anim: SceneAnim, elapsed: number): number => animStep(anim, elapsed).frame;

/** Tells animations apart: a renderer restarts one when this changes. */
export const animId = (a: SceneAnim | undefined) => a && `${a.frames.join(",")}/${a.frameMs}/${a.loops}`;

/**
 * Where a door is in opening and closing, which picks its animation: the slice's first one opens
 * it, the second shuts it (tiles.xml; the original only ever played the first, on hover). `open`
 * stands on the open frame without playing anything (someone came in through it).
 */
export type DoorState = "opening" | "open" | "closing";

/** The doors that open: two animations, opening then closing (`DOOR_L`, `DOOR_R` and their deck versions). */
export const opensAsDoor = (slice: SliceInfo | undefined) => !!slice?.flags.includes("door") && slice.anims.length >= 2;

const ticksToMs = (rhythm: readonly number[], n: number, speed = 1) =>
  Array.from({ length: n }, (_, i) => ((rhythm[i] ?? rhythm.at(-1) ?? 1) * TICK_MS) / speed);

/** How long a door takes to open, in ms (the opening animation's rhythm). */
export function doorOpenMs(slice: SliceInfo | undefined): number {
  const open = opensAsDoor(slice) ? slice!.anims[0]! : undefined;
  return open ? ticksToMs(open.rhythm, open.frames.length).reduce((a, b) => a + b, 0) : 0;
}

/** The animation a door in `state` plays, or none for a shut door (frame 0). */
export function doorAnim(slice: SliceInfo | undefined, state: DoorState | undefined): SceneAnim | undefined {
  if (!state || !opensAsDoor(slice)) return undefined;
  const open = slice!.anims[0]!, close = slice!.anims[1]!;
  if (state === "open") return { frames: [open.frames.at(-1) ?? 0], frameMs: 1, loops: "hold" };
  const a = state === "opening" ? open : close;
  return { frames: a.frames, frameMs: ticksToMs(a.rhythm, a.frames.length), loops: "hold" };
}

/**
 * How a sprite is lit, by meaning. A renderer has to tell these apart; how is up to it.
 * - `fogged`: another room, dimmed. `foggedLifted`: the same, a little brighter (its door is selected, or hovered and reachable).
 * - `hover`: an interactive thing under the mouse. `doorHover`: a reachable door under the mouse, brighter, with an accent glow.
 * - `selected`: the current selection, with a highlight glow.
 * - `broken`: a broken door, with a danger glow.
 */
export type SceneEffect = "fogged" | "foggedLifted" | "hover" | "doorHover" | "selected" | "broken";

/** What a sprite is, for renderers that label their output (the DOM one keeps the class names the screenshot tools look for). */
export type SceneRole = "tile" | "door" | "equipment" | "person" | "corpse" | "drone";

/** Something drawn at (x, y) in world pixels (the scene's own box, top-left at 0,0), the size of its image frame. */
export interface ScenePicture {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: SceneImage;
  flipX?: boolean;
  flipY?: boolean;
  anim?: SceneAnim;
  /** A walker's id: drawn shifted each frame by `Frame.offsetOf(walker)`. */
  walker?: string;
}

/** Which isometric axis a cutaway wall/door runs along. */
export type CutawayAxis = "x" | "y" | "xy";

/** World-space box and axis of the foreground wall/door whose floor line drives a sprite's cutaway. */
export interface Cutaway {
  axis: CutawayAxis;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneSprite extends ScenePicture {
  role: SceneRole;
  kind?: TileKind | "actor";
  slice?: string;
  effect?: SceneEffect;
  /** Foreground neighbour wall/door (or prop mounted to one) that is dithered above the wall's base. */
  cutaway?: Cutaway;
  /** People and bodies cast a soft shadow below them: standing (or seated), or lying. */
  shadow?: "standing" | "lying";
  /** Floats: bobs gently up and down on its own clock (a drone, not its shadow). A renderer may draw it still. */
  bob?: boolean;
  /**
   * The part of the sprite that is the equipment, in its own unmirrored pixels (outlines.ts): a renderer draws the
   * effect only inside it. Absent: the whole sprite.
   */
  outline?: readonly OutlinePoint[];
  /** Only for labelling: you, and a door you can go through. */
  you?: boolean;
  reachable?: boolean;
  /**
   * Someone coming in or going out with no door to show (`FADE_MS`): `in` fades a person in when they're first drawn,
   * and the fade runs its course even if it's gone from the next scene; `out` fades them away and keeps them unseen.
   */
  fade?: "in" | "out";
}

/** How long a fade in or out takes (`SceneSprite.fade`), in ms. */
export const FADE_MS = 400;

/**
 * A person's see-through outline, drawn over the whole scene. Every person has one, so it keeps in step
 * with them (walk cycle included); it only shows while `occluded` (a wall is drawn over them). `faint`:
 * they are in another room.
 */
export interface SceneOutline extends ScenePicture {
  occluded: boolean;
  faint: boolean;
}

/** How the Daedalus is moving: held in orbit, flying between planets, jumping to one, or in intergalactic FTL travel (#480). */
export type ShipPace = "stopped" | "cruising" | "traveling" | "ftl";

/** How fast the stars stream at each pace, as a multiple of the cruising rate. */
export const PACE_SPEED: Readonly<Record<ShipPace, number>> = { stopped: 0, cruising: 1, traveling: 10, ftl: 25 };

/**
 * The pace to draw from the view's public navigation and launch state.
 */
export function shipPace(navigation: { orbiting: boolean; traveling: boolean }, launched = false): ShipPace {
  if (launched) return "ftl";
  if (navigation.traveling) return "traveling";
  return navigation.orbiting ? "stopped" : "cruising";
}

/** The ship's latest quarter turn: `n` counts them, so a renderer turns the stars once for each new one. */
export type ShipTurn = { n: number; side: "left" | "right" };

/** One room view to draw: sprites in paint order (back to front), then the outlines above them all. */
export interface Scene {
  width: number;
  height: number;
  sprites: readonly SceneSprite[];
  outlines: readonly SceneOutline[];
  /** How fast the ship is going, which sets how fast the stars behind it stream past. */
  pace: ShipPace;
  /** The planet the ship orbits (an image URL), drawn in the sky at the panel's bottom-right; null out of orbit. */
  planet: string | null;
  /** The ship's latest turn (public), so the stars turn the other way; null before the first. */
  turn: ShipTurn | null;
  /** The room being viewed. */
  room: RoomId;
  /** The burning room's floor cells, each with its place in the paint order; empty when it isn't on fire. */
  fire: readonly SceneFireCell[];
  /** Broken doors and broken equipment in this room, each with its place in the paint order. */
  smoke: readonly SceneSmokeSource[];
}

/** A cell's centre below its anchor (its top corner), in pixels. */
const CELL_CENTER_Y = 8;

/** One floor cell of a room on fire: what burns there is drawn just before `sprites[at]` (after them all when `at` is their count). */
export interface SceneFireCell {
  /** The cell on the room's grid, for a renderer that spreads the fire over the floor. */
  cell: { x: number; y: number };
  /** The cell's centre in the scene. */
  x: number;
  y: number;
  at: number;
}

/** One broken door or equipment emitting smoke, drawn just after its sprite (before `sprites[at]`). */
export interface SceneSmokeSource {
  key: string;
  /** The anchor cell's top corner in scene pixels. */
  x: number;
  y: number;
  /** Footprint size in grid cells `[w, h]`. */
  footprint: readonly [number, number];
  /** Index in `Scene.sprites` immediately after the emitting sprite. */
  at: number;
}

/** Per animation frame, between renders: where the camera puts the world, and how far each walker is from where the scene placed them. */
export interface FrameUpdate {
  camera: { x: number; y: number };
  offsetOf: (walker: string) => { x: number; y: number };
}

export interface FrameTarget {
  setFrame(frame: FrameUpdate): void;
}

/**
 * What a renderer is: a component that draws `scene` filling its parent (the viewport, which takes
 * the clicks), and takes per-frame updates through `ref` without re-rendering. It must not handle
 * input or know about game state.
 */
export interface SceneRendererProps {
  scene: Scene;
  ref?: Ref<FrameTarget>;
}

/** Everything about the room view that decides how its sprites look. */
export interface SceneInput {
  layout: ShipLayout;
  room: RoomId;
  /** The placed scene, this room and its neighbours, in paint order. */
  placed: readonly PlacedSprite[];
  /** The scene's bounds; sprites are drawn relative to its top-left. */
  box: { minX: number; minY: number; width: number; height: number };
  /** Everyone drawn, here and in the rooms around, by id. */
  people: ReadonlyMap<string, Occupant>;
  walkers: ReadonlyMap<string, Walker>;
  /** Doors someone is going through (or just went through), by sprite key; any other door is shut. */
  doors: ReadonlyMap<string, DoorState>;
  /** People lying in a bed in this room, and whether the bed runs mirrored. */
  beds: ReadonlyMap<string, { flip: boolean }>;
  /** People sitting on a chair in this room (you as soon as you reach it, others by their view spot), by person id. */
  seats: ReadonlyMap<string, Seat>;
  /** People in this room fading in or out (`SceneSprite.fade`), by person id: their moves have no door to show. */
  fading?: ReadonlyMap<string, "in" | "out">;
  corpses: readonly Corpse[];
  /** Support drones on this room's floor; none when not given. */
  drones?: readonly Drone[];
  /** Hostile NPCs in this room; none when not given. */
  hostiles?: readonly Hostile[];
  /** Sprite key -> the equipment it draws (this room only). */
  equipment: ReadonlyMap<string, EquipmentView>;
  reachable: ReadonlySet<RoomId>;
  /** Rooms whose door from this room is broken (drawn shut and marked). */
  brokenDoors?: ReadonlySet<RoomId>;
  selected: Target | null;
  selectedDoor: RoomId | null;
  /** The inventory overlay is open: the room's shelf/locker is highlighted as active. */
  inventoryOpen?: boolean;
  /** The key of the hovered sprite, or `n:<room>` for a hovered room behind a door. */
  hoverKey: string | null;
  /** Cells next to this room's floor: a neighbour's wall drawn there is lit as this room's wall. */
  ownCells: ReadonlySet<string>;
  /** Scenery drawn as another slice of the same size, by slice id: PILGRED's core once it is repaired. */
  looks?: ReadonlyMap<string, string>;
  /** The ship's pace (`shipPace`); cruising when not given. */
  pace?: ShipPace;
  /** The orbited planet's picture (`Scene.planet`); none when not given. */
  planet?: string | null;
  /** The ship's latest turn (`Scene.turn`); none when not given. */
  turn?: ShipTurn | null;
  /** The room is on fire: its floor cells' places in the paint order (`placeWithSlots`, orders into `placed`). */
  fireSlots?: readonly CellSlot[];
}

/** The corpse an actor sprite draws, if it is one. */
export function corpseOf(s: PlacedSprite, corpses: readonly Corpse[]): Corpse | undefined {
  return s.kind === "actor" && s.key.startsWith(`a:${CORPSE_PREFIX}`) ? corpses.find((c) => `a:${CORPSE_PREFIX}${c.id}` === s.key) : undefined;
}

/** The drone an actor sprite draws, if it is one. */
export function droneOf(s: PlacedSprite, drones: readonly Drone[] | undefined): Drone | undefined {
  return s.kind === "actor" && s.key.startsWith(`a:${DRONE_PREFIX}`) ? drones?.find((d) => `a:${DRONE_PREFIX}${d.id}` === s.key) : undefined;
}

/** The hostile NPC an actor sprite draws, if it is one. */
export function hostileOf(s: PlacedSprite, hostiles: readonly Hostile[] | undefined): Hostile | undefined {
  return s.kind === "actor" && s.key.startsWith(`a:${HOSTILE_PREFIX}`) ? hostiles?.find((h) => `a:${HOSTILE_PREFIX}${h.id}` === s.key) : undefined;
}

/**
 * The image a placed sprite's pixels come from: its unflipped, unanimated frame (what hit-testing
 * reads; `hitTest` mirrors with `flipX`).
 */
export function imageOf(s: PlacedSprite, input: Pick<SceneInput, "layout" | "room" | "people" | "walkers" | "seats" | "corpses" | "drones" | "hostiles" | "looks">): SceneImage {
  if (s.kind !== "actor") {
    const look = input.looks?.get(s.slice);
    const slice = look ? input.layout.slices[look] : undefined;
    if (slice) return { url: atlasUrl(input.layout, slice.sheet), frame: { ...frameRect(slice, 0), width: slice.width ?? s.width, height: slice.height ?? s.height }, keyed: false, perRow: slice.framesX };
    return { url: atlasUrl(input.layout, s.sheet), frame: s, keyed: false, perRow: input.layout.slices[s.slice]?.framesX };
  }
  const corpse = corpseOf(s, input.corpses);
  if (corpse) {
    const lying = lyingFrame(corpse.character);
    return { url: lying?.url, frame: lying ?? { sx: 0, sy: 0, ...LYING_SIZE }, keyed: false };
  }
  if (droneOf(s, input.drones)) {
    const slice = input.layout.slices[DRONE_SLICE];
    return { url: slice && atlasUrl(input.layout, slice.sheet), frame: { ...(slice ? frameRect(slice, 0) : { sx: 0, sy: 0 }), ...DRONE_SIZE }, keyed: false };
  }
  const hostile = hostileOf(s, input.hostiles);
  if (hostile) {
    const frame = hostileFrame(hostile.kind);
    return { url: frame?.url, frame: frame ?? { sx: 0, sy: 0, width: 32, height: 48 }, keyed: false };
  }
  const o = input.people.get(s.key.slice(2));
  const lying = o?.lying ? lyingFrame(o.character) : undefined;
  if (lying) return { url: lying.url, frame: lying, keyed: false };
  const seat = o && input.seats.get(o.id);
  const sitting = seat ? sittingFrame(o.character, seat.facing) : undefined;
  if (sitting) return { url: sitting.url, frame: sitting, keyed: false };
  const strip = (o && s.room === input.room && input.walkers.get(o.id)?.facing.strip) || "face";
  return { url: spriteStrip(o?.character, strip), frame: { sx: 0, sy: 0, width: 32, height: 48 }, keyed: true };
}

/** A person as drawn (pose, mirroring, walk cycle), the same in the scene and in their outline. */
function personPicture(s: PlacedSprite, input: SceneInput, base: Omit<ScenePicture, "image">): ScenePicture {
  const image = imageOf(s, input);
  const o = input.people.get(s.key.slice(2));
  if (s.room !== input.room || !o) return { ...base, image };
  if (o.lying) return { ...base, image, flipX: input.beds.get(o.id)?.flip };
  const seat = input.seats.get(o.id);
  if (seat) return { ...base, image, flipX: seat.flip };
  const w = input.walkers.get(o.id);
  const anim = w?.moving ? { ...WALK_CYCLE, loops: "forever" as const } : w?.arriving ? { ...WALK_CYCLE, loops: 2 } : undefined;
  return { ...base, image, flipX: w?.facing.flip, anim, walker: w && o.id };
}

/** Someone in bed casts the lying shadow; everyone else the standing one (seated too). */
const shadowOf = (s: PlacedSprite, input: SceneInput) => (s.room === input.room && input.people.get(s.key.slice(2))?.lying ? "lying" : "standing");

/**
 * Which frame each ambient sprite in the room starts its loop on, so like ones don't pulse in step:
 * those with as many frames (the reactors) are spread evenly around the loop, in paint order.
 */
function spreadAmbient(placed: readonly PlacedSprite[], { layout, room, looks }: SceneInput): Map<string, number> {
  const byLength = new Map<number, string[]>();
  for (const s of placed) {
    if (s.kind === "actor" || s.room !== room) continue;
    const drawn = looks?.get(s.slice) ?? s.slice;
    const n = AMBIENT_SLICES.has(drawn) ? (layout.slices[drawn]?.anims[0]?.frames.length ?? 0) : 0;
    if (n) byLength.set(n, [...(byLength.get(n) ?? []), s.key]);
  }
  const starts = new Map<string, number>();
  for (const [n, keys] of byLength) {
    for (const [i, key] of keys.entries()) starts.set(key, Math.floor((i * n) / keys.length));
  }
  return starts;
}

/** An ambient loop begun `start` frames in (its frames and their lengths turned round together). */
function ambientAnim(frames: readonly number[], frameMs: readonly number[], start: number): SceneAnim {
  const turn = <T,>(a: readonly T[]) => [...a.slice(start), ...a.slice(0, start)];
  return { frames: turn(frames), frameMs: turn(frameMs), loops: "forever" };
}

function cutawayAxis(layout: ShipLayout, s: PlacedSprite): CutawayAxis | undefined {
  if (s.kind === "wall") {
    const axis: CutawayAxis = WALL_RUNS[s.slice] ?? "xy";
    return s.flipX && axis !== "xy" ? (axis === "x" ? "y" : "x") : axis;
  }
  if (s.kind !== "door") return undefined;
  const runs = wallRuns(layout, { kind: s.kind, slice: s.slice, x: s.cell.x, y: s.cell.y });
  if (runs.length === 0) return undefined;
  const hasX = runs.some((r) => r.axis === "x");
  const hasY = runs.some((r) => r.axis === "y");
  const axis: CutawayAxis = hasX && hasY ? "xy" : hasX ? "x" : "y";
  return s.flipX && axis !== "xy" ? (axis === "x" ? "y" : "x") : axis;
}

function boxesOverlap(a: PlacedSprite, b: PlacedSprite): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

/**
 * Neighbour walls, columns, and doors drawn after (in front of) any floor, equipment, or actor in `room`
 * whose screen box they overlap, plus wall-mounted props/decals drawn over those affected walls.
 */
function foregroundCutaways(layout: ShipLayout, placed: readonly PlacedSprite[], room: RoomId, box: { minX: number; minY: number }): Map<string, Cutaway> {
  const result = new Map<string, Cutaway>();
  const behind: PlacedSprite[] = [];
  const cutawayWalls: { sprite: PlacedSprite; cut: Cutaway }[] = [];
  for (const s of placed) {
    if (s.room === room) {
      if (s.kind === "ground" || s.kind === "entity" || s.kind === "actor") behind.push(s);
      continue;
    }
    const axis = cutawayAxis(layout, s);
    if (axis) {
      if (behind.some((t) => boxesOverlap(s, t))) {
        const cut: Cutaway = { axis, x: s.left - box.minX, y: s.top - box.minY, width: s.width, height: s.height };
        result.set(s.key, cut);
        cutawayWalls.push({ sprite: s, cut });
      }
      continue;
    }
    const flags = layout.slices[s.slice]?.flags;
    const wallMounted = s.kind === "prop" || (s.kind === "entity" && !!flags?.includes("decal") && !flags.includes("chair"));
    if (!wallMounted) continue;
    for (const w of cutawayWalls) {
      if (w.sprite.room === s.room && boxesOverlap(s, w.sprite)) {
        result.set(s.key, w.cut);
        break;
      }
    }
  }
  return result;
}

/** The scene to draw, from the placed sprites and what is selected, hovered, reachable and lit. */
export function describeScene(input: SceneInput): Scene {
  const { layout, room, placed, box, people, corpses, drones, equipment, reachable, brokenDoors, selected, selectedDoor, inventoryOpen, hoverKey, ownCells, doors, looks } = input;
  const cutaways = foregroundCutaways(layout, placed, room, box);
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);
  const sprites: SceneSprite[] = [];
  const outlines: SceneOutline[] = [];
  const smoke: SceneSmokeSource[] = [];
  const addSmoke = (s: PlacedSprite, sliceId: string) => {
    const anchor = gridToPx(s.cell.x, s.cell.y);
    smoke.push({
      key: s.key,
      x: anchor.x - box.minX,
      y: anchor.y - box.minY,
      footprint: layout.slices[sliceId]?.footprint ?? [1, 1],
      at: sprites.length,
    });
  };
  const ambientStarts = spreadAmbient(placed, input);
  // Where each placed sprite's pictures start in `sprites` (a drone is two), for the fire's places in the paint order.
  const firstSprite: number[] = [];
  for (const s of placed) {
    firstSprite.push(sprites.length);
    const look = looks?.get(s.slice);
    const lookSlice = look ? layout.slices[look] : undefined;
    const width = lookSlice ? lookSlice.width : s.width;
    const height = lookSlice ? lookSlice.height : s.height;
    const y = s.top - box.minY + s.height - height;
    const base = { key: s.key, x: s.left - box.minX, y, width, height };
    // A door opens and shuts on whichever side of it you are (a neighbour's door too).
    const opening = s.door ? doorAnim(layout.slices[s.slice], doors.get(s.key)) : undefined;
    const tile = () => ({ ...base, image: imageOf(s, input), flipX: s.flipX || undefined, flipY: s.flipY || undefined, ...(opening && { anim: opening }) });
    const corpse = corpseOf(s, corpses);
    const drone = droneOf(s, drones);
    const hostile = hostileOf(s, input.hostiles);
    if (s.kind === "actor" && !corpse && !drone && !hostile) {
      outlines.push({ ...personPicture(s, input, base), occluded: !!s.occluded, faint: s.room !== room });
    }
    if (s.room !== room) {
      const n = s.room as RoomId;
      // A door into the room you're in stays lit, so the way back reads clearly.
      // So do a neighbour's walls standing next to this room's floor.
      const lit = s.kind !== "actor" && (s.door?.target === room || (s.kind === "wall" && ownCells.has(`${s.cell.x},${s.cell.y}`)));
      const lifted = n === selectedDoor || (reachable.has(n) && hoverKey === `n:${n}`);
      const effect = lit ? undefined : lifted ? "foggedLifted" : "fogged";
      const cutaway = cutaways.get(s.key);
      sprites.push(
        s.kind === "actor"
          ? { ...personPicture(s, input, base), role: "person", effect, shadow: "standing", kind: s.kind, slice: s.slice }
          : { ...tile(), role: "tile", effect, ...(cutaway && { cutaway }), kind: s.kind, slice: s.slice },
      );
      if (s.door?.target === room && brokenDoors?.has(n)) addSmoke(s, s.slice);
      continue;
    }
    const hover = s.key === hoverKey;
    if (corpse) {
      const effect = isSelected("item", corpse.id) ? "selected" : hover ? "hover" : undefined;
      sprites.push({ ...base, image: imageOf(s, input), role: "corpse", effect, shadow: "lying", kind: s.kind, slice: s.slice });
      continue;
    }
    if (drone) {
      // Two pictures from the one frame: the shadow stays on the floor while the drone above it floats. Only the drone glows.
      const image = imageOf(s, input);
      const effect = isSelected("item", drone.id) ? "selected" : hover ? "hover" : undefined;
      const part = (top: number, rows: number) => ({ y: base.y + top, height: rows, image: { ...image, frame: { ...image.frame, sy: image.frame.sy + top, height: rows } } });
      sprites.push({ ...base, key: `${s.key}|shadow`, ...part(DRONE_BODY_ROWS, height - DRONE_BODY_ROWS), role: "drone", kind: s.kind, slice: s.slice });
      sprites.push({ ...base, ...part(0, DRONE_BODY_ROWS), role: "drone", effect, bob: true, kind: s.kind, slice: s.slice });
      continue;
    }
    if (hostile) {
      const effect = isSelected("hostile", hostile.id) ? "selected" : hover ? "hover" : undefined;
      sprites.push({ ...base, image: imageOf(s, input), role: "person", effect, shadow: "standing", kind: s.kind, slice: s.slice });
      continue;
    }
    if (s.kind === "actor") {
      const o = people.get(s.key.slice(2));
      const fade = input.fading?.get(s.key.slice(2));
      sprites.push({
        ...personPicture(s, input, base),
        role: "person",
        shadow: shadowOf(s, input),
        you: o?.you,
        effect: o && isSelected("player", o.id) ? "selected" : undefined,
        ...(fade && { fade }),
        kind: s.kind,
        slice: s.slice,
      });
      continue;
    }
    const swivel = CAMERA_SLICES.has(s.slice) ? layout.slices[s.slice]?.anims[0]?.frames : undefined;
    // The camera swivels: its auto animation (Camera.xml) steps through its strip every 6 ticks.
    const drawnSlice = looks?.get(s.slice) ?? s.slice;
    const ambient = AMBIENT_SLICES.has(drawnSlice) ? layout.slices[drawnSlice]?.anims[0] : undefined;
    const anim = swivel?.length
      ? { frames: swivel, frameMs: 6 * TICK_MS, loops: "forever" as const }
      : ambient?.frames.length
        ? ambientAnim(ambient.frames, ticksToMs(ambient.rhythm, ambient.frames.length, AMBIENT_SPEED[drawnSlice] ?? 1), ambientStarts.get(s.key) ?? 0)
        : undefined;
    if (s.door) {
      const to = s.door.target as RoomId;
      const canGo = reachable.has(to);
      const broken = brokenDoors?.has(to) ?? false;
      // Hovering a door you can go through outshines its selection.
      const effect = canGo && hover ? "doorHover" : s.door.target === selectedDoor ? "selected" : broken ? "broken" : undefined;
      sprites.push({ ...tile(), role: "door", reachable: canGo, effect, kind: s.kind, slice: s.slice });
      if (broken) addSmoke(s, s.slice);
      continue;
    }
    const eq = equipment.get(s.key);
    if (eq) {
      // Selected equipment keeps its glow while hovered.
      const effect = isSelected("equipment", eq.id) ? "selected" : hover ? "hover" : undefined;
      const outline = SLICE_OUTLINES[s.slice];
      sprites.push({ ...tile(), anim, role: "equipment", effect, kind: s.kind, slice: s.slice, ...(outline && { outline }) });
      if (eq.broken) addSmoke(s, drawnSlice);
      continue;
    }
    const locker = s.kind === "entity" && isLockerSlice(layout, s.slice);
    const effect = locker ? (inventoryOpen ? "selected" : hover || hoverKey === LOCKER_HOVER_KEY ? "hover" : undefined) : undefined;
    sprites.push({ ...tile(), anim, role: "tile", ...(effect && { effect }), kind: s.kind, slice: s.slice });
  }
  // `placed` is in paint order and keeps its orders when some are left out, so each slot goes before the first sprite at or past it.
  const fire = (input.fireSlots ?? []).map(({ cell, order }) => {
    const anchor = gridToPx(cell.x, cell.y);
    let at = 0, hi = placed.length;
    while (at < hi) {
      const mid = (at + hi) >> 1;
      if (placed[mid]!.order < order) at = mid + 1;
      else hi = mid;
    }
    return { cell, x: anchor.x - box.minX, y: anchor.y - box.minY + CELL_CENTER_Y, at: firstSprite[at] ?? sprites.length };
  });
  return {
    width: box.width,
    height: box.height,
    sprites,
    outlines,
    pace: input.pace ?? "cruising",
    planet: input.planet ?? null,
    turn: input.turn ?? null,
    room,
    fire,
    smoke,
  };
}
