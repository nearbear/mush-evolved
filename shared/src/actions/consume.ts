import { Action, isString } from "./action.ts";
import { heal as healHp } from "../death.ts";
import { ITEM_TYPES, canReachItem, removeItem } from "../items.ts";
import { logSecret } from "../log.ts";
import { consumed, consumedByMush } from "../modifiers.ts";
import { rationApBonus } from "../comms.ts";
import { applyDrug } from "../drugs.ts";
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
      logSecret(state, player.id, "consumed", { name: player.character, item: item.type });
      consumedByMush(state, player, item);
      return;
    }
    const { ap, mp = 0, satiety, morale = 0, hp = 0 } = ITEM_TYPES[item.type]!.consume!;
    healHp(state, player, hp);
    changeAP(state, player, ap + rationApBonus(state, item.type));
    changeMP(state, player, mp);
    gainMorale(state, player, morale);
    if (player.role === "human") {
      player.satiety += satiety;
      player.satietyZeroSince = player.satiety === 0 ? state.cycle : null;
    }
    applyDrug(state, player, item.type);
    consumed(state, player, item);
    logSecret(state, player.id, "consumed", { name: player.character, item: item.type });
    // Fungal cuisine: a human is contaminated first, one level per spore; a conversion ends the meal with no food effects.
    if (player.role === "human" && item.spores) {
      for (let i = 0; i < item.spores && player.role === "human"; i++) contaminate(state, player);
    }
  }
}
