import { Action, isString } from "./action.ts";
import { drugOptions } from "../drugs.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { produceItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DispenseDrugActionData = { type: "dispense_drug"; equipment: string; drug: string };

/**
 * Take a drug from the Drug Dispenser's terminal (owner, 2026-11-11). Its list of every drug type, in a random order the same for
 * everyone, is renewed on cycles 1 and 4 (`config.drugDispenser.resetCycles`); you may choose among its first N drugs
 * (`drugOptionCount`: 1, +1 Nurse, +2 Biologist). The drug is made from nothing, and only one can be taken per reset.
 */
export class DispenseDrugAction extends Action<DispenseDrugActionData> {
  override terminal = true;

  constructor() {
    super("dispense_drug", { equipment: isString, drug: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DispenseDrugActionData[] {
    if (state.drugDispenser.used) return [];
    const dispensers = (state.equipment[player.room] ?? []).filter((e) => e.type === "DRUG_DISP");
    return dispensers.flatMap((e) => drugOptions(state, player).map((drug) => ({ type: "dispense_drug" as const, equipment: e.id, drug })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DispenseDrugActionData): string | null {
    const equip = state.equipment[player.room]?.find((e) => e.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.terminal || equip.type !== "DRUG_DISP") return "cant_dispense";
    if (state.drugDispenser.used) return "empty";
    return drugOptions(state, player).includes(target.drug) ? null : "cant_dispense";
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.drugDispenser.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: DispenseDrugActionData): void {
    state.drugDispenser.used = true;
    const { item, inInventory } = produceItem(state, player, target.drug);
    logPublic(state, player.room, inInventory ? "tookFrom" : "tookFromKnocked", { name: player.character, item: item.type, equipment: "DRUG_DISP" });
  }
}
