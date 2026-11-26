import { Action, type ActionVisibility, isString } from "./action.ts";
import { carriedCapsule } from "./capsule.ts";
import { equipmentHere } from "../equipment.ts";
import { FUEL_CAPSULE_ITEM } from "../itemIds.ts";
import { removeItem } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReturnFuelActionData = { type: "return_fuel"; equipment: string };

/**
 * Put a carried fuel capsule back into a fuel tank (owner, 2026-10-23): the way to get rid of one, since capsules
 * can't be dropped. 0 AP, a dirt chance and a secret log line, like taking one. It gives the tanks their fuel back.
 */
export class ReturnFuelAction extends Action<ReturnFuelActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("return_fuel", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReturnFuelActionData[] {
    if (!carriedCapsule(state, player, FUEL_CAPSULE_ITEM)) return [];
    return equipmentHere(state, player, "FUEL_TANK").map((tank): ReturnFuelActionData => ({ type: "return_fuel", equipment: tank.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReturnFuelActionData): string | null {
    if (!equipmentHere(state, player, "FUEL_TANK").some((tank) => tank.id === target.equipment)) return "cant_return_fuel";
    if (!carriedCapsule(state, player, FUEL_CAPSULE_ITEM)) return "no_capsule";
    return state.ship.fuel >= state.config.ship.fuel.max ? "full" : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.fuel.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.fuel.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.fuel.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, _target: ReturnFuelActionData): void {
    const capsule = carriedCapsule(state, player, FUEL_CAPSULE_ITEM)!;
    removeItem(state, capsule.id);
    state.ship.fuel += 1;
    logSecret(state, player.id, "returnedFuel", { name: player.character });
  }
}
