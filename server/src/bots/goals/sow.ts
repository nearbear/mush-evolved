import { ITEM_TYPES, TREE_POT_ITEM, type ActionOption, type ItemView, type PlayerView } from "@mush2/shared";
import { act } from "./blocks.ts";
import type { GoalDef, GoalStep } from "./types.ts";

/**
 * Where a scripted bot puts sowing among its goals (owner, 2026-11-12: sowing is high priority): just above eating (80).
 * A Hungry bot isn't offered it, so it may eat the banana instead.
 */
export const SOW_PRIORITY = 81;

export const isEmptyPot = (i: ItemView): boolean => i.type === TREE_POT_ITEM && !i.plant;
export const isFruitItem = (i: ItemView): boolean => !!ITEM_TYPES[i.type]?.fruit;

/**
 * Empty hydropots on the garden floor, when the bot stands in the garden. Bots sow only there (the pots they set out,
 * `setOutPots`), never into a pot they carry or one elsewhere, where nobody would water it.
 */
export const emptyGardenPots = (view: PlayerView): ItemView[] =>
  view.you.room === view.config.gardenRoom ? view.roomItems.filter(isEmptyPot) : [];

/** Whether an offered action can be paid while keeping the AP reserve. */
export const payable = (view: PlayerView, o: ActionOption, reserve: number): boolean => o.lacks.length === 0 && view.you.ap - o.cost.ap >= reserve;

/**
 * The next sowing step here (owner, 2026-11-12; updated 2026-11-14): sow any reachable fruit (carried or on the floor)
 * into an empty garden floor pot. Garden points pay in the garden.
 */
export function sowJob(view: PlayerView, reserve: number): GoalStep | null {
  if (emptyGardenPots(view).length === 0) return null;
  const sow = view.actions.find((o) => o.action.type === "sow" && payable(view, o, reserve));
  return sow ? act(sow.action) : null;
}

/**
 * Sow (owner, 2026-11-12): any bot standing in the garden with an empty pot there and a banana it carries or sees on
 * the floor sows it, ahead of eating and other work. A Hungry bot may eat that banana instead (`eat`); one that isn't
 * Hungry leaves it for sowing.
 */
export const sowHere: GoalDef = {
  id: "sowHere",
  priority: SOW_PRIORITY,
  options(view, memory) {
    if (view.statuses.includes("hungry") || !sowJob(view, memory.reserve)) return [];
    return [
      {
        id: "sowHere",
        key: "sowHere",
        label: "Sow a banana in an empty hydropot here", // i18n-ignore: model prompt text, not player-visible
        step: (v, m) => sowJob(v, m.reserve) ?? { kind: "done" },
      },
    ];
  },
};
