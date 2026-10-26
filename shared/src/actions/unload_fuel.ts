import { Action, NO_SPACE, type ActionVisibility, isString } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { combustionLevel } from "./take_fuel.ts";
import { FUEL_CAPSULE_ITEM, hasSpace, produceItem } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type UnloadFuelActionData = { type: "unload_fuel"; equipment: string };

/**
 * Take a fuel capsule back out of the combustion chamber (owner, 2026-10-23, the wiki), 0 AP and a dirt chance. It goes
 * to the inventory, and needs room there (shown disabled when the hands are full, like taking one from a tank).
 */
export class UnloadFuelAction extends Action<UnloadFuelActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("unload_fuel", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UnloadFuelActionData[] {
    return equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").map((chamber): UnloadFuelActionData => ({ type: "unload_fuel", equipment: chamber.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UnloadFuelActionData): string | null {
    if (!equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").some((chamber) => chamber.id === target.equipment)) return "cant_unload_fuel";
    if (state.ship.combustion < 1) return "empty";
    return hasSpace(state, { kind: "player", id: player.id }) ? null : NO_SPACE;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.fuel.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.fuel.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, _target: UnloadFuelActionData): void {
    state.ship.combustion -= 1;
    produceItem(state, player, FUEL_CAPSULE_ITEM);
    logSecret(state, player.id, "unloadedFuel", { name: player.character, ...combustionLevel(state) });
  }
}
