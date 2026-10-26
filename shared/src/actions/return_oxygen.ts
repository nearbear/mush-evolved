import { Action, type ActionVisibility, isString } from "./action.ts";
import { equipmentHere } from "./take_fuel.ts";
import { OXYGEN_CAPSULE_ITEM, itemsIn } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReturnOxygenActionData = { type: "return_oxygen"; equipment: string };

const carriedCapsule = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  itemsIn(state, { kind: "player", id: player.id }).find((item) => item.type === OXYGEN_CAPSULE_ITEM);

/**
 * Put a carried oxygen capsule into an oxygen tank (owner, 2026-10-24, the wiki): it raises the ship's oxygen by one,
 * up to its max, and is how a player gets rid of a capsule. 0 AP, a dirt chance, secret, like return_fuel.
 */
export class ReturnOxygenAction extends Action<ReturnOxygenActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("return_oxygen", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReturnOxygenActionData[] {
    if (!carriedCapsule(state, player)) return [];
    return equipmentHere(state, player, "OXYGEN_TANK").map((tank): ReturnOxygenActionData => ({ type: "return_oxygen", equipment: tank.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReturnOxygenActionData): string | null {
    if (!equipmentHere(state, player, "OXYGEN_TANK").some((tank) => tank.id === target.equipment)) return "cant_return_oxygen";
    if (!carriedCapsule(state, player)) return "no_capsule";
    return state.ship.oxygen >= state.config.ship.oxygen.max ? "full" : null;
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

  override apply(state: GameState, player: PlayerState, _target: ReturnOxygenActionData): void {
    const capsule = carriedCapsule(state, player)!;
    state.items.splice(state.items.indexOf(capsule), 1);
    state.ship.oxygen += 1;
    logSecret(state, player.id, "returnedOxygen", { name: player.character });
  }
}
