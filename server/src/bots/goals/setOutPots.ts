import { DEFAULT_CONFIG, TREE_POT_ITEM, type PlayerView, type RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { roomsHolding } from "../itemShare.ts";
import { act, canAfford, goTo, nearest, where } from "./blocks.ts";
import { isEmptyPot, sowJob } from "./sow.ts";
import { isBotanist } from "./tendPlants.ts";
import type { BotMemory, GoalDef, GoalStep } from "./types.ts";

/** Storage rooms where spare empty hydropots may spawn at the start (`startItems` storage pool). */
export const POT_STORAGES: readonly RoomId[] = DEFAULT_CONFIG.merchants.storageRooms;

/** The `memory.once` key for having checked a storage room for pots. */
export const storageCheckedKey = (room: RoomId): string => `setOutPots:${room}`;

const carriesEmptyPot = (view: PlayerView): boolean => view.inventory.some(isEmptyPot);

/** Next room to check for empty hydropots: a known non-garden room from `itemShare` first, else the nearest unchecked storage. */
function nextPotRoom(view: PlayerView, memory: BotMemory): RoomId | undefined {
  const garden = view.config.gardenRoom;
  const known = nearest(
    view,
    roomsHolding(memory, TREE_POT_ITEM).filter((r) => r !== garden),
  ).find((r) => canAfford(view, r, 0, memory.reserve, memory));
  if (known) return known;
  return nearest(
    view,
    POT_STORAGES.filter((r) => !memory.once.has(storageCheckedKey(r))),
  ).find((r) => canAfford(view, r, 0, memory.reserve, memory));
}

/**
 * The next step: carried empty pots go to the garden floor, then any known non-garden room or unchecked storage's pots
 * are fetched, once a game per storage. In the garden a banana is sown as soon as a slot is free for it (`sowJob`),
 * ahead of the rest of the errand.
 */
function potStep(view: PlayerView, memory: BotMemory): GoalStep | null {
  const garden = view.config.gardenRoom;
  const once = memory.once;
  const sow = view.statuses.includes("hungry") ? null : sowJob(view, memory.reserve);
  if (sow) return sow;
  const room = view.you.room;
  // In a storage or a room reported to hold empty pots (outside the garden), take every empty pot there.
  if (room !== garden && (POT_STORAGES.includes(room) || roomsHolding(memory, TREE_POT_ITEM).includes(room))) {
    const emptyPots = view.roomItems.filter(isEmptyPot);
    for (const pot of emptyPots) {
      const take = view.actions.find((o) => o.action.type === "take" && o.action.item === pot.id && o.lacks.length === 0);
      if (take) return act(take.action);
    }
    if (emptyPots.length === 0 && POT_STORAGES.includes(room)) once.add(storageCheckedKey(room));
    // If empty pots remain here and none can be taken (inventory full of other items), drop them off if carrying any, else fail this cycle.
    if (emptyPots.length > 0 && !carriesEmptyPot(view)) return { kind: "failed", reason: "inventory_full" };
  }
  if (carriesEmptyPot(view)) {
    const walk = goTo(view, garden);
    if (walk) return walk;
    const pot = view.inventory.find(isEmptyPot)!;
    const drop = view.actions.find((o) => o.action.type === "drop" && o.action.item === pot.id && o.lacks.length === 0);
    return drop ? act(drop.action) : { kind: "failed", reason: "cant_drop" };
  }
  const target = nextPotRoom(view, memory);
  if (!target || target === room) return null;
  return goTo(view, target) ?? potStep(view, memory);
}

/**
 * Set out the hydropots (owner, 2026-11-12): early, once a game, a Botanist-role or Green Thumb bot carries the empty
 * pots it holds (Green Thumb's two) to the garden and drops them there, then fetches any empty pots from known rooms
 * or the ship's storages and drops those too, so there are pots for `sowHere`. Taking and dropping cost no AP; the
 * walks keep the reserve.
 */
export const setOutPots: GoalDef = {
  id: "setOutPots",
  get priority() {
    return dutyPriority("pots");
  },
  options(view, memory) {
    if (!isBotanist(view) && !holdsTrigger(view, "pots")) return [];
    const carried = carriesEmptyPot(view);
    const target = carried ? view.config.gardenRoom : nextPotRoom(view, memory);
    if (!target || !canAfford(view, target, 0, memory.reserve, memory)) return [];
    const label = carried
      ? `Set out the empty hydropots you carry ${where(view, target)}` // i18n-ignore: model prompt text, not player-visible
      : `Fetch the empty hydropots ${where(view, target)} and set them out in the garden`; // i18n-ignore: model prompt text, not player-visible
    return [{ id: "setOutPots", key: "setOutPots", label, step: (v, m) => potStep(v, m) ?? { kind: "done" } }];
  },
};
