import { PROJECT_COMPLETE, PROJECT_IDS, type PlayerView } from "@mush2/shared";
import { canAfford, roomsWith } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";
import { mostAdvanced, workAt } from "./work.ts";

/**
 * Work on a NERON project at the core, the most advanced first. Designer and Computer points make a round free. Refuses
 * dirty players, like research; `assumeClean` asks as if the bot were clean (for the shower goal).
 */
export function projectOptions(view: PlayerView, memory: BotMemory, assumeClean = false): Goal[] {
  if (!assumeClean && view.statuses.includes("dirty")) return [];
  if (PROJECT_IDS.every((id) => (view.projects[id] ?? 0) >= PROJECT_COMPLETE)) return [];
  const free = view.you.resources.core > 0 || view.you.resources.comp > 0;
  const cost = free ? 0 : view.config.projectAp;
  const core = roomsWith(view, ["NERON_CORE"]).find((room) => canAfford(view, room, cost, memory.reserve));
  return core ? [workAt("project", core, (v) => mostAdvanced(v, "project", (a) => v.projects[a.project] ?? 0))] : [];
}

export const project: GoalDef = { id: "project", priority: 50, options: (view, memory) => projectOptions(view, memory) };
