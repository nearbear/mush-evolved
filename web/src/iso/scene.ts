// What the iso room looks like, as plain data any renderer can draw: the seam between IsoRoom (which
// decides what is where and how it looks) and a renderer (which only draws it). Pure: no DOM and no
// renderer library, so it can be unit tested and a renderer can be swapped without touching
// placement, walking, the camera or input.
//
// Effects are described by what they mean (fogged, hovered, selected, see-through), never by how
// they are drawn (CSS filters, tints, shaders): each renderer maps them to its own means.

import type { Ref } from "react";
import type { CharacterId, EquipmentView, ItemId, RoomId, ShipLayout, SliceInfo, Spot, Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { lyingFrame, sittingFrame, spriteStrip } from "../art/assets.ts";
import type { Bar } from "../scene/ActionBar.tsx";
import { atlasUrl } from "./shipLayout.ts";
import { CAMERA_SLICES } from "./equipmentTiles.ts";
import { frameRect, type PlacedSprite } from "./placement.ts";
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

/** How someone sits on a chair: which sitting frame, and whether it is mirrored. */
export interface Seat {
  facing: "face" | "back";
  flip: boolean;
}

/** The lying pose's cell on the cast sheet (art/assets.ts). */
export const LYING_SIZE = { width: 50, height: 48 };

/** Actor ids for corpses get this prefix, so they can't collide with player ids. */
export const CORPSE_PREFIX = "corpse:";

/** The original Flash client ran at 30 ticks a second; animation rhythms are counted in ticks. */
const TICK_MS = 1000 / 30;

/**
 * Scenery that plays its own animation (its first tiles.xml anim, at its rhythm) all the time: the
 * engine room's three reactors, PILGRED's core once it is repaired (its `_upgrade` look, `looks`),
 * and the equipment on MidFill/MidFill2 whose tiles.xml anim is `auto` (gravity simulator, surgery
 * pod, NERON's core and BIOS terminal, the tanks, the bridge's LEDs and astro console, the antenna,
 * the sick bay's human tank), and the lab's MycoScan once built (BigFill's third row, also `auto`).
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
]);

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

const ticksToMs = (rhythm: readonly number[], n: number) => Array.from({ length: n }, (_, i) => (rhythm[i] ?? rhythm.at(-1) ?? 1) * TICK_MS);

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
 */
export type SceneEffect = "fogged" | "foggedLifted" | "hover" | "doorHover" | "selected";

/** What a sprite is, for renderers that label their output (the DOM one keeps the class names the screenshot tools look for). */
export type SceneRole = "tile" | "door" | "equipment" | "person" | "corpse";

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

export interface SceneSprite extends ScenePicture {
  role: SceneRole;
  effect?: SceneEffect;
  /** People and bodies cast a soft shadow below them: standing (or seated), or lying. */
  shadow?: "standing" | "lying";
  /** Only for labelling: you, and a door you can go through. */
  you?: boolean;
  reachable?: boolean;
}

/**
 * A person's see-through outline, drawn over the whole scene. Every person has one, so it keeps in step
 * with them (walk cycle included); it only shows while `occluded` (a wall is drawn over them). `faint`:
 * they are in another room.
 */
export interface SceneOutline extends ScenePicture {
  occluded: boolean;
  faint: boolean;
}

/** How the Daedalus is moving: held in orbit, flying between planets, or travelling to one (a jump in progress, until the next cycle change). */
export type ShipPace = "stopped" | "cruising" | "traveling";

/** How fast the stars stream at each pace, as a multiple of the cruising rate. */
export const PACE_SPEED: Readonly<Record<ShipPace, number>> = { stopped: 0, cruising: 1, traveling: 10 };

/**
 * The pace to draw from the view's public navigation.
 */
export function shipPace(navigation: { orbiting: boolean; traveling: boolean }): ShipPace {
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
  corpses: readonly Corpse[];
  /** Sprite key -> the equipment it draws (this room only). */
  equipment: ReadonlyMap<string, EquipmentView>;
  reachable: ReadonlySet<RoomId>;
  selected: Target | null;
  selectedDoor: RoomId | null;
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
}

/** The corpse an actor sprite draws, if it is one. */
export function corpseOf(s: PlacedSprite, corpses: readonly Corpse[]): Corpse | undefined {
  return s.kind === "actor" && s.key.startsWith(`a:${CORPSE_PREFIX}`) ? corpses.find((c) => `a:${CORPSE_PREFIX}${c.id}` === s.key) : undefined;
}

/**
 * The image a placed sprite's pixels come from: its unflipped, unanimated frame (what hit-testing
 * reads; `hitTest` mirrors with `flipX`).
 */
export function imageOf(s: PlacedSprite, input: Pick<SceneInput, "layout" | "room" | "people" | "walkers" | "seats" | "corpses" | "looks">): SceneImage {
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

/** The scene to draw, from the placed sprites and what is selected, hovered, reachable and lit. */
export function describeScene(input: SceneInput): Scene {
  const { layout, room, placed, box, people, corpses, equipment, reachable, selected, selectedDoor, hoverKey, ownCells, doors, looks } = input;
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);
  const sprites: SceneSprite[] = [];
  const outlines: SceneOutline[] = [];
  const ambientStarts = spreadAmbient(placed, input);
  for (const s of placed) {
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
    if (s.kind === "actor" && !corpse) {
      outlines.push({ ...personPicture(s, input, base), occluded: !!s.occluded, faint: s.room !== room });
    }
    if (s.room !== room) {
      const n = s.room as RoomId;
      // A door into the room you're in stays lit, so the way back reads clearly.
      // So do a neighbour's walls standing next to this room's floor.
      const lit = s.kind !== "actor" && (s.door?.target === room || (s.kind === "wall" && ownCells.has(`${s.cell.x},${s.cell.y}`)));
      const lifted = n === selectedDoor || (reachable.has(n) && hoverKey === `n:${n}`);
      const effect = lit ? undefined : lifted ? "foggedLifted" : "fogged";
      sprites.push(s.kind === "actor" ? { ...personPicture(s, input, base), role: "person", effect, shadow: "standing" } : { ...tile(), role: "tile", effect });
      continue;
    }
    const hover = s.key === hoverKey;
    if (corpse) {
      const effect = isSelected("item", corpse.id) ? "selected" : hover ? "hover" : undefined;
      sprites.push({ ...base, image: imageOf(s, input), role: "corpse", effect, shadow: "lying" });
      continue;
    }
    if (s.kind === "actor") {
      const o = people.get(s.key.slice(2));
      sprites.push({ ...personPicture(s, input, base), role: "person", shadow: shadowOf(s, input), you: o?.you, effect: o && isSelected("player", o.id) ? "selected" : undefined });
      continue;
    }
    const swivel = CAMERA_SLICES.has(s.slice) ? layout.slices[s.slice]?.anims[0]?.frames : undefined;
    // The camera swivels: its auto animation (Camera.xml) steps through its strip every 6 ticks.
    const drawnSlice = looks?.get(s.slice) ?? s.slice;
    const ambient = AMBIENT_SLICES.has(drawnSlice) ? layout.slices[drawnSlice]?.anims[0] : undefined;
    const anim = swivel?.length
      ? { frames: swivel, frameMs: 6 * TICK_MS, loops: "forever" as const }
      : ambient?.frames.length
        ? ambientAnim(ambient.frames, ticksToMs(ambient.rhythm, ambient.frames.length), ambientStarts.get(s.key) ?? 0)
        : undefined;
    if (s.door) {
      const canGo = reachable.has(s.door.target as RoomId);
      // Hovering a door you can go through outshines its selection.
      const effect = canGo && hover ? "doorHover" : s.door.target === selectedDoor ? "selected" : undefined;
      sprites.push({ ...tile(), role: "door", reachable: canGo, effect });
      continue;
    }
    const eq = equipment.get(s.key);
    if (eq) {
      // Selected equipment keeps its glow while hovered.
      const effect = isSelected("equipment", eq.id) ? "selected" : hover ? "hover" : undefined;
      sprites.push({ ...tile(), anim, role: "equipment", effect });
      continue;
    }
    sprites.push({ ...tile(), anim, role: "tile" });
  }
  return { width: box.width, height: box.height, sprites, outlines, pace: input.pace ?? "cruising", planet: input.planet ?? null, turn: input.turn ?? null };
}
