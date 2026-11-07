// Helpers for the fuel and oxygen capsule actions (take, return, load and unload fuel, take and return oxygen, check
// combustion). Each action keeps its own file: fuel and oxygen differ in too many places to share a class.

import { itemsIn, isWorking } from "../items.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/** A capsule of this item type the player carries, if any. */
export const carriedCapsule = (state: Readonly<GameState>, player: Readonly<PlayerState>, itemType: string): ItemState | undefined =>
  itemsIn(state, { kind: "player", id: player.id }).find((item) => item.type === itemType && isWorking(item));

/** The combustion chamber's level for a log line: what it holds and what it can hold. */
export const combustionLevel = (state: Readonly<GameState>) => ({ level: state.ship.combustion, max: state.config.ship.combustion.max });
