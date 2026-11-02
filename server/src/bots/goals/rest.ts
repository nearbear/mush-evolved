import { act, canAfford, failed, find, goTo, roomsWith, where } from "./blocks.ts";
import type { Goal, GoalDef } from "./types.ts";

/** Goals that interrupt a rest at the start of a cycle when hunters are outside (owner, 2026-11-01). */
const HUNTER_GOALS = new Set(["shootHunters", "patrolShootHunters"]);

/**
 * Rest in the nearest bed (a bed gives AP each cycle): lie down, then wait cycle after cycle until AP is full. A new
 * cycle doesn't interrupt it, or the bot would get up after one cycle. Comes once the bot has no AP left it would spend
 * on work. Whether a bed is free is learned only on arrival; a taken one fails, and the next nearest bedroom is offered.
 * May spend the AP reserve to get there.
 */
export const rest: GoalDef = {
  id: "rest",
  priority: 40,
  options(view, memory) {
    if (view.you.ap >= view.maxAp) return [];
    if (view.you.lyingIn !== undefined) return [restIn(view.you.room, "Stay in bed until your AP is full")];
    const room = roomsWith(view, ["BED"]).find((r) => !memory.ended.has(`rest:${r}`) && canAfford(view, r, view.config.lieDownAp, 0));
    return room ? [restIn(room, `Rest: lie down in a bed ${where(view, room)} until your AP is full`)] : [];
  },
};

function restIn(room: string, label: string): Goal {
  return {
    id: "rest",
    key: `rest:${room}`,
    label,
    step(view) {
      // Rested: it may rest here again later this cycle.
      if (view.you.ap >= view.maxAp) return { kind: "done", again: true };
      if (view.you.lyingIn !== undefined) return { kind: "wait" };
      const walk = goTo(view, room);
      if (walk) return walk;
      const bed = find(view, "lie_down");
      return bed ? act(bed) : failed("bed_taken");
    },
    keepAcrossCycle(view, memory, _newDay, goals) {
      return !(view.hunters.count > 0 && goals.some((def) => HUNTER_GOALS.has(def.id) && def.options(view, memory).length > 0));
    },
  };
}
