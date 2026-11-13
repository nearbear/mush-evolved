import type { PlayerView, RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, goTo, where } from "./blocks.ts";
import { isEmptyPot, sowJob } from "./sow.ts";
import { isBotanist } from "./tendPlants.ts";
import type { BotMemory, GoalDef, GoalStep } from "./types.ts";

/** Where the ship starts with spare empty hydropots (`startItems`; the start layout is the same in every game). */
export const POT_STORAGE: RoomId = "STORAGE_FRONT";

/** The `memory.once` key for having checked the storage for pots. */
export const STORAGE_CHECKED = `setOutPots:${POT_STORAGE}`;

const carriesEmptyPot = (view: PlayerView): boolean => view.inventory.some(isEmptyPot);

/**
 * The next step: carried empty pots go to the garden floor, then the storage's pots are fetched, once a game. In the
 * garden a banana is sown as soon as a slot is free for it (`sowJob`), ahead of the rest of the errand.
 */
function potStep(view: PlayerView, memory: BotMemory): GoalStep | null {
  const garden = view.config.gardenRoom;
  const once = memory.once;
  const sow = view.statuses.includes("hungry") ? null : sowJob(view, memory.reserve);
  if (sow) return sow;
  // In the storage, take every empty pot there before carrying them off.
  if (view.you.room === POT_STORAGE && !once.has(STORAGE_CHECKED)) {
    for (const pot of view.roomItems.filter(isEmptyPot)) {
      const take = view.actions.find((o) => o.action.type === "take" && o.action.item === pot.id && o.lacks.length === 0);
      if (take) return act(take.action);
    }
    // None left, or no free slot: done with the storage either way. What was taken goes to the garden next.
    once.add(STORAGE_CHECKED);
  }
  if (carriesEmptyPot(view)) {
    const walk = goTo(view, garden);
    if (walk) return walk;
    const pot = view.inventory.find(isEmptyPot)!;
    const drop = view.actions.find((o) => o.action.type === "drop" && o.action.item === pot.id && o.lacks.length === 0);
    return drop ? act(drop.action) : { kind: "failed", reason: "cant_drop" };
  }
  if (once.has(STORAGE_CHECKED)) return null;
  return goTo(view, POT_STORAGE) ?? potStep(view, memory);
}

/**
 * Set out the hydropots (owner, 2026-11-12): early, once a game, a Botanist-role or Green Thumb bot carries the empty
 * pots it holds (Green Thumb's two) to the garden and drops them there, then fetches the empty pots from Front Storage
 * and drops those too, so there are pots for `sowHere`. Taking and dropping cost no AP; the walks keep the reserve.
 */
export const setOutPots: GoalDef = {
  id: "setOutPots",
  get priority() {
    return dutyPriority("pots");
  },
  options(view, memory) {
    if (!isBotanist(view) && !holdsTrigger(view, "pots")) return [];
    const carried = carriesEmptyPot(view);
    if (!carried && memory.once.has(STORAGE_CHECKED)) return [];
    const target = carried ? view.config.gardenRoom : POT_STORAGE;
    if (!canAfford(view, target, 0, memory.reserve)) return [];
    const label = carried
      ? `Set out the empty hydropots you carry ${where(view, target)}` // i18n-ignore: model prompt text, not player-visible
      : `Fetch the empty hydropots ${where(view, target)} and set them out in the garden`; // i18n-ignore: model prompt text, not player-visible
    return [{ id: "setOutPots", key: "setOutPots", label, step: (v, m) => potStep(v, m) ?? { kind: "done" } }];
  },
};
