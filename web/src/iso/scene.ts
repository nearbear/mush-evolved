// What the iso room looks like, as plain data any renderer can draw: the seam between IsoRoom (which
// decides what is where and how it looks) and a renderer (which only draws it). Pure: no DOM and no
// renderer library, so it can be unit tested and a renderer can be swapped without touching
// placement, walking, the camera or input.
//
// Effects are described by what they mean (fogged, hovered, selected, see-through), never by how
// they are drawn (CSS filters, tints, shaders): each renderer maps them to its own means.

import type { Ref } from "react";
import type { CharacterId, EquipmentView, ItemId, RoomId, ShipLayout, Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { lyingFrame, sittingFrame, spriteStrip } from "../art/assets.ts";
import type { Bar } from "../scene/ActionBar.tsx";
import { atlasUrl } from "./shipLayout.ts";
import { CAMERA_SLICES } from "./equipmentTiles.ts";
import type { PlacedSprite } from "./placement.ts";
import type { Walker } from "./useWalkers.ts";

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
}

/** Frames played in place: frame n is `frame` moved right by n widths. Ends on `frames[0]` after `loops` rounds. */
export interface SceneAnim {
  frames: readonly number[];
  frameMs: number;
  loops: number | "forever";
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

/** One room view to draw: sprites in paint order (back to front), then the outlines above them all. */
export interface Scene {
  width: number;
  height: number;
  sprites: readonly SceneSprite[];
  outlines: readonly SceneOutline[];
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
  /** People lying in a bed in this room, and whether the bed runs mirrored. */
  beds: ReadonlyMap<string, { flip: boolean }>;
  /** The chair you sit on, if you do. */
  seat: Seat | undefined;
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
}

/** The corpse an actor sprite draws, if it is one. */
export function corpseOf(s: PlacedSprite, corpses: readonly Corpse[]): Corpse | undefined {
  return s.kind === "actor" && s.key.startsWith(`a:${CORPSE_PREFIX}`) ? corpses.find((c) => `a:${CORPSE_PREFIX}${c.id}` === s.key) : undefined;
}

/**
 * The image a placed sprite's pixels come from: its unflipped, unanimated frame (what hit-testing
 * reads; `hitTest` mirrors with `flipX`).
 */
export function imageOf(s: PlacedSprite, input: Pick<SceneInput, "layout" | "room" | "people" | "walkers" | "seat" | "corpses">): SceneImage {
  if (s.kind !== "actor") return { url: atlasUrl(input.layout, s.sheet), frame: s, keyed: false };
  const corpse = corpseOf(s, input.corpses);
  if (corpse) {
    const lying = lyingFrame(corpse.character);
    return { url: lying?.url, frame: lying ?? { sx: 0, sy: 0, ...LYING_SIZE }, keyed: false };
  }
  const o = input.people.get(s.key.slice(2));
  const lying = o?.lying ? lyingFrame(o.character) : undefined;
  if (lying) return { url: lying.url, frame: lying, keyed: false };
  const sitting = o?.you && input.seat ? sittingFrame(o.character, input.seat.facing) : undefined;
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
  if (o.you && input.seat) return { ...base, image, flipX: input.seat.flip };
  const w = input.walkers.get(o.id);
  const anim = w?.moving ? { ...WALK_CYCLE, loops: "forever" as const } : w?.arriving ? { ...WALK_CYCLE, loops: 2 } : undefined;
  return { ...base, image, flipX: w?.facing.flip, anim, walker: w && o.id };
}

/** Someone in bed casts the lying shadow; everyone else the standing one (seated too). */
const shadowOf = (s: PlacedSprite, input: SceneInput) => (s.room === input.room && input.people.get(s.key.slice(2))?.lying ? "lying" : "standing");

/** The scene to draw, from the placed sprites and what is selected, hovered, reachable and lit. */
export function describeScene(input: SceneInput): Scene {
  const { layout, room, placed, box, people, corpses, equipment, reachable, selected, selectedDoor, hoverKey, ownCells } = input;
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);
  const sprites: SceneSprite[] = [];
  const outlines: SceneOutline[] = [];
  for (const s of placed) {
    const base = { key: s.key, x: s.left - box.minX, y: s.top - box.minY, width: s.width, height: s.height };
    const tile = () => ({ ...base, image: imageOf(s, input), flipX: s.flipX || undefined, flipY: s.flipY || undefined });
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
    const anim = swivel?.length ? { frames: swivel, frameMs: 6 * TICK_MS, loops: "forever" as const } : undefined;
    if (s.door) {
      const canGo = reachable.has(s.door.target as RoomId);
      // Hovering a door you can go through outshines its selection.
      const effect = canGo && hover ? "doorHover" : s.door.target === selectedDoor ? "selected" : undefined;
      sprites.push({ ...tile(), anim, role: "door", reachable: canGo, effect });
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
  return { width: box.width, height: box.height, sprites, outlines };
}
