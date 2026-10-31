// The parts of the action queue (queue.ts) that don't need the action registry, so action classes can use them without
// an import cycle: the summons walk (actions/summon.ts) drops a holder's queue through here.

import { logPrivate } from "./log.ts";
import type { Action, GameState, PlayerState } from "./types.ts";

/**
 * `clearQueue`'s core, on a state the caller already cloned: drops everything waiting, and the action under way unless
 * it has already happened ("start"). With `notify`, one `actionDropped` line per dropped action (owner, 2026-10-31).
 */
export function emptyQueue(next: GameState, actor: PlayerState, notify: boolean): void {
  const cancelsCurrent = next.config.action.resolveAt === "end" && actor.current !== null;
  const dropping = [...(cancelsCurrent ? [actor.current!.action] : []), ...actor.queue.map((q) => q.action)];
  actor.queue = [];
  if (cancelsCurrent) actor.current = null;
  if (notify) for (const action of dropping) dropped(next, actor, action);
}

/** A queued action that was no longer possible when its turn came, or dropped for a summons. Only the actor is told. */
export function dropped(next: GameState, actor: PlayerState, action: Action): void {
  if (actor.alive) logPrivate(next, actor.id, "actionDropped", { action: action.type });
}
