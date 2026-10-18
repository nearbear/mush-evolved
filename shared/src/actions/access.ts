import { Action } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import type { GameState, PlayerState } from "../types.ts";

export type AccessActionData = { type: "access"; equipment: string };

/**
 * Access a terminal in your room (2026-10-16). Free, no restrictions yet, and it changes no state: the
 * client opens the terminal's window when the action goes through. The terminal's own actions come later.
 */
export class AccessAction extends Action<AccessActionData> {
  // Only opens the terminal's window, which the client does at once; the terminal's own actions are timed.
  override timed = false;

  constructor() {
    super("access");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AccessActionData[] {
    return (state.config.equipment[player.room] ?? []).filter((equipment) => EQUIPMENT_TYPES[equipment.type]?.terminal).map((equipment) => ({ type: "access", equipment: equipment.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AccessActionData): string | null {
    const equip = state.config.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    return equip && EQUIPMENT_TYPES[equip.type]?.terminal ? null : "cant_access";
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override apply(): void {}
}
