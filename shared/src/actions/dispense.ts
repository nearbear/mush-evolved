import { Action } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { produceItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DispenseActionData = { type: "dispense"; equipment: string };

export class DispenseAction extends Action<DispenseActionData> {
  constructor() {
    super("dispense");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DispenseActionData[] {
    return (state.config.equipment[player.room] ?? []).filter((equipment) => EQUIPMENT_TYPES[equipment.type]?.dispenses).map((equipment) => ({ type: "dispense", equipment: equipment.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DispenseActionData): string | null {
    const equip = state.config.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.dispenses) return "cant_dispense";
    return state.dispensedOn[target.equipment] === state.cycle ? "empty" : null;
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: DispenseActionData): void {
    const equip = state.config.equipment[player.room]!.find((eq) => eq.id === target.equipment)!;
    const type = EQUIPMENT_TYPES[equip.type]!.dispenses!;
    state.dispensedOn[target.equipment] = state.cycle;
    const { item, inInventory } = produceItem(state, player, type);
    logPublic(state, player.room, inInventory ? "tookFrom" : "tookFromKnocked", { name: player.character, item: item.type, equipment: equip.type });
  }
}
