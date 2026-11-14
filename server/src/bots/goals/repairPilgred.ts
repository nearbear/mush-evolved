import { canAfford, roomsWith, where } from "./blocks.ts";
import type { GoalDef } from "./types.ts";
import { workAt } from "./work.ts";

/** Repair PILGRED until it is done (the way home), down to the AP reserve. A PILGRED point makes a round free. */
export const repairPilgred: GoalDef = {
  id: "repairPilgred",
  priority: 60,
  options(view, memory) {
    if (view.pilgredRepaired) return [];
    const cost = view.you.resources.pilgred > 0 ? 0 : view.config.pilgredAp;
    const room = roomsWith(view, ["PILGRED"]).find((r) => !memory.ended.has(`repairPilgred:${r}`) && canAfford(view, r, cost, memory.reserve, memory));
    return room ? [workAt("repairPilgred", room, `Repair PILGRED ${where(view, room)}`, (v) => v.actions.find((o) => o.action.type === "repair_pilgred"))] : [];
  },
};
