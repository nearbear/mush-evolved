// Walking in the iso view: everyone in your room moves smoothly toward where they should stand,
// instead of jumping there. Where they head is IsoRoom's (from the view's spots and your clicks); the
// walk itself is drawing only: the server never hears of it, and nothing waits for a walk to finish (an action or a move is sent at once,
// whatever the drawing is doing). It walks even with prefers-reduced-motion set: the walk is how
// you see where someone went, not decoration (Windows sets that preference whenever its animation
// effects are off).
//
// React only re-renders when someone crosses into another cell or turns (paint order and the strip
// depend on those). In between, an animation frame loop hands the renderer how far, in whole pixels,
// each walker is from where React placed them, so the motion is continuous and the camera stays
// locked on you. This hook doesn't draw: whatever `paint` does with the offsets is the renderer's.
//
// Doors: someone going through one (`Goal.from` and `Goal.then`, steps from `doorPassage`) opens it
// as they come up to it, timed so it is open as they get there (they wait at it if it isn't yet),
// and it shuts behind them once nobody is in the doorway or about to be.
//
// Pushing a wheelchair: the pusher's goal is `behind` the person they push, so they walk that person's trail a cell
// back (planned together, so the two move as one), rather than heading for a cell of their own.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RoomId } from "@mush2/shared";
import { gridToPx, walkPath, type DoorStep } from "./placement.ts";
import type { DoorState } from "./scene.ts";

type Cell = { x: number; y: number };

/** Where someone should be: a cell on the floor, and the ways in and out through a door if they're coming or going. */
export interface Goal {
  cell: Cell;
  /** Walked from its first step when they first appear (in through a door), then on to `cell`. */
  from?: readonly DoorStep[];
  /** Walked on from `cell` (out through a door), ending where they stop. */
  then?: readonly DoorStep[];
  /** Follow this walker (pushing their wheelchair): walk their trail and stop a cell short of them. `cell` is only where a newcomer starts. */
  behind?: string;
}

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

export interface Motion {
  /** Where they are now, in grid units (between cells while walking). */
  pos: Cell;
  /** The points still to walk through, the last being where they stop. */
  route: DoorStep[];
  facing: Facing;
  arriving: boolean;
  /** The door whose doorway they last stepped into, until they step out of it. */
  inDoor?: string;
  /** Standing at a door until it is open. */
  waiting: boolean;
}

export interface Door {
  state: DoorState;
  since: number;
}

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const cellOf = (p: Cell) => ({ x: Math.round(p.x), y: Math.round(p.y) });
const key = (c: Cell) => `${c.x},${c.y}`;
/** Where someone ends up: out through a door, or at their cell. */
const destination = (g: Goal) => g.then?.at(-1) ?? g.cell;

/**
 * One animation frame of walking: everyone moves up to `step` cells along their route, and doors open
 * for whoever is in the doorway or near enough that it will be open as they get there (`openMs`
 * ahead, plus a cell), and shut once nobody is. Nobody steps into a doorway before its door is open:
 * someone who comes up to it too soon waits.
 * Updates `motions` and `doors` in place. `walking`: anyone has further to go; `redraw`: a door
 * changed.
 */
export function stepWalkers(
  motions: ReadonlyMap<string, Motion>,
  doors: Map<string, Door>,
  now: number,
  step: number,
  openMs: (door: string) => number,
): { walking: boolean; redraw: boolean } {
  let walking = false, redraw = false;
  /** Opens the doors someone is in or coming up to, and shuts the rest. */
  const updateDoors = () => {
    const wanted = new Set<string>();
    for (const m of motions.values()) {
      if (m.inDoor) wanted.add(m.inDoor);
      let ahead = 0, from = m.pos;
      for (const p of m.route) {
        ahead += Math.hypot(p.x - from.x, p.y - from.y);
        from = p;
        if (p.door) {
          if (ahead <= (CELLS_PER_SECOND * openMs(p.door)) / 1000 + 1) wanted.add(p.door);
          break;
        }
      }
    }
    for (const [k, d] of doors) {
      if (wanted.has(k) || d.state === "closing") continue;
      doors.set(k, { state: "closing", since: now });
      redraw = true;
    }
    for (const k of wanted) {
      const d = doors.get(k);
      if (d && d.state !== "closing") continue;
      doors.set(k, { state: "opening", since: now });
      redraw = true;
    }
  };
  updateDoors();
  /** How long until a door is open, in ms. */
  const openIn = (k: string) => {
    const d = doors.get(k);
    if (d?.state === "open") return 0;
    return d?.state === "opening" ? Math.max(0, openMs(k) - (now - d.since)) : openMs(k);
  };
  for (const m of motions.values()) {
    let left = step;
    m.waiting = false;
    while (left > 0 && m.route.length) {
      const next = m.route[0]!;
      m.facing = facingFor(m.pos, next);
      const dist = Math.hypot(next.x - m.pos.x, next.y - m.pos.y);
      // Into a doorway no sooner than its door is open: walk up to it, then wait.
      if (next.door && next.door !== m.inDoor) {
        const free = dist - (CELLS_PER_SECOND * openIn(next.door)) / 1000;
        if (free <= 0) {
          m.waiting = true;
          break;
        }
        left = Math.min(left, free);
      }
      if (dist <= left) {
        m.pos = { x: next.x, y: next.y };
        m.inDoor = next.door;
        m.route.shift();
        left -= dist;
      } else {
        m.pos = { x: m.pos.x + ((next.x - m.pos.x) * left) / dist, y: m.pos.y + ((next.y - m.pos.y) * left) / dist };
        left = 0;
      }
    }
    if (m.route.length) walking = true;
  }
  // Again after the steps: a door shuts behind whoever just stepped out of it, even if they stop
  // there and this is the last frame.
  updateDoors();
  return { walking, redraw };
}

/**
 * Sends `m` along `leader`'s trail, from where the leader is now to where they stop, ending a cell short of them (or
 * jumps there, with `jump`). Someone who already stands there, or can't get to the leader on foot, stays put.
 */
export function followTrail(cells: readonly Cell[], m: Motion, leader: Motion, jump = false): void {
  const at = cellOf(leader.pos);
  const path = walkPath(cells, cellOf(m.pos), at);
  if (!path) return;
  const full = [...path.slice(1), ...leader.route.filter((p) => !p.door)];
  const end = full.at(-2);
  if (!end || same(end, m.route.at(-1) ?? m.pos)) return;
  if (jump) {
    m.pos = { x: end.x, y: end.y };
    m.route = [];
  } else m.route = full.slice(0, -1);
}

/**
 * Walkers in `room`, by id: everyone in `targets` moves to their goal; anyone new is drawn at its
 * cell straight away, or at the start of its way in. A goal that can't be reached on foot is jumped
 * to, and so is every goal of `teleport` (the instant actions cheat: you jump, as before walking).
 * `openMs` is how long a door (by sprite key) takes to open. `paint` is called with `offsetOf` on
 * every animation frame while anyone walks; call `apply` after every render too, so the pixel
 * shifts are put back on whatever React rewrote. `doors` are the doors open or moving, by key.
 */
export function useWalkers(
  room: RoomId,
  cells: readonly Cell[],
  targets: ReadonlyMap<string, Goal>,
  openMs: (door: string) => number,
  paint: RefObject<((offsetOf: (id: string) => { x: number; y: number }) => void) | null>,
  teleport?: string,
) {
  const motions = useRef(new Map<string, Motion>());
  const doors = useRef(new Map<string, Door>());
  const motionRoom = useRef(room);
  // Whether the people there when you came into this room have been taken in; later newcomers are arrivals.
  const seeded = useRef(false);
  if (motionRoom.current !== room) {
    motions.current = new Map();
    doors.current = new Map();
    motionRoom.current = room;
    seeded.current = false;
  }
  const [, rerender] = useState(0);
  const targetsKey = [...targets].map(([id, g]) => `${id}@${key(g.cell)}>${key(destination(g))}${g.behind ? `~${g.behind}` : ""}`).join(";");
  const openFor = useRef(openMs);
  openFor.current = openMs;

  const at = new Map<string, Walker>();
  for (const [id, goal] of targets) {
    const m = motions.current.get(id);
    const start = (id !== teleport && goal.from?.[0]) || goal.cell;
    at.set(id, m ? { cell: cellOf(m.pos), facing: m.facing, moving: m.route.length > 0 && !m.waiting, arriving: m.arriving } : { cell: { x: start.x, y: start.y }, facing: STANDING, moving: false, arriving: false });
  }
  const doorStates: ReadonlyMap<string, DoorState> = new Map([...doors.current].map(([k, d]) => [k, d.state]));
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

  const apply = useCallback(() => paint.current?.(offsetOf), [paint, offsetOf]);

  const frame = useRef(0);
  const loop = useCallback(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const step = (CELLS_PER_SECOND * Math.min(now - last, 100)) / 1000;
      last = now;
      const { walking, redraw: doorMoved } = stepWalkers(motions.current, doors.current, now, step, openFor.current);
      let redraw = doorMoved;
      for (const [id, m] of motions.current) {
        const was = drawn.current.get(id);
        const moving = m.route.length > 0 && !m.waiting;
        if (!was || !same(was.cell, cellOf(m.pos)) || was.facing.strip !== m.facing.strip || was.facing.flip !== m.facing.flip || was.moving !== moving) redraw = true;
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
    const walkable = new Set(cells.map(key));
    // Leaders first, so a follower's route is planned along the leader's new one.
    const ordered = [...targets].sort(([, a], [, b]) => Number(!!a.behind) - Number(!!b.behind));
    for (const [id, goal] of ordered) {
      const m = motions.current.get(id);
      const leader = m && goal.behind !== undefined ? motions.current.get(goal.behind) : undefined;
      if (m && leader) {
        followTrail(cells, m, leader, id === teleport);
        continue;
      }
      const dest = destination(goal);
      if (!m) {
        // In through a door: from the doorway (or beyond it) to the cell in front of it, then on.
        const from = id === teleport ? undefined : goal.from;
        const start = from?.[0];
        const inside = from?.at(-1);
        const route = from && inside ? [...from.slice(1), ...(walkPath(cells, inside, goal.cell)?.slice(1) ?? []), ...(goal.then ?? [])] : [];
        const motion: Motion = { pos: start ? { x: start.x, y: start.y } : goal.cell, route, facing: STANDING, arriving: arrivals && !start, inDoor: start?.door, waiting: false };
        motions.current.set(id, motion);
        // Starting in a doorway, the door is already open (they came through it from the room you left).
        if (start?.door) doors.current.set(start.door, { state: "open", since: 0 });
        // The walk-in lasts a second; after that a later remount must not replay it.
        if (motion.arriving) setTimeout(() => { motion.arriving = false; rerender((n) => n + 1); }, 1000);
        continue;
      }
      const end = m.route.at(-1) ?? m.pos;
      if (same(end, dest)) continue;
      // Someone still in a doorway steps out of it onto the floor first.
      const here = cellOf(m.pos);
      const i = walkable.has(key(here)) ? -1 : m.route.findIndex((p) => walkable.has(key(p)));
      const path = id === teleport ? null : walkPath(cells, i < 0 ? here : m.route[i]!, goal.cell);
      if (path) m.route = [...(i < 0 ? path.slice(1) : [...m.route.slice(0, i), ...path]), ...(goal.then ?? [])];
      else {
        m.pos = { x: dest.x, y: dest.y };
        m.route = [];
        m.inDoor = undefined;
      }
    }
    rerender((n) => n + 1);
    loop();
  }, [room, cells, targetsKey, loop, teleport]);

  return { at, doors: doorStates, apply, offsetOf };
}
