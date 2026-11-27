import { Action, type ActionVisibility, isString } from "./action.ts";
import { changeMP, gainMorale } from "../adjustStats.ts";
import { damage, heal } from "../death.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { removeContamination } from "../infection.ts";
import { itemsIn, isWorking } from "../items.ts";
import { SUPER_SOAP_ITEM } from "../itemIds.ts";
import { logPrivate } from "../log.ts";
import { oneShowerADay, showered } from "../modifiers.ts";
import { projectDone } from "../projects.ts";
import { rollFloat } from "../rng.ts";
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
    // Aquaphobia (owner, 2026-11-27): one shower a day, whichever came first that day.
    if (player.showeredToday && oneShowerADay(player)) return "daily_cap";
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
    player.showeredToday = true;
    const burns = player.role === "mush" && !hasSkill(player, "water_resistant");
    logPrivate(state, player.id, burns ? "showeredMush" : "showered");
    showered(state, player);
    if (burns) {
      damage(state, player, state.config.shower.effect.mushDamage, "injury");
      return;
    }
    if (hasSoap(state, player, SUPER_SOAP_ITEM)) {
      removeContamination(state, player);
    }
    if (player.alive && player.role !== "mush" && projectDone(state, "THALASSO")) {
      const { chance, hp, morale, mp } = state.config.project.thalasso;
      if (rollFloat(state) < chance) {
        heal(state, player, hp);
        logPrivate(state, player.id, "thalassoHp", { amount: hp });
      }
      if (rollFloat(state) < chance) {
        gainMorale(state, player, morale);
      }
      if (rollFloat(state) < chance) {
        changeMP(state, player, mp);
        logPrivate(state, player.id, "thalassoMp", { amount: mp });
      }
    }
  }

  showerCost(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    const soap = hasSoap(state, player, "soap") || hasSoap(state, player, SUPER_SOAP_ITEM);
    const cost = Math.max(0, state.config.shower.cost.ap - (soap ? state.config.shower.cost.soapDiscountAp : 0));
    return hasSkill(player, "water_resistant") ? Math.min(cost, state.config.shower.cost.waterResistantAp) : cost;
  }
}

const hasSoap = (state: Readonly<GameState>, player: Readonly<PlayerState>, type: string): boolean =>
  itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === type && isWorking(item));
