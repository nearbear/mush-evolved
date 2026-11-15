import { DEFAULT_CONFIG, viewPath, type PlayerView } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { activeSharedPlanet } from "../planetShare.ts";
import { exploredOn } from "../reportShare.ts";
import { act, canAfford, find, goTo, offered } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";

export const EXPEDITION_LAUNCH_PRIORITY = 73.5;

const ICARUS = DEFAULT_CONFIG.expedition.room;

const openExpeditionPlan = (view: PlayerView) =>
  view.plans.find((p) => p.purpose === "expedition" && p.status === "open");

function hasKnownUnexplored(view: PlayerView, memory: BotMemory): boolean {
  const orbitName = view.navigation.orbitName;
  if (!orbitName) return true;
  const explored = exploredOn(memory, orbitName).length;
  const own = view.planets.find((p) => p.orbited || p.name === orbitName);
  if (own && explored >= own.sectors.length) return false;
  const shared = activeSharedPlanet(view);
  if (shared && shared.name === orbitName && explored >= shared.sectors.length) return false;
  return true;
}

const noTakeoffKey = (view: PlayerView): string => `noTakeoff:${view.navigation.orbitName ?? "orbit"}`;

/**
 * Once in orbit with unexplored sectors, a Pilot walks to `ICARUS`, runs `summon` on the open expedition plan
 * (if authored by them), and launches the expedition with `icarus_takeoff`. If an open plan belongs to another
 * living Pilot, this Pilot defers so the author can summon the crew first.
 */
export const expeditionLaunch: GoalDef = {
  id: "expeditionLaunch",
  priority: EXPEDITION_LAUNCH_PRIORITY,
  options(view, memory) {
    if (!view.you.alive || view.patrolShip !== null) return [];
    if (!hasBotSkill(view, "pilot")) return [];
    if (!view.navigation.orbiting || view.expedition !== null) return [];
    if (memory.once.has(noTakeoffKey(view))) return [];
    if (!hasKnownUnexplored(view, memory)) return [];

    const open = openExpeditionPlan(view);
    if (open && open.author !== view.you.id && view.players.some((p) => p.id === open.author && p.alive)) {
      return [];
    }

    if (view.you.room === ICARUS) {
      if (offered(view, "icarus_takeoff").length === 0) return [];
    } else {
      if (viewPath(view, view.you.room, ICARUS) === null) return [];
      if (!canAfford(view, ICARUS, 0, memory.reserve, memory)) return [];
    }

    const key = `expeditionLaunch:${view.navigation.orbitName ?? "orbit"}`;
    if (memory.ended.has(key)) return [];
    return [launchGoal(key)];
  },
};

function launchGoal(key: string): Goal {
  return {
    id: "expeditionLaunch",
    key,
    label: "Summon the expedition crew and launch the Icarus", // i18n-ignore: model prompt text, not player-visible
    step(v, m) {
      if (!v.navigation.orbiting || v.expedition !== null) return { kind: "done" };
      if (v.you.room !== ICARUS) {
        const walk = goTo(v, ICARUS);
        if (walk) return walk;
      }
      const open = openExpeditionPlan(v);
      if (open && open.author === v.you.id) {
        const summon = find(v, "summon", (a) => a.plan === open.id);
        if (summon) return act(summon);
      }
      const offers = offered(v, "icarus_takeoff");
      if (offers.length === 0) {
        m.once.add(noTakeoffKey(v));
        return { kind: "done" };
      }
      const affordable = offers.find((o) => o.lacks.length === 0);
      return affordable ? act(affordable.action) : { kind: "wait" };
    },
  };
}
