// What the work goals share (repair PILGRED, patch the hull, research, NERON projects): walk to the place, then
// keep doing the work until another round would leave the bot under its AP reserve.

import type { Action, ActionOption, PlayerView, RoomId } from "@mush2/shared";
import { act, failed, goTo } from "./blocks.ts";
import type { Goal, GoalStep } from "./types.ts";

/**
 * A goal that walks to `room` and repeats the option `pick` chooses (from every offered option, affordable or not)
 * until the AP reserve would be broken. It ends with `again` when the only thing in the way is being dirty, so a
 * shower can come first and the work be chosen again this cycle.
 */
export function workAt(id: string, room: RoomId, pick: (view: PlayerView) => ActionOption | undefined): Goal {
  return {
    id,
    key: `${id}:${room}`,
    step(view, memory): GoalStep {
      const walk = goTo(view, room);
      if (walk) return walk;
      const option = pick(view);
      if (!option) return failed("nothing_to_do");
      if (view.you.ap - option.cost.ap < memory.reserve) return { kind: "done" };
      if (option.lacks.includes("clean")) return { kind: "done", again: true };
      if (option.lacks.length > 0) return { kind: "done" };
      return act(option.action);
    },
  };
}

/** The option of `type` with the most progress (`progress` by the option's action), ties to the first offered. */
export function mostAdvanced<T extends Action["type"]>(view: PlayerView, type: T, progress: (action: Extract<Action, { type: T }>) => number): ActionOption | undefined {
  let best: ActionOption | undefined;
  let bestProgress = -1;
  for (const option of view.actions) {
    if (option.action.type !== type) continue;
    const p = progress(option.action as Extract<Action, { type: T }>);
    if (p > bestProgress) {
      best = option;
      bestProgress = p;
    }
  }
  return best;
}
