import { act, find, where } from "./blocks.ts";
import type { GoalDef } from "./types.ts";

/**
 * A Scrapper snoops (free) whenever it is offered where the bot stands: in a storage room it hasn't snooped today
 * (owner, 2026-11-01). It never walks to a storage for it. Right after picking skills in the scripted order.
 */
export const snoop: GoalDef = {
  id: "snoop",
  priority: 85,
  options(view) {
    if (!find(view, "snoop")) return [];
    const room = view.you.room;
    return [
      {
        id: "snoop",
        key: `snoop:${room}`,
        label: `Snoop for scrap ${where(view, room)} (free, once a day per storage)`, // i18n-ignore: model prompt text, not player-visible
        step(v) {
          if (v.you.room !== room) return { kind: "done" };
          const action = find(v, "snoop");
          return action ? act(action) : { kind: "done" };
        },
      },
    ];
  },
};
