import { Action, isString } from "./action.ts";
import { heal as healHp } from "../death.ts";
import { ITEM_TYPES, canReachItem, removeItem } from "../items.ts";
import { logSecret } from "../log.ts";
import { consumed, consumedByMush, mealApGain } from "../modifiers.ts";
import { rationApBonus } from "../comms.ts";
import { RESEARCH_COMPLETE } from "../research.ts";
import { applyDrug } from "../drugs.ts";
import { applyFruit, rollFruitDiseases } from "../fruits.ts";
import { contaminate } from "../infection.ts";
import { isFullBelly } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";
import { changeAP, changeMP, gainMorale } from "../adjustStats.ts";

export type ConsumeActionData = { type: "consume"; item: string };

export class ConsumeAction extends Action<ConsumeActionData> {
  constructor() {
    super("consume", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ConsumeActionData[] {
    return state.items.filter((item) => ITEM_TYPES[item.type]?.consume && canReachItem(state, player, item)).map((item) => ({ type: "consume", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ConsumeActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.consume || !canReachItem(state, player, item)) return "cant_consume";
    // Food Poisoning (owner, 2026-11-15): a human with it can consume nothing, food or drug.
    if (player.role === "human" && player.modifiers.includes("food_poisoning_disease")) return "cant_eat";
    return isFullBelly(state, player) && !ITEM_TYPES[item.type]!.drug ? "full_belly" : null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.consume.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: ConsumeActionData): void {
    const item = removeItem(state, target.item);
    if (player.role !== "human") {
      // Mush get no food effects, but the meal still fills them (owner, 2026-11-05). The one exception is morale, the
      // food's and a drug's, so a Mush's morale follows a human's and they never have to track it (owner, 2026-11-11).
      player.satiety += ITEM_TYPES[item.type]!.consume!.satiety;
      gainMorale(state, player, ITEM_TYPES[item.type]!.consume!.morale ?? 0);
      gainMorale(state, player, state.drugs[item.type]?.morale ?? 0);
      gainMorale(state, player, state.fruits[item.type]?.morale ?? 0);
      // A Mush still catches a fruit's diseases, as a carrier (owner, 2026-11-14).
      rollFruitDiseases(state, player, item.type);
      logSecret(state, player.id, "consumed", { name: player.character, item: item.type });
      consumedByMush(state, player, item);
      return;
    }
    const { ap, mp = 0, satiety, morale = 0, hp = 0 } = ITEM_TYPES[item.type]!.consume!;
    const coffeeBonus = item.type === "coffee" && (state.research.GUARANA_CAPUCCINO ?? 0) >= RESEARCH_COMPLETE ? state.config.research.guaranaExtraAp : 0;
    healHp(state, player, hp);
    const apGained = ap + rationApBonus(state, item.type) + coffeeBonus;
    // Food (satiety above 0) goes through the `mealAp` fold (Tapeworm halves it); a drug's AP does not.
    changeAP(state, player, satiety > 0 ? mealApGain(state, player, apGained) : apGained);
    changeMP(state, player, mp);
    gainMorale(state, player, morale);
    if (player.role === "human") {
      player.satiety += satiety;
      player.satietyZeroSince = player.satiety === 0 ? state.cycle : null;
    }
    applyDrug(state, player, item.type);
    applyFruit(state, player, item.type);
    consumed(state, player, item);
    logSecret(state, player.id, "consumed", { name: player.character, item: item.type });
    // Fungal cuisine: food effects apply first, then the human is contaminated by the item's spore level (even if it converts them).
    if (player.role === "human" && item.spores) {
      contaminate(state, player, item.spores);
    }
  }
}
