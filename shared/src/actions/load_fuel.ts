import { Action, type ActionVisibility, isString } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { carriedCapsule, combustionLevel } from "./capsule.ts";
import { FUEL_CAPSULE_ITEM } from "../itemIds.ts";
import { removeItem } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LoadFuelActionData = { type: "load_fuel"; equipment: string };

/**
 * Put a carried fuel capsule into the combustion chamber (the engine room), 0 AP and a dirt chance (owner, 2026-10-23,
 * the wiki). The chamber holds `ship.combustion.max` (9); Travel burns what it holds.
 */
export class LoadFuelAction extends Action<LoadFuelActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("load_fuel", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LoadFuelActionData[] {
    if (!carriedCapsule(state, player, FUEL_CAPSULE_ITEM)) return [];
    return equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").map((chamber): LoadFuelActionData => ({ type: "load_fuel", equipment: chamber.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LoadFuelActionData): string | null {
    if (!equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").some((chamber) => chamber.id === target.equipment)) return "cant_load_fuel";
    if (!carriedCapsule(state, player, FUEL_CAPSULE_ITEM)) return "no_capsule";
    return state.ship.combustion >= state.config.ship.combustion.max ? "full" : null;
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

  override apply(state: GameState, player: PlayerState, _target: LoadFuelActionData): void {
    const capsule = carriedCapsule(state, player, FUEL_CAPSULE_ITEM)!;
    removeItem(state, capsule.id);
    state.ship.combustion += 1;
    logSecret(state, player.id, "loadedFuel", { name: player.character, ...combustionLevel(state) });
  }
}
