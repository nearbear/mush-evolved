// Helping someone who asked in chat (docs/plans/bot-goals.md, `help`): heal them, comfort them, or give a Fiery speech.
// Model bots only: asking and answering are conversation, so the model fills the goal's parameters from its reply, and
// the parser checks each against the bot's own view. Where the person is comes only from what they said; the goal
// fails on arrival if they aren't there.

import type { PlayerId, PlayerView, RoomId } from "@mush2/shared";
import { act, failed, goTo, offered } from "./blocks.ts";
import type { Goal } from "./types.ts";

/** What a bot can help with. A subset of the plan task catalog (`PlanTask`). */
export const HELP_TASKS = ["heal", "comfort", "fiery_speech"] as const;
export type HelpTask = (typeof HELP_TASKS)[number];

/** Most times one `help` goal repeats its action (a Shrink comforts 2 morale at a time until the stated need is met). */
export const HELP_MAX_TIMES = 5;

export interface HelpParams {
  task: HelpTask;
  /** Who: for heal and comfort. A speech reaches everyone in the room. */
  target: PlayerId | null;
  room: RoomId;
  times: number;
  /** May spend the AP reserve (owner, 2026-11-01: a Shrink does when the person says they are under 7 morale). */
  spendReserve: boolean;
}

/** Tasks that take a target. */
export const targeted = (task: HelpTask): boolean => task !== "fiery_speech";

export const helpKey = (params: Pick<HelpParams, "task" | "target" | "room">): string => `help:${params.task}:${params.target ?? "-"}:${params.room}`;

/**
 * The tasks this bot could do at all, from its own view: heal with a medikit it carries (or in the sick bay, without
 * one), comfort as a Shrink, a Fiery speech as a Leader.
 */
export function helpTasks(view: PlayerView): HelpTask[] {
  const tasks: HelpTask[] = ["heal"];
  if (view.you.skills.includes("shrink")) tasks.push("comfort");
  if (view.you.skills.includes("leadership")) tasks.push("fiery_speech");
  return tasks;
}

export function helpGoal(params: HelpParams, name: (id: PlayerId) => string): Goal {
  const { task, target, room, times, spendReserve } = params;
  let done = 0;
  const who = target === null ? "" : ` ${name(target)}`;
  return {
    id: "help",
    key: helpKey(params),
    // i18n-ignore: model prompt text, not player-visible
    label: `Help: ${task}${who} in ${room}${times > 1 ? `, ${times} times` : ""}${spendReserve ? ", spending your reserve if needed" : ""}`,
    step(view, memory) {
      if (done >= times) return { kind: "done" };
      const walk = goTo(view, room);
      if (walk) return walk;
      if (target !== null && !view.players.some((p) => p.id === target && p.alive && p.room === view.you.room)) return failed("not_here");
      const option = offered(view, task).find((o) => target === null || ("target" in o.action && o.action.target === target));
      if (!option) return failed("cant_do");
      const stop = (reason: string) => (done > 0 ? { kind: "done" as const } : failed(reason));
      if (option.lacks.length > 0) return stop("cant_afford");
      if (!spendReserve && view.you.ap - option.cost.ap < memory.reserve) return stop("reserve");
      done++;
      return act(option.action);
    },
  };
}
