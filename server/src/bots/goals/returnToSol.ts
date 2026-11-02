import { act, canAfford, failed, find, goTo, roomsWith, where } from "./blocks.ts";
import type { GoalDef } from "./types.ts";

/**
 * Take the ship home once PILGRED is repaired, if the bot is the Commander (return_to_sol.ts). First in the scripted
 * order, since it wins the game; it may spend the AP reserve, which is kept for exactly this kind of moment.
 */
export const returnToSol: GoalDef = {
  id: "returnToSol",
  priority: 100,
  options(view, memory) {
    if (!view.pilgredRepaired) return [];
    if (view.titles.find((t) => t.id === "commander")?.holder !== view.you.character) return [];
    const room = roomsWith(view, ["PILOT_MODULE"]).find((r) => !memory.ended.has(`returnToSol:${r}`) && canAfford(view, r, view.config.returnToSolAp, 0));
    if (!room) return [];
    return [
      {
        id: "returnToSol",
        key: `returnToSol:${room}`,
        label: `Return to Sol from the pilot module ${where(view, room)}`,
        step(v) {
          const walk = goTo(v, room);
          if (walk) return walk;
          const go = find(v, "return_to_sol");
          return go ? act(go) : failed("cant_return");
        },
      },
    ];
  },
};
