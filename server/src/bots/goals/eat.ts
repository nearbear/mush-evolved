import { ITEM_TYPES, type PlayerView } from "@mush2/shared";
import { act, canAfford, failed, find, goTo, itemType, roomsWith, where } from "./blocks.ts";
import type { Goal, GoalDef } from "./types.ts";

/** Something to eat the bot can reach now: a consume option on an item that gives satiety. */
const food = (view: PlayerView) => find(view, "consume", (a) => (ITEM_TYPES[itemType(view, a.item) ?? ""]?.consume?.satiety ?? 0) > 0);

/**
 * Eat when hungry: food the bot carries or sees in its room, or else a coffee from the nearest dispenser. The dispenser
 * gives one coffee per cycle ship-wide (dispense.ts), so a bot that finds it empty fails and doesn't retry this cycle.
 * Eating may spend the AP reserve. Food in other rooms isn't known (a view shows only the bot's own room's items).
 */
export const eat: GoalDef = {
  id: "eat",
  priority: 80,
  options(view) {
    if (!view.statuses.includes("hungry")) return [];
    if (food(view)) return [eatAt(view.you.room, "Eat food you carry or that is here")];
    const room = roomsWith(view, ["COFFEE_DISPENSER"]).find((r) => canAfford(view, r, 0, 0));
    return room ? [eatAt(room, `Eat: get a coffee from the dispenser ${where(view, room)}`)] : [];
  },
};

function eatAt(room: string, label: string): Goal {
  let ate = false;
  let dispensed = false;
  return {
    id: "eat",
    key: `eat:${room}`,
    label,
    step(view) {
      if (ate) return { kind: "done" };
      const meal = food(view);
      if (meal) {
        ate = true;
        return act(meal);
      }
      const walk = goTo(view, room);
      if (walk) return walk;
      const dispense = !dispensed && find(view, "dispense");
      if (!dispense) return failed("no_food");
      dispensed = true;
      return act(dispense);
    },
  };
}
