import { astroOptions, nextAstroAp } from "./astro.ts";
import { act, canAfford, failed, find, goTo, roomsWith, where } from "./blocks.ts";
import { commsOfficerOptions, nextCommsAp } from "./commsOfficer.ts";
import { contactSolOptions } from "./contactSol.ts";
import { projectOptions } from "./project.ts";
import { repairHull } from "./repairHull.ts";
import { researchOptions } from "./research.ts";
import type { GoalDef } from "./types.ts";
import { deskWorkReserve } from "./work.ts";

/**
 * Shower when dirty and the work the bot would otherwise choose refuses dirty players (comms, astro, research,
 * projects): not while it could repair the hull, which comes first and doesn't mind dirt. Just before the work goals in
 * the scripted order. Needs the AP for the shower and a round of work after it (the walk on from the shower isn't priced).
 */
export const shower: GoalDef = {
  id: "shower",
  priority: 70,
  options(view, memory) {
    if (!view.statuses.includes("dirty")) return [];
    if (repairHull.options(view, memory).length > 0) return [];
    const wantSol = contactSolOptions(view, memory, true).length > 0;
    const wantAstro = astroOptions(view, memory, true).length > 0;
    const wantComms = commsOfficerOptions(view, memory, true).length > 0;
    const wantResearch = researchOptions(view, memory, true).length > 0;
    const wantProject = projectOptions(view, memory, true).length > 0;
    if (!wantSol && !wantAstro && !wantComms && !wantResearch && !wantProject) return [];
    const dutyAp = Math.min(
      wantSol ? view.config.contactSolAp : Infinity,
      wantAstro ? (nextAstroAp(view) ?? Infinity) : Infinity,
      wantComms ? nextCommsAp(view) : Infinity,
    );
    const researchAp = view.you.resources.comp > 0 ? 0 : view.config.researchAp;
    const projectAp = view.you.resources.core > 0 || view.you.resources.comp > 0 ? 0 : view.config.projectAp;
    const deskAp = Math.min(wantResearch ? researchAp : Infinity, wantProject ? projectAp : Infinity);
    const deskReserve = deskWorkReserve(view, memory);
    const room = roomsWith(view, ["SHOWER"]).find(
      (r) =>
        !memory.ended.has(`shower:${r}`) &&
        (canAfford(view, r, view.config.showerAp + dutyAp, memory.reserve, memory) ||
          canAfford(view, r, view.config.showerAp + deskAp, deskReserve, memory)),
    );
    if (!room) return [];
    return [
      {
        id: "shower",
        key: `shower:${room}`,
        label: `Shower ${where(view, room)} (you are dirty, and research and projects refuse dirty players)`,
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
