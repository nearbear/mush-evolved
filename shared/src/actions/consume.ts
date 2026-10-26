import { Action } from "./action.ts";
import { ITEM_TYPES, canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import { consumed } from "../modifiers.ts";
import { rationApBonus } from "../comms.ts";
import { contaminate } from "../infection.ts";
import { isFullBelly } from "../statuses.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { gainMorale } from "../adjustStats.ts";

export type ConsumeActionData = { type: "consume"; item: string };

export class ConsumeAction extends Action<ConsumeActionData> {
  constructor() {
    super("consume");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ConsumeActionData[] {
    return state.items.filter((item) => ITEM_TYPES[item.type]?.consume && canReachItem(state, player, item)).map((item) => ({ type: "consume", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ConsumeActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.consume || !canReachItem(state, player, item)) return "cant_consume";
    return isFullBelly(state, player) ? "full_belly" : null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.consume.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: ConsumeActionData): void {
    const index = state.items.findIndex((i) => i.id === target.item);
    const [item] = state.items.splice(index, 1) as [ItemState];
    // Fungal cuisine: a human is contaminated first, one level per spore; a conversion ends the meal with no food effects.
    if (player.role === "human" && item.spores) {
      for (let i = 0; i < item.spores && player.role === "human"; i++) contaminate(state, player);
      if (player.role !== "human") {
        logPublic(state, player.room, "consumed", { name: player.character, item: item.type });
        return;
      }
    }
    const { ap, satiety, morale = 0, hp = 0 } = ITEM_TYPES[item.type]!.consume!;
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, hp));
    player.ap = Math.min(state.config.maxAp, player.ap + ap + rationApBonus(state, item.type));
    //player.morale = Math.max(0, Math.min(player.maxMorale, player.morale + morale));
    gainMorale(state, player, morale);
    if (player.role === "human") {
      player.satiety += satiety;
      player.satietyZeroSince = player.satiety === 0 ? state.cycle : null;
    }
    consumed(state, player, item);
    logPublic(state, player.room, "consumed", { name: player.character, item: item.type });
  }
}
