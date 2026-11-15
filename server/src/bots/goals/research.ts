import { RESEARCH_COMPLETE, RESEARCH_IDS, type PlayerView } from "@mush2/shared";
import { canAfford, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";
import { deskWorkReserve, mostAdvanced, workAt } from "./work.ts";

/**
 * Research at the nearest lab, the most advanced research first. Which researches the lab can work on (its item
 * requirements) is only known inside it, so that is checked on arrival. Research refuses dirty players, so a dirty bot
 * isn't offered it; `assumeClean` asks as if it were clean (for the shower goal).
 */
export function researchOptions(view: PlayerView, memory: BotMemory, assumeClean = false): Goal[] {
  if (!assumeClean && view.statuses.includes("dirty")) return [];
  if (RESEARCH_IDS.every((id) => (view.research[id] ?? 0) >= RESEARCH_COMPLETE)) return [];
  const cost = view.you.resources.comp > 0 ? 0 : view.config.researchAp;
  const lab = roomsWith(view, ["RESEARCH_LAB"]).find((room) => !memory.ended.has(`research:${room}`) && canAfford(view, room, cost, deskWorkReserve(view, memory), memory));
  return lab ? [workAt("research", lab, `Research ${where(view, lab)}, the most advanced research first`, (v) => mostAdvanced(v, "research", (a) => v.research[a.research] ?? 0), deskWorkReserve)] : [];
}

export const research: GoalDef = { id: "research", priority: 50, options: (view, memory) => researchOptions(view, memory) };
