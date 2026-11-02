import type { PlayerView, RoomId } from "@mush2/shared";
import { act, canAfford, find, goTo, where } from "./blocks.ts";
import type { GoalDef } from "./types.ts";
import { isShrink } from "./work.ts";

/** The two dormitories, in the order the Shrink takes them. */
export const DORMS: readonly RoomId[] = ["BEDROOM_A", "BEDROOM_B"];

/** Today's dorm: Alpha one day, Beta the next. From the day number, so a restarted bot keeps alternating. */
export const dormFor = (view: PlayerView): RoomId => DORMS[view.day % DORMS.length]!;

/**
 * Spend the night in a dorm (owner, 2026-11-01): anyone lying in a bed with a Shrink in the room gains morale each
 * cycle (`shrink.lyingMorale`), so once a day a Shrink bot walks to a dormitory, Alpha and Beta on alternate days, and
 * stays there until the cycle ends. It lies down there if its AP isn't full and a bed is free (resting carries on from
 * there as the `rest` goal), otherwise it waits in the room. Comes after the work goals and before `rest` (a Shrink
 * works only near its AP max, `deskWorkReserve`); it may spend the AP reserve to walk there, as resting does.
 */
export const shrinkDorm: GoalDef = {
  id: "shrinkDorm",
  // duties.ts: shrink, trigger "dorm", priority 45.
  priority: 45,
  options(view, memory) {
    if (!isShrink(view) || memory.today.has("shrinkDorm")) return [];
    const dorm = dormFor(view);
    if (!canAfford(view, dorm, 0, 0)) return [];
    return [
      {
        id: "shrinkDorm",
        key: `shrinkDorm:${dorm}`,
        label: `Spend the night ${where(view, dorm)}: people resting there gain morale from you`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          const walk = goTo(v, dorm);
          if (walk) return walk;
          if (v.you.lyingIn === undefined && v.you.ap < v.maxAp) {
            const bed = find(v, "lie_down");
            if (bed) return act(bed);
          }
          m.today.add("shrinkDorm");
          return { kind: "wait" };
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
