import { canAfford } from "./blocks.ts";
import type { GoalDef } from "./types.ts";
import { workAt } from "./work.ts";

/** Hull points under which a bot patches the hull. */
export const HULL_REPAIR_BELOW = 50;

/**
 * Patch the hull where the bot stands, while it carries a metal scrap or sees one in its room (repair_hull.ts needs
 * one, and offers nothing while the hull is full). Only while the hull is below `HULL_REPAIR_BELOW` (owner,
 * 2026-11-01: above it, scrap is worth more elsewhere). Down to the AP reserve, or until the scraps run out.
 */
export const repairHull: GoalDef = {
  id: "repairHull",
  priority: 55,
  options(view, memory) {
    if (view.ship.hull >= HULL_REPAIR_BELOW) return [];
    if (!view.actions.some((o) => o.action.type === "repair_hull")) return [];
    if (!canAfford(view, view.you.room, view.config.hullRepairAp, memory.reserve)) return [];
    return [workAt("repairHull", view.you.room, "Patch the hull here with metal scrap", (v) => v.actions.find((o) => o.action.type === "repair_hull"))];
  },
};
