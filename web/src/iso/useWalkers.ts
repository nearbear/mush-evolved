// Walking in the iso view: everyone in your room moves smoothly toward where they should stand,
// instead of jumping there. Client-only and cosmetic, like the spots themselves: the server never
// hears of it, and nothing waits for a walk to finish (an action or a move is sent at once,
// whatever the drawing is doing). It walks even with prefers-reduced-motion set: the walk is how
// you see where someone went, not decoration (Windows sets that preference whenever its animation
// effects are off).
//
// React only re-renders when someone crosses into another cell or turns (paint order and the strip
// depend on those). In between, an animation frame loop shifts their elements (`data-walker`) and
// the camera by whole pixels from where React placed them, so the motion is continuous and the
// camera stays locked on you.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RoomId } from "@mush2/shared";
import { gridToPx, walkPath } from "./placement.ts";

type Cell = { x: number; y: number };

/** Which walk strip a person is drawn with, and whether it is mirrored. */
export interface Facing {
  strip: "face" | "back";
  flip: boolean;
}

/** What React draws for a person: the cell they are in (for paint order), their facing, and whether they're on their way. */
export interface Walker {
  cell: Cell;
  facing: Facing;
  moving: boolean;
  /** Just appeared in a room you were already in: plays its walk-in once (people already there when you came in don't). */
  arriving: boolean;
}

/** Walking speed, in cells per second. */
export const CELLS_PER_SECOND = 6;

const STANDING: Facing = { strip: "face", flip: false };

/**
 * The facing for moving from `from` toward `to` (grid points), by screen direction. Unmirrored, the
 * face strip looks down-right (+x) and the back strip up-left (-x); mirrored, they look down-left
 * (+y) and up-right (-y). Straight sideways counts as down.
 */
export function facingFor(from: Cell, to: Cell): Facing {
  const dx = to.x - from.x, dy = to.y - from.y;
  const right = dx - dy > 0, down = dx + dy >= 0;
  return down ? { strip: "face", flip: !right } : { strip: "back", flip: right };
}

interface Motion {
  /** Where they are now, in grid units (between cells while walking). */
  pos: Cell;
  /** The points still to walk through, the last being where they stop. */
  route: Cell[];
  facing: Facing;
  arriving: boolean;
}

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const cellOf = (p: Cell) => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * Walkers in `room`, by id: everyone in `targets` moves to their target cell; anyone new is drawn
 * there straight away. A target that can't be reached on foot is jumped to, and so is every target of
 * `teleport` (the instant actions cheat: you jump, as before walking). `world` is the element
 * holding the `data-walker` elements and taking the camera transform; `camera` is that transform as
 * React last rendered it, with whose walker it follows. Call `apply` after every render so the
 * pixel shifts are put back on whatever React rewrote.
 */
export function useWalkers(
  room: RoomId,
  cells: readonly Cell[],
  targets: ReadonlyMap<string, Cell>,
  world: RefObject<HTMLElement | null>,
  camera: RefObject<{ x: number; y: number; follow: string | undefined }>,
  teleport?: string,
) {
  const motions = useRef(new Map<string, Motion>());
  const motionRoom = useRef(room);
  // Whether the people there when you came into this room have been taken in; later newcomers are arrivals.
  const seeded = useRef(false);
  if (motionRoom.current !== room) {
    motions.current = new Map();
    motionRoom.current = room;
    seeded.current = false;
  }
  const [, rerender] = useState(0);
  const targetsKey = [...targets].map(([id, c]) => `${id}@${c.x},${c.y}`).join(";");

  const at = new Map<string, Walker>();
  for (const [id, target] of targets) {
    const m = motions.current.get(id);
    at.set(id, m ? { cell: cellOf(m.pos), facing: m.facing, moving: m.route.length > 0, arriving: m.arriving } : { cell: target, facing: STANDING, moving: false, arriving: false });
  }
  // What the last commit drew, which the pixel shifts are measured from.
  const drawn = useRef(at);
  useLayoutEffect(() => {
    drawn.current = at;
  });

  /** Pixels between where React placed someone and where they are. */
  const offsetOf = useCallback((id: string) => {
    const m = motions.current.get(id), cell = drawn.current.get(id)?.cell;
    if (!m || !cell) return { x: 0, y: 0 };
    const px = gridToPx(m.pos.x - cell.x, m.pos.y - cell.y);
    return { x: Math.round(px.x), y: Math.round(px.y) };
  }, []);

  const apply = useCallback(() => {
    const el = world.current;
    if (!el) return;
    for (const node of el.querySelectorAll<HTMLElement>("[data-walker]")) {
      const o = offsetOf(node.dataset.walker!);
      node.style.translate = o.x || o.y ? `${o.x}px ${o.y}px` : "";
    }
    const cam = camera.current;
    const o = cam.follow ? offsetOf(cam.follow) : { x: 0, y: 0 };
    el.style.transform = `translate(${cam.x - o.x}px, ${cam.y - o.y}px)`;
  }, [world, camera, offsetOf]);

  const frame = useRef(0);
  const loop = useCallback(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const step = (CELLS_PER_SECOND * Math.min(now - last, 100)) / 1000;
      last = now;
      let walking = false, redraw = false;
      for (const [id, m] of motions.current) {
        let left = step;
        while (left > 0 && m.route.length) {
          const next = m.route[0]!;
          m.facing = facingFor(m.pos, next);
          const dist = Math.hypot(next.x - m.pos.x, next.y - m.pos.y);
          if (dist <= left) {
            m.pos = next;
            m.route.shift();
            left -= dist;
          } else {
            m.pos = { x: m.pos.x + ((next.x - m.pos.x) * left) / dist, y: m.pos.y + ((next.y - m.pos.y) * left) / dist };
            left = 0;
          }
        }
        if (m.route.length) walking = true;
        const was = drawn.current.get(id);
        if (!was || !same(was.cell, cellOf(m.pos)) || was.facing.strip !== m.facing.strip || was.facing.flip !== m.facing.flip || was.moving !== m.route.length > 0) redraw = true;
      }
      if (redraw) rerender((n) => n + 1);
      apply();
      frame.current = walking ? requestAnimationFrame(tick) : 0;
    };
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  }, [apply]);
  // Zero it too, so the loop can start again if the component is mounted again (StrictMode does that in dev).
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  // New targets: plan each walker's route there, in steps along the grid.
  // biome-ignore lint/correctness/useExhaustiveDependencies: targetsKey stands in for targets.
  useEffect(() => {
    for (const id of motions.current.keys()) if (!targets.has(id)) motions.current.delete(id);
    const arrivals = seeded.current;
    if (targets.size) seeded.current = true;
    for (const [id, target] of targets) {
      const m = motions.current.get(id);
      if (!m) {
        const motion = { pos: target, route: [], facing: STANDING, arriving: arrivals };
        motions.current.set(id, motion);
        // The walk-in lasts a second; after that a later remount must not replay it.
        if (arrivals) setTimeout(() => { motion.arriving = false; rerender((n) => n + 1); }, 1000);
        continue;
      }
      const end = m.route.at(-1) ?? m.pos;
      if (same(end, target)) continue;
      const path = id === teleport ? null : walkPath(cells, cellOf(m.pos), target);
      if (path) m.route = path.slice(1);
      else {
        m.pos = target;
        m.route = [];
      }
    }
    rerender((n) => n + 1);
    loop();
  }, [room, cells, targetsKey, loop, teleport]);

  return { at, apply, offsetOf };
}
