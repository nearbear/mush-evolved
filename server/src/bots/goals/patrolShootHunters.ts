import type { PlayerView, RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, failed, find, goTo, offered, roomsWith, where } from "./blocks.ts";
import { onlyAsteroids, shotOrder } from "./hunterTargets.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/** A ship's interface in its bay (`PATROL_INTERFACE` in shared/src/patrol.ts). */
const INTERFACE = "PATROL_INTERFACE";
/** The Pasiphae (`PATROL_SHIPS` in shared/src/patrol.ts): it can't shoot, so a bot never takes it out. */
const PASIPHAE = "PATROL_SHIP_AA_1";

/** A scripted Pilot takes off only with this much AP (owner, 2026-11-01); a model bot whenever one sortie is affordable. */
export const SCRIPTED_PATROL_AP = 9;

const isPatrolDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("takeoff"));

/**
 * A Pilot's sortie against the hunters (owner, 2026-11-01): walk to the nearest bay, take off in a docked patrol ship,
 * shoot (Aracks first, then the weakest, never asteroids) until only the AP to land is left (or the hunters worth a
 * shot or the charges run out), then land. With only asteroids out it doesn't take off (`onlyAsteroids`). A
 * destroyed ship kills its pilot (hunters.ts), so it always keeps `landAp`; one goal is one flight. Which ships are
 * docked is seen only in the bay, so a bay with none fails the goal there and the next nearest is offered. A bot that
 * finds itself aboard (a flight carried over a cycle, or it was hurt) is offered only this goal, to finish the flight:
 * ships have no doors, so nothing else could work.
 */
export const patrolShootHunters: GoalDef = {
  id: "patrolShootHunters",
  get priority() {
    return dutyPriority("hunters", isPatrolDuty);
  },
  options(view, memory) {
    if (view.patrolShip !== null) return [sortie(view, null)];
    if (view.hunters.count === 0 || onlyAsteroids(view, memory) || !holdsTrigger(view, "hunters", isPatrolDuty)) return [];
    if (memory.scripted && view.you.ap < SCRIPTED_PATROL_AP) return [];
    const { takeoffAp, landAp } = view.config;
    const shot = view.you.resources.shoot > 0 ? 0 : view.config.patrolShotAp;
    const bay = roomsWith(view, [INTERFACE]).find((r) => !memory.ended.has(keyFor(r)) && canAfford(view, r, takeoffAp + shot + landAp, 0));
    return bay ? [sortie(view, bay)] : [];
  },
};

const keyFor = (bay: RoomId | null): string => `patrolShootHunters:${bay ?? "aboard"}`;

/** A sortie from `bay`, or (null) the rest of one already in flight. */
function sortie(view: PlayerView, bay: RoomId | null): Goal {
  // Once it has flown, being back in a bay means the sortie is over.
  let flown = bay === null;
  return {
    id: "patrolShootHunters",
    key: keyFor(bay),
    label: bay === null
      ? "Keep fighting the hunters in your patrol ship, then land" // i18n-ignore: model prompt text, not player-visible
      : `Take off in a patrol ship from the bay ${where(view, bay)}, shoot the attacking hunters, and land`, // i18n-ignore: model prompt text, not player-visible
    step(v: PlayerView, memory: BotMemory): GoalStep {
      if (v.patrolShip !== null) {
        flown = true;
        return fly(v, memory);
      }
      if (flown || bay === null || v.hunters.count === 0 || onlyAsteroids(v, memory)) return { kind: "done" };
      const walk = goTo(v, bay);
      if (walk) return walk;
      const takeoff = offered(v, "takeoff").find((o) => !o.action.equipment.endsWith(`:${PASIPHAE}`));
      if (!takeoff) return failed("no_ship");
      // Walking may have cost AP: take off only if one shot and the landing are still paid for.
      const shot = v.you.resources.shoot > 0 ? 0 : v.config.patrolShotAp;
      if (takeoff.lacks.length > 0 || v.you.ap - takeoff.cost.ap - shot < v.config.landAp) return { kind: "done" };
      return act(takeoff.action);
    },
  };
}

/**
 * Aboard: shoot (an Arack first, then the weakest, never an asteroid: `shotOrder`) while a shot still leaves the AP to
 * land; otherwise land, or wait for AP to land.
 */
function fly(v: PlayerView, memory: BotMemory): GoalStep {
  onlyAsteroids(v, memory);
  const shot = shotOrder(
    offered(v, "patrol_attack").filter((o) => o.lacks.length === 0),
    v.hunters.list,
  )[0];
  const charges = v.patrolShip?.charges ?? 0;
  if (shot && charges > 0 && v.hunters.count > 0 && v.you.ap - shot.cost.ap >= v.config.landAp) return act(shot.action);
  const land = find(v, "land");
  return land ? act(land) : { kind: "wait" };
}
