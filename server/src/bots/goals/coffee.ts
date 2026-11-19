import { DEFAULT_CONFIG, ITEM_TYPES, type Action, type CharacterId, type PlayerView, type RoomId } from "@mush2/shared";
import { parseItemLine } from "../itemShare.ts";
import { act, failed, find, goTo, nearest, roomsWith, where } from "./blocks.ts";
import type { BotMemory, GoalDef, GoalStep } from "./types.ts";

// The coffee relay (owner, 2026-11-18). Gioele, a Caffeine Junkie (2 more AP a coffee), lives on coffee instead of
// rations: a coffee a day restarts his hunger count, since its 1 satiety is gone by the next cycle. Any other bot in the
// refectory pulls the coffee from the machine and leaves it in the Center Corridor; the `Item: coffee in <ROOM>` line
// (itemShare.ts) is the report. Gioele drinks a coffee reported today when he passes through its room, and in the last
// cycle of the day goes for one himself: the reported one, or the machine's if nobody pulled it. Coffee spoils at the
// day change (spoilage.ts), and only a Chef can see how far, so he doesn't drink one that wasn't reported today. While he
// is alive, the other bots don't drink coffee.

/** Who the coffee is for (owner, 2026-11-18: hard-coded rather than learned from his skills, which only his room sees). */
export const COFFEE_DRINKER: CharacterId = "gioele";
/** Where the crew leave it (owner, 2026-11-18). */
export const COFFEE_DROP_ROOM: RoomId = "CORRIDOR_B";
/** Carrying a coffee to the Center Corridor, and Gioele's end-of-day trip: just above astro (76), his job. */
export const COFFEE_PRIORITY = 76.5;

const COFFEE = "coffee";
const DISPENSER = "COFFEE_DISPENSER";
/** `BotMemory.today` key: Gioele drank a coffee today. */
const DRUNK = "coffee:drunk";

export const isDrinker = (view: PlayerView): boolean => view.you.character === COFFEE_DRINKER;

/** Whether the coffee is kept for Gioele: he is alive and this bot isn't him. */
export const coffeeReserved = (view: PlayerView): boolean =>
  !isDrinker(view) && view.players.some((p) => p.character === COFFEE_DRINKER && p.alive);

const carriedCoffee = (view: PlayerView) => view.inventory.filter((i) => i.type === COFFEE);

/** Rooms a present `Item: coffee in <ROOM>` line names today, unless a later line today says it's gone. */
export function coffeeReportedToday(view: PlayerView): Set<RoomId> {
  const rooms = new Set<RoomId>();
  const dayStart = view.cycle - (view.cycleOfDay - 1);
  for (const line of view.chat) {
    if (line.system || line.channel !== "global" || line.cycle < dayStart) continue;
    const report = parseItemLine(line.text);
    if (report?.type !== COFFEE) continue;
    if (report.present) rooms.add(report.room);
    else rooms.delete(report.room);
  }
  return rooms;
}

/** Drinking a coffee Gioele carries, or one on the floor here that was reported today. */
function drinkHere(view: PlayerView): Action | undefined {
  const fresh = coffeeReportedToday(view).has(view.you.room);
  const ids = new Set([...carriedCoffee(view), ...(fresh ? view.roomItems.filter((i) => i.type === COFFEE) : [])].map((i) => i.id));
  return find(view, "consume", (a) => ids.has(a.item));
}

const dispenseCoffee = (view: PlayerView): Action | undefined => find(view, "dispense");

/** AP a coffee gives Gioele, so passing through doesn't waste it above the cap (the skill's bonus from the public base config). */
const coffeeAp = (view: PlayerView): number => (ITEM_TYPES[COFFEE]?.consume?.ap ?? 0) + (view.you.skills.includes("caffeinomaniac") ? DEFAULT_CONFIG.caffeinomaniac.ap : 0);

/**
 * A free reflex taken in passing, without dropping the goal being followed (like reporting a fire): Gioele pulls a coffee
 * at the machine and drinks it, or drinks one reported today where he stands, when the AP fits under his cap; any other
 * bot pulls the machine's coffee for him. Notes the drink in `memory.today`.
 */
export function coffeeReflex(view: PlayerView, memory: BotMemory): Action | null {
  if (isDrinker(view)) {
    if (view.statuses.includes("full_belly") || view.you.ap + coffeeAp(view) > view.maxAp) return null;
    const drink = drinkHere(view);
    if (drink) {
      memory.today.add(DRUNK);
      return drink;
    }
    return carriedCoffee(view).length === 0 ? (dispenseCoffee(view) ?? null) : null;
  }
  if (!coffeeReserved(view) || carriedCoffee(view).length > 0) return null;
  return dispenseCoffee(view) ?? null;
}

/** Any bot but Gioele carries a coffee it holds to the Center Corridor and leaves it there while he is alive. */
export const deliverCoffee: GoalDef = {
  id: "deliverCoffee",
  priority: COFFEE_PRIORITY,
  options(view) {
    if (!coffeeReserved(view) || carriedCoffee(view).length === 0) return [];
    return [
      {
        id: "deliverCoffee",
        key: "deliverCoffee",
        label: `Leave the coffee you carry for Gioele ${where(view, COFFEE_DROP_ROOM)}`, // i18n-ignore: model prompt text, not player-visible
        step(v) {
          const coffee = carriedCoffee(v)[0];
          if (!coffee || !coffeeReserved(v)) return { kind: "done" };
          const walk = goTo(v, COFFEE_DROP_ROOM);
          if (walk) return walk;
          const drop = find(v, "drop", (a) => a.item === coffee.id);
          return drop ? act(drop) : failed("cant_drop");
        },
      },
    ];
  },
};

/**
 * Gioele in the last cycle of the day, with no coffee drunk today: walks to the nearest coffee reported today and
 * drinks it, or to the machine to pull one if nobody reported one. Drinks even above his AP cap: it would spoil anyway.
 */
export const coffeeRun: GoalDef = {
  id: "coffeeRun",
  priority: COFFEE_PRIORITY,
  options(view, memory) {
    if (!isDrinker(view) || memory.today.has(DRUNK) || view.statuses.includes("full_belly")) return [];
    if (view.cycleOfDay !== view.config.cyclesPerDay) return [];
    const reported = [...coffeeReportedToday(view)];
    const room = nearest(view, reported.length > 0 ? reported : roomsWith(view, [DISPENSER])).find((r) => !memory.ended.has(`coffeeRun:${r}`));
    if (!room) return [];
    return [
      {
        id: "coffeeRun",
        key: `coffeeRun:${room}`,
        label: `Drink a coffee ${where(view, room)}`, // i18n-ignore: model prompt text, not player-visible
        step: (v, m) => coffeeStep(v, m, room),
      },
    ];
  },
};

function coffeeStep(view: PlayerView, memory: BotMemory, room: RoomId): GoalStep {
  if (memory.today.has(DRUNK)) return { kind: "done" };
  const drink = drinkHere(view);
  if (drink) {
    memory.today.add(DRUNK);
    return act(drink);
  }
  const walk = goTo(view, room);
  if (walk) return walk;
  const pull = dispenseCoffee(view);
  return pull ? act(pull) : failed("no_coffee");
}
