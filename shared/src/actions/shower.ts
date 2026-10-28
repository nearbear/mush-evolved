import { Action, type ActionVisibility, isString } from "./action.ts";
import { damage } from "../death.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { itemsIn } from "../items.ts";
import { logPrivate } from "../log.ts";
import { showered } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ShowerActionData = { type: "shower"; equipment: string };

export class ShowerAction extends Action<ShowerActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("shower", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ShowerActionData[] {
    return (state.equipment[player.room] ?? []).filter((equipment) => EQUIPMENT_TYPES[equipment.type]?.shower).map((equipment) => ({ type: "shower", equipment: equipment.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ShowerActionData): string | null {
    const equip = state.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.shower) return "cant_shower";
    return null;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: this.showerCost(state, player), mp: 0 };
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.shower.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: ShowerActionData): void {
    removeStatus(player, "dirty");
    const burns = player.role === "mush" && !hasSkill(player, "water_resistant");
    logPrivate(state, player.id, burns ? "showeredMush" : "showered");
    showered(state, player);
    if (burns) damage(state, player, state.config.shower.effect.mushDamage);
  }

  showerCost(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  const soap = itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === "soap");
  const cost = Math.max(0, state.config.shower.cost.ap - (soap ? state.config.shower.cost.soapDiscountAp : 0));
  return hasSkill(player, "water_resistant") ? Math.min(cost, state.config.shower.cost.waterResistantAp) : cost;
}
}
