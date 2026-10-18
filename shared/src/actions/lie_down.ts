import { Action } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LieDownActionData = { type: "lie_down"; equipment: string };
export type GetUpActionData = { type: "get_up" };

/**
 * Lie down in a bed (confirmed 2026-10-17): free, and adds the `lying_down` modifier (+1 AP per cycle). Any other
 * timed action removes it (performAction), as does get_up. Moving to another room is one of those actions.
 */
export class LieDownAction extends Action<LieDownActionData> {
  constructor() {
    super("lie_down");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LieDownActionData[] {
    return (state.config.equipment[player.room] ?? []).filter((eq) => EQUIPMENT_TYPES[eq.type]?.bed).map((eq) => ({ type: "lie_down", equipment: eq.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LieDownActionData): string | null {
    const equip = state.config.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.bed) return "cant_lie_down";
    if (player.modifiers.includes("lying_down")) return "already_lying_down";
    return this.canAfford(state, player, target);
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.lieDown.cost.ap, mp: 0 };
  }

  override apply(_state: GameState, player: PlayerState): void {
    player.modifiers.push("lying_down");
  }
}

export class GetUpAction extends Action<GetUpActionData> {
  constructor() {
    super("get_up");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): GetUpActionData[] {
    return player.modifiers.includes("lying_down") ? [{ type: "get_up" }] : [];
  }

  override check(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return player.modifiers.includes("lying_down") ? null : "not_lying_down";
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  // performAction has already removed the modifier.
  override apply(): void {}
}
