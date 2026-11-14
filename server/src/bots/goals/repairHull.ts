import { roomsHolding } from "../itemShare.ts";
import { canAfford, nearest, where } from "./blocks.ts";
import type { GoalDef } from "./types.ts";
import { workAt } from "./work.ts";

/** Hull points under which a bot patches the hull. */
export const HULL_REPAIR_BELOW = 50;

/**
 * Patch the hull with metal scrap (repair_hull.ts needs one carried or lying in the room, and offers nothing while the
 * hull is full): where the bot stands if it can, otherwise in the nearest room it knows to hold scrap (owner,
 * 2026-11-13: from what it saw or what a bot said in chat, `itemShare.ts`, never a fixed room). A patch works from any
 * room, so the scrap isn't carried anywhere. Only while the hull is below `HULL_REPAIR_BELOW` (owner, 2026-11-01:
 * above it, scrap is worth more elsewhere). Down to the AP reserve, or until the scraps run out.
 */
export const repairHull: GoalDef = {
  id: "repairHull",
  priority: 55,
  options(view, memory) {
    if (view.ship.hull >= HULL_REPAIR_BELOW) return [];
    const here = view.actions.some((o) => o.action.type === "repair_hull");
    const room = here
      ? view.you.room
      : nearest(view, roomsHolding(memory, "metal_scraps")).find((r) => !memory.ended.has(`repairHull:${r}`) && canAfford(view, r, view.config.hullRepairAp, memory.reserve));
    if (room === undefined || !canAfford(view, room, view.config.hullRepairAp, memory.reserve)) return [];
    return [workAt("repairHull", room, `Patch the hull with the metal scrap ${where(view, room)}`, (v) => v.actions.find((o) => o.action.type === "repair_hull"))];
  },
};
