import { Action } from "./action.ts";
import { ITEM_TYPES, canReach } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { nextFloat } from "../rng.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type DismantleActionData = { type: "dismantle"; item: string };

export class DismantleAction extends Action<DismantleActionData> {
  constructor() {
    super("dismantle");
    this.baseAPCost = 3;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DismantleActionData[] {
    return state.items.filter((item) => ITEM_TYPES[item.type]?.dismantle && canReach(state, player, item.at)).map((item) => ({ type: "dismantle", item: item.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.dismantle || !canReach(state, player, item.at)) return "cant_dismantle";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: DismantleActionData): void {
    const index = state.items.findIndex((i) => i.id === target.item);
    const [item] = state.items.splice(index, 1) as [ItemState];
    const [roll, rng] = nextFloat(state.rng);
    state.rng = rng;
    if (roll >= state.config.dismantleOdds) {
      state.items.splice(index, 0, item);
      logPrivate(state, player.id, "dismantleFailed", { item: item.type });
      return;
    }
    const scraps = ITEM_TYPES[item.type]!.dismantle!;
    for (const [scrapType, amount] of [
      ["metal_scraps", scraps.metal],
      ["plastic_scraps", scraps.plastic],
    ] as const) {
      for (let i = 0; i < amount; i++) {
        state.items.push({ id: `item-${state.nextItemId++}`, type: scrapType, at: { kind: "room", id: player.room } });
      }
    }
    logPublic(state, player.room, "dismantled", { name: player.name, item: item.type });
  }
}
