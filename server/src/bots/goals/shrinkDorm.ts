import type { PlayerView, RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { canAfford, goTo, where } from "./blocks.ts";
import { shrinkSettler } from "./rest.ts";
import type { GoalDef } from "./types.ts";

/** The two dormitories, in the order the Shrink takes them. */
export const DORMS: readonly RoomId[] = ["BEDROOM_A", "BEDROOM_B"];

/** Today's dorm: Alpha one day, Beta the next. From the day number, so a restarted bot keeps alternating. */
export const dormFor = (view: PlayerView): RoomId => DORMS[view.day % DORMS.length]!;

/**
 * Spend the night in a dorm (owner, 2026-11-01): anyone lying in a bed with a Shrink in the room gains morale each
 * cycle (`shrink.lyingMorale`), so once a day a Shrink bot walks to a dormitory, Alpha and Beta on alternate days, and
 * stays there until the cycle ends. It says where it is and takes a bed only if one is free with nobody there asking,
 * getting up for anyone who asks (Run A4, `shrinkSettler`; this changes #452's "never lies down"). Comes after the work goals and before `rest` (a Shrink
 * works only near its AP max, `deskWorkReserve`); it may spend the AP reserve to walk there, as resting does.
 */
export const shrinkDorm: GoalDef = {
  id: "shrinkDorm",
  get priority() {
    return dutyPriority("dorm");
  },
  options(view, memory) {
    if (!holdsTrigger(view, "dorm") || memory.today.has("shrinkDorm")) return [];
    const dorm = dormFor(view);
    if (!canAfford(view, dorm, 0, 0, memory)) return [];
    const settle = shrinkSettler();
    return [
      {
        id: "shrinkDorm",
        key: `shrinkDorm:${dorm}`,
        label: `Spend the night ${where(view, dorm)}: people resting there gain morale from you`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          const walk = goTo(v, dorm);
          if (walk) return walk;
          m.today.add("shrinkDorm");
          return settle(v, m);
        },
        keepAcrossCycle(v, m, newDay, goals) {
          if (newDay || v.you.room !== dorm) return false;
          return !goals.some((def) => def.priority > shrinkDorm.priority && def.options(v, m).length > 0);
        },
        onInterrupt(m) {
          m.today.delete("shrinkDorm");
        },
      },
    ];
  },
};
