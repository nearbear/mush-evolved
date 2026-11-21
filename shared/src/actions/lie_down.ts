import { leaveTerminal } from "../spot.ts";
import { Action, isString } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LieDownActionData = { type: "lie_down"; equipment: string };
export type GetUpActionData = { type: "get_up" };

/**
 * Lie down in a bed (confirmed 2026-10-17): free, and adds the `lying_down` modifier (+1 AP per cycle). Any other
 * timed action removes it (performAction), as does get_up. `get_up` exists so you don't leave bed by accident (owner, 2026-10-18).
 * One person per bed (owner, 2026-10-24). Which bed you lie in (`lyingIn`) is public to the room (owner, 2026-10-18).
 */
/** A bed holds one living person at a time (owner, 2026-10-24). */
function occupied(state: Readonly<GameState>, bed: string): boolean {
  return state.players.some((p) => p.alive && p.lyingIn === bed);
}

/** Stiff Neck keeps you out of bed (owner, 2026-11-20; modifiers/stiff_neck_injury.ts). */
function stiffNeck(player: Readonly<PlayerState>): boolean {
  return player.modifiers.includes("stiff_neck_injury");
}

export class LieDownAction extends Action<LieDownActionData> {
  constructor() {
    super("lie_down", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LieDownActionData[] {
    if (stiffNeck(player)) return [];
    return (state.equipment[player.room] ?? []).filter((eq) => EQUIPMENT_TYPES[eq.type]?.bed && !occupied(state, eq.id)).map((eq) => ({ type: "lie_down", equipment: eq.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LieDownActionData): string | null {
    const equip = state.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.bed) return "cant_lie_down";
    if (player.modifiers.includes("lying_down")) return "already_lying_down";
    if (stiffNeck(player)) return "stiff_neck";
    if (occupied(state, equip.id)) return "bed_occupied";
    return null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.lieDown.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: LieDownActionData): void {
    player.modifiers.push("lying_down");
    player.lyingIn = target.equipment;
    player.lyingSince = state.cycle;
    leaveTerminal(player);
  }
}

// getUp lives in bed.ts, free of imports, so modifiers (Stiff Neck) can call it without an import cycle.
export { getUp } from "../bed.ts";

export class GetUpAction extends Action<GetUpActionData> {
  constructor() {
    super("get_up");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): GetUpActionData[] {
    return player.modifiers.includes("lying_down") ? [{ type: "get_up" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return player.modifiers.includes("lying_down") ? null : "not_lying_down";
  }

  // No apply: performAction has already removed the modifier.
}
