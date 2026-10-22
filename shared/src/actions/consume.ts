import { Action } from "./action.ts";
import { ITEM_TYPES, canReach } from "../items.ts";
import { logPublic } from "../log.ts";
import { consumed } from "../modifiers.ts";
import { isFullBelly } from "../statuses.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type ConsumeActionData = { type: "consume"; item: string };

export class ConsumeAction extends Action<ConsumeActionData> {
  constructor() {
    super("consume");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ConsumeActionData[] {
    return state.items.filter((item) => ITEM_TYPES[item.type]?.consume && canReach(state, player, item.at)).map((item) => ({ type: "consume", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ConsumeActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.consume || !canReach(state, player, item.at)) return "cant_consume";
    return isFullBelly(state, player) ? "full_belly" : null;
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.consume.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: ConsumeActionData): void {
    const index = state.items.findIndex((i) => i.id === target.item);
    const [item] = state.items.splice(index, 1) as [ItemState];
    const { ap, satiety, morale = 0 } = ITEM_TYPES[item.type]!.consume!;
    player.ap = Math.min(state.config.maxAp, player.ap + ap);
    player.morale = Math.max(0, Math.min(state.config.maxMorale, player.morale + morale));
    if (player.role === "human") {
      player.satiety += satiety;
      player.satietyZeroSince = player.satiety === 0 ? state.cycle : null;
    }
    consumed(state, player, item);
    logPublic(state, player.room, "consumed", { name: player.character, item: item.type });
  }
}
