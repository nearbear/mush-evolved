import { PROJECT_COMPLETE, PROJECT_IDS, type ActionOption, type PlayerView, type ProjectId } from "@mush2/shared";
import { canAfford, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";
import { deskWorkReserve, mostAdvanced, workAt } from "./work.ts";

/**
 * Projects the crew works on first, in order, before any other (#428). Fire Detector alone for now (owner, 2026-11-14), so
 * the survival harness measures its effect by itself; the rest fall back to the most advanced.
 */
export const BOT_PROJECT_ORDER: readonly ProjectId[] = ["FIRE_SENSOR"];

/** The first offered project in `BOT_PROJECT_ORDER`, else the most advanced one. */
export function pickProject(view: PlayerView): ActionOption | undefined {
  for (const id of BOT_PROJECT_ORDER) {
    const option = view.actions.find((o) => o.action.type === "project" && o.action.project === id);
    if (option) return option;
  }
  return mostAdvanced(view, "project", (a) => view.projects[a.project] ?? 0);
}

/**
 * Work on a NERON project at the core: those in `BOT_PROJECT_ORDER` first, then the most advanced. Designer and Computer points make a round free. Refuses
 * dirty players, like research; `assumeClean` asks as if the bot were clean (for the shower goal).
 */
export function projectOptions(view: PlayerView, memory: BotMemory, assumeClean = false): Goal[] {
  if (!assumeClean && view.statuses.includes("dirty")) return [];
  if (PROJECT_IDS.every((id) => (view.projects[id] ?? 0) >= PROJECT_COMPLETE)) return [];
  const free = view.you.resources.core > 0 || view.you.resources.comp > 0;
  const cost = free ? 0 : view.config.projectAp;
  const core = roomsWith(view, ["NERON_CORE"]).find((room) => !memory.ended.has(`project:${room}`) && canAfford(view, room, cost, deskWorkReserve(view, memory), memory));
  return core ? [workAt("project", core, `Work on NERON projects at a terminal ${where(view, core)}, Fire Detector first, then the most advanced`, pickProject, deskWorkReserve)] : [];
}

export const project: GoalDef = { id: "project", priority: 50, options: (view, memory) => projectOptions(view, memory) };
