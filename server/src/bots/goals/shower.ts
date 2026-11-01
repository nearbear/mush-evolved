import { act, canAfford, failed, find, goTo, roomsWith } from "./blocks.ts";
import { projectOptions } from "./project.ts";
import { repairHull } from "./repairHull.ts";
import { researchOptions } from "./research.ts";
import type { GoalDef } from "./types.ts";

/**
 * Shower when dirty and the work the bot would otherwise choose refuses dirty players (research, projects): not while
 * it could repair the hull, which comes first and doesn't mind dirt. Just before the work goals in the
 * scripted order. Needs the AP for the shower and a round of work after it (the walk on from the shower isn't priced).
 */
export const shower: GoalDef = {
  id: "shower",
  priority: 70,
  options(view, memory) {
    if (!view.statuses.includes("dirty")) return [];
    if (repairHull.options(view, memory).length > 0) return [];
    if (researchOptions(view, memory, true).length === 0 && projectOptions(view, memory, true).length === 0) return [];
    const workAp = Math.min(view.config.researchAp, view.config.projectAp);
    const room = roomsWith(view, ["SHOWER"]).find((r) => canAfford(view, r, view.config.showerAp + workAp, memory.reserve));
    if (!room) return [];
    return [
      {
        id: "shower",
        key: `shower:${room}`,
        step(v) {
          if (!v.statuses.includes("dirty")) return { kind: "done" };
          const walk = goTo(v, room);
          if (walk) return walk;
          const wash = find(v, "shower");
          return wash ? act(wash) : failed("cant_shower");
        },
      },
    ];
  },
};
