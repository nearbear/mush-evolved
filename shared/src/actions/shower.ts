import { Action } from "./action.ts";
import { damage } from "../death.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { itemsIn } from "../items.ts";
import { logPrivate } from "../log.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ShowerActionData = { type: "shower"; equipment: string };

export class ShowerAction extends Action<ShowerActionData> {
  constructor() {
    super("shower");
    this.baseAPCost = 2;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ShowerActionData[] {
    return (state.config.equipment[player.room] ?? []).filter((equipment) => EQUIPMENT_TYPES[equipment.type]?.shower).map((equipment) => ({ type: "shower", equipment: equipment.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ShowerActionData): string | null {
    const equip = state.config.equipment[player.room]?.find((eq) => eq.id === target.equipment);
    if (!equip || !EQUIPMENT_TYPES[equip.type]?.shower) return "cant_shower";
    if (!player.statuses.includes("dirty")) return "not_dirty";
    return this.canAfford(state, player, target);
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: showerCost(state, player), mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: ShowerActionData): void {
    removeStatus(player, "dirty");
    logPrivate(state, player.id, player.role === "mush" ? "showeredMush" : "showered");
    if (player.role === "mush") damage(state, player, state.config.shower.mushDamage);
  }
}

function showerCost(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  const soap = itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === "soap");
  return Math.max(0, state.config.shower.ap - (soap ? state.config.shower.soapDiscount : 0));
}
