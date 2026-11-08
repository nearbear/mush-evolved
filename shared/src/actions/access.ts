import { Action, isString } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { occupy } from "../spot.ts";
import type { GameState, PlayerState } from "../types.ts";

export type AccessActionData = { type: "access"; equipment: string };

/**
 * Access a terminal in your room (2026-10-16). Free, no restrictions yet, and it changes no state: the
 * client opens the terminal's window when the action goes through. The terminal's own actions come later.
 */
export class AccessAction extends Action<AccessActionData> {
  // Only opens the terminal's window, which the client does at once; the terminal's own actions are timed.
  override timed = false;

  // Left out of the action history (owner, 2026-10-24).
  override recorded = false;

  constructor() {
    super("access", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AccessActionData[] {
    return (state.equipment[player.room] ?? []).filter((equipment) => EQUIPMENT_TYPES[equipment.type]?.terminal).map((equipment) => ({ type: "access", equipment: equipment.id }));
  }

  // Sits you at it, on a free chair if there is one, until you close its window (#192, spot.ts).
  override apply(next: GameState, player: PlayerState, target: AccessActionData): void {
    occupy(next, player, target.equipment);
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AccessActionData): string | null {
    const equip = state.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    return equip && EQUIPMENT_TYPES[equip.type]?.terminal ? null : "cant_access";
  }
}
