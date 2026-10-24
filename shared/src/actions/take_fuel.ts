import { Action, NO_SPACE, type ActionVisibility } from "./action.ts";
import { FUEL_CAPSULE_ITEM, hasSpace, produceItem } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TakeFuelActionData = { type: "take_fuel"; equipment: string };

/** The combustion chamber's level for a log line: what it holds and what it can hold. */
export const combustionLevel = (state: Readonly<GameState>) => ({ level: state.ship.combustion, max: state.config.ship.combustion.max });

/** The equipment of this type in the player's room, or none. */
export const equipmentHere = (state: Readonly<GameState>, player: Readonly<PlayerState>, type: string) =>
  (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === type);

/**
 * Take a fuel capsule from a fuel tank (the two rear storages), 0 AP (owner, 2026-10-23, the wiki), with a chance of
 * getting dirty. It takes one fuel from the ship's stock. It needs room in the inventory (owner, 2026-10-23: the button
 * is shown disabled when the hands are full), so a capsule is never dropped by accident. Carry it to the combustion chamber (load_fuel.ts): that is the only fuel the ship can burn.
 */
export class TakeFuelAction extends Action<TakeFuelActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("take_fuel");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TakeFuelActionData[] {
    return equipmentHere(state, player, "FUEL_TANK").map((tank): TakeFuelActionData => ({ type: "take_fuel", equipment: tank.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TakeFuelActionData): string | null {
    if (!equipmentHere(state, player, "FUEL_TANK").some((tank) => tank.id === target.equipment)) return "cant_take_fuel";
    if (state.ship.fuel < 1) return "empty";
    return hasSpace(state, { kind: "player", id: player.id }) ? null : NO_SPACE;
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

  override apply(state: GameState, player: PlayerState, _target: TakeFuelActionData): void {
    state.ship.fuel -= 1;
    produceItem(state, player, FUEL_CAPSULE_ITEM);
    logSecret(state, player.id, "tookFuel", { name: player.character });
  }
}
