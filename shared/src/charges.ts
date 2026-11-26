// Item charges: what each type starts with, and what refills them.

import { type ItemTypeId, LUNCHBOX_ITEM, MICROWAVE_ITEM } from "./itemIds.ts";
import type { DeepReadonly, GameConfig, GameState } from "./types.ts";

/** The charges an item of this type starts with, or undefined if it has none. Charged weapons start full. */
export function startCharges(config: DeepReadonly<GameConfig>, type: ItemTypeId): number | undefined {
  if (type === MICROWAVE_ITEM) return config.expressCook.charges.start;
  if (type === LUNCHBOX_ITEM) return config.lunchbox.charges;
  if (type === "scooter") return config.scooter.charges.start;
  return config.weapons.types[type]?.charges;
}

/** Each microwave regains `expressCook.charges.perDay`, up to the max. Mutates a state the caller already cloned. */
export function rechargeMicrowaves(state: GameState): void {
  const { max, perDay } = state.config.expressCook.charges;
  for (const item of state.items) if (item.type === MICROWAVE_ITEM) item.charges = Math.min(max, (item.charges ?? 0) + perDay);
}

/** Each Antigrav Scooter regains `scooter.charges.perCycle`, up to the max. Mutates a state the caller already cloned. */
export function rechargeScooters(state: GameState): void {
  const { max, perCycle } = state.config.scooter.charges;
  for (const item of state.items) if (item.type === "scooter") item.charges = Math.min(max, (item.charges ?? 0) + perCycle);
}
