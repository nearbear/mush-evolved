import { ITEM_TYPES, type ActionOption, type PlayerView, type RoomId } from "@mush2/shared";
import { act, canAfford, failed, goTo, itemType, nearest, roomsWith, where } from "./blocks.ts";
import { coffeeReserved } from "./coffee.ts";
import { emptyGardenPots } from "./sow.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Cycles at 0 satiety after which a bot goes for food (owner, 2026-11-01), ahead of Hungry at 24 (`hungryAfterCycles`),
 * which costs HP. Read from the bot's own satiety counter, the one hunger uses (`satiety`, `satietyZeroSince`).
 */
export const BOT_EAT_AFTER_CYCLES = 16;

/** Whether the bot should go for food: Hungry already, or 16 cycles at 0 satiety. Never while full. */
export function needsFood(view: PlayerView): boolean {
  if (view.statuses.includes("full_belly")) return false;
  if (view.statuses.includes("hungry")) return true;
  const since = view.you.satietyZeroSince;
  return view.you.satiety === 0 && since !== null && view.cycle - since >= BOT_EAT_AFTER_CYCLES;
}

const consumeOf = (view: PlayerView, o: ActionOption) => (o.action.type === "consume" ? ITEM_TYPES[itemType(view, o.action.item) ?? ""]?.consume : undefined);

/**
 * Whether a banana (any fruit) here is kept for sowing (owner, 2026-11-12): while an empty hydropot is on the garden
 * floor, a bot that isn't Hungry leaves fruit uneaten so it can be sown (`sowHere`).
 */
const keepFruit = (view: PlayerView): boolean => !view.statuses.includes("hungry") && emptyGardenPots(view).length > 0;

/**
 * The best food the bot can eat now (carried or in its room): the most satiety first, so a ration before a banana or a
 * coffee, and a cooked ration before an uncooked one. Not fruit kept for sowing (`keepFruit`), nor coffee kept for Gioele.
 */
function bestFood(view: PlayerView): (ActionOption & { action: { type: "consume"; item: string } }) | undefined {
  const uncooked = (o: ActionOption) => (o.action.type === "consume" && ITEM_TYPES[itemType(view, o.action.item) ?? ""]?.cook ? 1 : 0);
  return view.actions
    .filter((o): o is ActionOption & { action: { type: "consume"; item: string } } => o.lacks.length === 0 && (consumeOf(view, o)?.satiety ?? 0) > 0)
    .filter((o) => !(keepFruit(view) && ITEM_TYPES[itemType(view, o.action.item) ?? ""]?.fruit))
    // Coffee is kept for Gioele while he is alive (owner, 2026-11-18; coffee.ts).
    .filter((o) => !(coffeeReserved(view) && itemType(view, o.action.item) === "coffee"))
    .sort((a, b) => consumeOf(view, b)!.satiety - consumeOf(view, a)!.satiety || uncooked(a) - uncooked(b))[0];
}

/**
 * Eat the best food at hand. An uncooked ration is cooked first (1 AP, in the refectory) when that keeps the AP
 * reserve (owner, 2026-11-01), since eating it raw costs 1 morale; otherwise it is eaten raw.
 */
function meal(view: PlayerView, memory: BotMemory): GoalStep | null {
  const food = bestFood(view);
  if (!food) return null;
  const cook = view.actions.find((o) => o.action.type === "cook" && o.action.item === food.action.item && o.lacks.length === 0);
  if (cook && view.you.ap - cook.cost.ap >= memory.reserve) return act(cook.action);
  return act(food.action);
}

/**
 * Eat when the bot's satiety has been 0 for `BOT_EAT_AFTER_CYCLES` cycles, or it is Hungry: food it carries or sees in
 * its room, else the nearest place food is kept, from the fixed ship map. That is the refectory (rations, cooked there,
 * and the coffee dispenser) or the garden (bananas). What is there is learned only on arrival; a place with nothing
 * fails, and the next one is offered. The dispenser gives one coffee per cycle ship-wide (dispense.ts). Eating may
 * spend the AP reserve; cooking doesn't.
 */
export const eat: GoalDef = {
  id: "eat",
  priority: 80,
  options(view, memory) {
    if (!needsFood(view)) return [];
    if (bestFood(view)) return [eatAt(view.you.room, "Eat food you carry or that is here")];
    const kitchens = roomsWith(view, ["KITCHEN", "COFFEE_DISPENSER"]);
    const places = nearest(view, [...new Set([...kitchens, view.config.gardenRoom])]);
    const room = places.find((r) => !memory.ended.has(`eat:${r}`) && canAfford(view, r, 0, 0, memory));
    if (!room) return [];
    const what = room === view.config.gardenRoom ? "a banana from the garden" : "a ration or a coffee";
    return [eatAt(room, `Eat: get ${what} ${where(view, room)}`)];
  },
};

function eatAt(room: RoomId, label: string): Goal {
  let ate = false;
  let dispensed = false;
  return {
    id: "eat",
    key: `eat:${room}`,
    label,
    step(view, memory) {
      if (ate) return { kind: "done" };
      const step = meal(view, memory);
      if (step) {
        if (step.kind === "act" && step.action.type === "consume") ate = true;
        return step;
      }
      const walk = goTo(view, room);
      if (walk) return walk;
      const dispense = !dispensed && !coffeeReserved(view) && view.actions.find((o) => o.action.type === "dispense" && o.lacks.length === 0);
      if (!dispense) return failed("no_food");
      dispensed = true;
      return act(dispense.action);
    },
  };
}
