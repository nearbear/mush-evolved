import { DEFAULT_CONFIG } from "@mush2/shared";
import { act, find } from "./blocks.ts";
import { expeditionLaunch } from "./expeditionLaunch.ts";
import { waitingAboard } from "./expeditionPrep.ts";
import type { GoalDef } from "./types.ts";

/** Above every other goal: the docked Icarus has no doors or equipment, so nothing else can be done from inside. */
export const LEAVE_ICARUS_PRIORITY = 101;

/**
 * Get off the docked Icarus (owner, 2026-11-17: boarding, docs/plans/expedition-boarding.md) when there is no takeoff
 * to wait for: not a launcher who can still take off (`expeditionLaunch`), not crew still waiting (`waitingAboard`).
 * Keeps a bot from sitting aboard for good, whatever put it there.
 */
export const leaveIcarus: GoalDef = {
  id: "leaveIcarus",
  priority: LEAVE_ICARUS_PRIORITY,
  options(view, memory) {
    if (view.you.room !== DEFAULT_CONFIG.expedition.craft) return [];
    if (!find(view, "leave_icarus")) return [];
    if (waitingAboard(view, memory) || expeditionLaunch.options(view, memory).length > 0) return [];
    return [
      {
        id: "leaveIcarus",
        key: "leaveIcarus",
        label: "Get off the Icarus, back into its bay", // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          // Crew that waited aboard its while gives up on the plan, so it doesn't board again (`expeditionPrep`).
          if (m.expeditionPrep?.ready) m.expeditionPrep.done = true;
          const leave = find(v, "leave_icarus");
          return leave ? act(leave) : { kind: "done" };
        },
      },
    ];
  },
};
