// What your character should walk up to for what you're doing: the target of the action you just
// started, or the door for a move (a move takes as long as any action; the room changes at its end). Read from the view's action queue, so the walk follows the queue and never holds it up:
// an action sent while idle walks at once; one waiting in the queue walks when the view shows it
// begun (a timed one as `current`, an instant one by leaving the queue once nothing is under way).
// Clearing the queue walks nowhere. Your roommates see the walk only for a public action (owner, 2026-10-20):
// walking up to what a private, secret or covert action is on would give it away.

import { useEffect, useRef, useState } from "react";
import { actionVisibility, type Action, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { actionTarget } from "../hud/targets.ts";

/**
 * A walk request: up to a target, or to the door of a room you're moving to. `n` changes on every
 * request, so acting on the same thing again walks back to it.
 */
export interface ActingOn {
  target: Target | { kind: "door"; to: RoomId };
  n: number;
  /** The action is public, so the walk is sent to the server for your roommates to see. */
  share: boolean;
}

type Queue = Pick<PlayerView["you"], "current" | "queue">;

/**
 * The action that began between two views of your queue, if any: a new action under way, or, once
 * nothing is under way any more, the last of the instant actions that left the queue. Clearing the
 * queue begins nothing (what's under way stays).
 */
export function begun(prev: Queue, next: Queue): Action | undefined {
  if (next.current) return next.current.since !== prev.current?.since ? next.current.action : undefined;
  if (prev.current && next.queue.length < prev.queue.length) return prev.queue[prev.queue.length - next.queue.length - 1];
  return undefined;
}

export function useActingOn(you: PlayerView["you"] | undefined): { actingOn: ActingOn | null; sentCount: number; sent: (action: Action) => void } {
  const [actingOn, setActingOn] = useState<ActingOn | null>(null);
  /** Actions sent so far, queued or not: sending any of them gets you up from a chair (IsoRoom). */
  const [sentCount, setSentCount] = useState(0);
  const walkFor = (action: Action | undefined) => {
    const target = action?.type === "move" ? { kind: "door" as const, to: action.to } : action && actionTarget(action);
    if (action && target) setActingOn((a) => ({ target, n: (a?.n ?? 0) + 1, share: actionVisibility(action.type) === "public" }));
  };

  const before = useRef(you);
  // biome-ignore lint/correctness/useExhaustiveDependencies: walkFor only sets state.
  useEffect(() => {
    const prev = before.current;
    before.current = you;
    if (prev && you) walkFor(begun(prev, you));
  }, [you]);

  /** Call on sending an action: if nothing is under way or waiting, it starts now. */
  const sent = (action: Action) => {
    setSentCount((n) => n + 1);
    if (you && !you.current && you.queue.length === 0) walkFor(action);
  };
  return { actingOn, sentCount, sent };
}
