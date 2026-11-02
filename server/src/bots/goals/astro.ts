import type { PlayerView } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, failed, goTo, offered, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";

const ASTRO = "ASTRO_MODULE";
const isAstroDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("scan_planet"));

/**
 * AP the next astro action will cost this Astrophysicist: an unanalyzed planet first (1 AP in orbit, 2 AP remotely),
 * otherwise a scan (1 AP cheaper for the Astrophysicist) while under the planet cap and not in orbit or traveling.
 * Null when every held planet is fully analyzed and no new scan can be made.
 */
export function nextAstroAp(view: PlayerView): number | null {
  const unanalyzed = view.planets.find((p) => p.sectors.some((s) => s === null));
  if (unanalyzed) return unanalyzed.orbited ? view.config.orbitAnalyzeAp : view.config.analyzeAp;
  if (view.planets.length < view.maxPlanets && !view.navigation.orbiting && !view.navigation.traveling) {
    return Math.max(0, view.config.scanAp - view.config.astrophysicistScanDiscount);
  }
  return null;
}

/**
 * The Astrophysicist's daily duty (`BOT_DUTIES`, owner 2026-11-01, #222): once a day, walk to the Astro terminal and
 * analyze any planet with unknown sectors first, then scan for new planets while under `maxPlanets`, working down to
 * the AP reserve before marking the day's astro session done.
 */
export const astro: GoalDef = {
  id: "astro",
  get priority() {
    return dutyPriority("daily", isAstroDuty);
  },
  options: (view, memory) => astroOptions(view, memory, false),
};

export function astroOptions(view: PlayerView, memory: BotMemory, ignoreDirty: boolean): Goal[] {
  if (!holdsTrigger(view, "daily", isAstroDuty)) return [];
  if (!ignoreDirty && view.statuses.includes("dirty")) return [];
  const ap = nextAstroAp(view);
  if (ap === null) return [];
  const room = roomsWith(view, [ASTRO]).find(
    (r) => !memory.ended.has(`astro:${r}`) && !memory.today.has(`astro:${r}`) && canAfford(view, r, ap, memory.reserve),
  );
  if (!room) return [];
  const key = `astro:${room}`;
  let acted = false;
  return [
    {
      id: "astro",
      key,
      label: `Analyze and scan planets at the astro terminal ${where(view, room)}`, // i18n-ignore: model prompt text, not player-visible
      step(v, m) {
        const walk = goTo(v, room);
        if (walk) return walk;
        const option = offered(v, "analyze_planet")[0] ?? offered(v, "scan_planet")[0];
        if (!option) {
          if (acted || nextAstroAp(v) === null) {
            m.today.add(key);
            return { kind: "done" };
          }
          return failed("cant_astro");
        }
        if (v.you.ap - option.cost.ap < m.reserve) {
          if (acted) m.today.add(key);
          return { kind: "done" };
        }
        if (option.lacks.includes("clean")) return { kind: "done", again: true };
        if (option.lacks.length > 0) {
          if (acted) m.today.add(key);
          return { kind: "done" };
        }
        acted = true;
        return act(option.action);
      },
    },
  ];
}
