import { Action, NO_SPACE, type ActionVisibility } from "./action.ts";
import { equipmentHere } from "./take_fuel.ts";
import { OXYGEN_CAPSULE_ITEM, hasSpace, produceItem } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TakeOxygenActionData = { type: "take_oxygen"; equipment: string };

/**
 * Take an oxygen capsule from an oxygen tank (the two central storages), like a fuel capsule (owner, 2026-10-24): 0 AP,
 * a dirt chance, secret, one slot, never dropped. It takes one oxygen from the ship's stock; return_oxygen puts it back.
 */
export class TakeOxygenAction extends Action<TakeOxygenActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("take_oxygen");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TakeOxygenActionData[] {
    return equipmentHere(state, player, "OXYGEN_TANK").map((tank): TakeOxygenActionData => ({ type: "take_oxygen", equipment: tank.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TakeOxygenActionData): string | null {
    if (!equipmentHere(state, player, "OXYGEN_TANK").some((tank) => tank.id === target.equipment)) return "cant_take_oxygen";
    if (state.ship.oxygen < 1) return "empty";
    return hasSpace(state, { kind: "player", id: player.id }) ? null : NO_SPACE;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.oxygenCapsule.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.oxygenCapsule.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.oxygenCapsule.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, _target: TakeOxygenActionData): void {
    state.ship.oxygen -= 1;
    produceItem(state, player, OXYGEN_CAPSULE_ITEM);
    logSecret(state, player.id, "tookOxygen", { name: player.character });
  }
}
