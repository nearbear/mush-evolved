import type { PlayerView, RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, failed, goTo, offered, roomsWith, where } from "./blocks.ts";
import { onlyAsteroids, shotOrder } from "./hunterTargets.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/** The turret console (`TURRET_EQUIPMENT` in shared/src/hunters.ts). */
const TURRET = "TURRET_COMMAND";

/** A scripted bot is offered the turrets only with this much AP (owner, 2026-11-01: "above 4"); a model bot whenever it can afford a shot. */
export const SCRIPTED_SHOOT_AP = 5;

const isTurretDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("turret_attack"));

/**
 * While hunters attack (`view.hunters.count`, public), a Shooter or Gunner (`BOT_DUTIES`, owner 2026-11-01) walks to
 * the nearest turret room and shoots them down (turret_attack.ts): Aracks first, then the weakest, never asteroids
 * (`shotOrder`); with only asteroids left it stops (`onlyAsteroids`). Once
 * there, it spends all its AP, the reserve included (owner, 2026-11-01); a Shoot point (Shooter) makes a shot free, so
 * it keeps shooting while it has them. Which turrets have charges is only seen inside a turret room, so a turret room
 * with none left fails the goal there and the next nearest is offered.
 */
export const shootHunters: GoalDef = {
  id: "shootHunters",
  get priority() {
    return dutyPriority("hunters", isTurretDuty);
  },
  options(view, memory) {
    if (view.hunters.count === 0 || onlyAsteroids(view, memory) || !holdsTrigger(view, "hunters", isTurretDuty) || (memory.scripted && view.you.ap < SCRIPTED_SHOOT_AP)) return [];
    const cost = view.you.resources.shoot > 0 ? 0 : view.config.turretAp;
    const room = roomsWith(view, [TURRET]).find((r) => !memory.ended.has(keyFor(r)) && canAfford(view, r, cost, 0));
    return room ? [shootFrom(view, room)] : [];
  },
};

const keyFor = (room: RoomId): string => `shootHunters:${room}`;

function shootFrom(view: PlayerView, room: RoomId): Goal {
  return {
    id: "shootHunters",
    key: keyFor(room),
    label: `Shoot the attacking hunters from the turret ${where(view, room)}`, // i18n-ignore: model prompt text, not player-visible
    step(v: PlayerView, memory: BotMemory): GoalStep {
      if (v.hunters.count === 0 || onlyAsteroids(v, memory)) return { kind: "done" };
      const walk = goTo(v, room);
      if (walk) return walk;
      const charged = v.hunters.turrets ?? {};
      const shots = offered(v, "turret_attack").filter((o) => (charged[o.action.equipment] ?? 0) > 0);
      if (shots.length === 0) return failed("no_charges");
      const shot = shotOrder(shots, v.hunters.list)[0];
      if (!shot) return { kind: "done" };
      if (shot.lacks.length > 0) return { kind: "done" };
      return act(shot.action);
    },
  };
}
