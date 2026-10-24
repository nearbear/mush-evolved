import { Action, type ActionVisibility } from "./action.ts";
import { combustionLevel, equipmentHere } from "./take_fuel.ts";
import { FUEL_CAPSULE_ITEM, itemsIn } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LoadFuelActionData = { type: "load_fuel"; equipment: string };

const carriedCapsule = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  itemsIn(state, { kind: "player", id: player.id }).find((item) => item.type === FUEL_CAPSULE_ITEM);

/**
 * Put a carried fuel capsule into the combustion chamber (the engine room), 0 AP and a dirt chance (owner, 2026-10-23,
 * the wiki). The chamber holds `ship.combustion.max` (9); Travel burns what it holds.
 */
export class LoadFuelAction extends Action<LoadFuelActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("load_fuel");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LoadFuelActionData[] {
    if (!carriedCapsule(state, player)) return [];
    return equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").map((chamber): LoadFuelActionData => ({ type: "load_fuel", equipment: chamber.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LoadFuelActionData): string | null {
    if (!equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").some((chamber) => chamber.id === target.equipment)) return "cant_load_fuel";
    if (!carriedCapsule(state, player)) return "no_capsule";
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
    const capsule = carriedCapsule(state, player)!;
    state.items.splice(state.items.indexOf(capsule), 1);
    state.ship.combustion += 1;
    logSecret(state, player.id, "loadedFuel", { name: player.character, ...combustionLevel(state) });
  }
}
