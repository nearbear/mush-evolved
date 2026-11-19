import { DEFAULT_CONFIG } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, find } from "./blocks.ts";
import type { GoalDef } from "./types.ts";

/** Others in the room a Leader waits for before speaking (owner, 2026-11-18, #452): +2 morale each, so +6 or more for 2 AP. */
export const FIERY_SPEECH_AUDIENCE = 3;

const SPEECH_AP = DEFAULT_CONFIG.speech.fiery.ap;

/**
 * A Leader's Fiery speech (owner, 2026-11-18, #452): once a day, where it already stands, when at least
 * `FIERY_SPEECH_AUDIENCE` other living people are in the room (ACTOPI or sharing the room shows them). It doesn't walk
 * anywhere for an audience. Keeps the AP reserve. Leaders only, by `BOT_DUTIES`' "daily" row.
 */
export const fierySpeech: GoalDef = {
  id: "fierySpeech",
  get priority() {
    return dutyPriority("daily", (d) => d.skill === "leadership");
  },
  options(view, memory) {
    if (!holdsTrigger(view, "daily", (d) => d.skill === "leadership") || memory.today.has("fierySpeech")) return [];
    const audience = view.players.filter((p) => p.alive && p.id !== view.you.id && p.room === view.you.room).length;
    if (audience < FIERY_SPEECH_AUDIENCE || view.you.ap - SPEECH_AP < memory.reserve || !find(view, "fiery_speech")) return [];
    return [
      {
        id: "fierySpeech",
        key: "fierySpeech",
        label: `Give a Fiery speech: ${audience} people here gain 2 morale each`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          if (m.today.has("fierySpeech")) return { kind: "done" };
          const speech = find(v, "fiery_speech");
          m.today.add("fierySpeech");
          return speech ? act(speech) : { kind: "done" };
        },
      },
    ];
  },
};
