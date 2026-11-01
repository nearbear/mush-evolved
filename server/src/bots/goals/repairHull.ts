import { canAfford } from "./blocks.ts";
import type { GoalDef } from "./types.ts";
import { workAt } from "./work.ts";

/**
 * Patch the hull where the bot stands, while it carries a metal scrap or sees one in its room (repair_hull.ts needs
 * one, and offers nothing while the hull is full). Down to the AP reserve, or until the scraps run out.
 */
export const repairHull: GoalDef = {
  id: "repairHull",
  priority: 55,
  options(view, memory) {
    if (!view.actions.some((o) => o.action.type === "repair_hull")) return [];
    if (!canAfford(view, view.you.room, view.config.hullRepairAp, memory.reserve)) return [];
    return [workAt("repairHull", view.you.room, (v) => v.actions.find((o) => o.action.type === "repair_hull"))];
  },
};
