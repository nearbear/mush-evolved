import { Action } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { ITEM_TYPES, canReach } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { getUp } from "./lie_down.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/**
 * An item you can reach, or equipment in your room that can be dismantled (`EquipmentType.dismantle`): an
 * installed camera (#35, owner 2026-10-17) leaves the camera's scrap instead of a camera item; a sofa
 * (owner, 2026-10-18) leaves a plastic scrap and gets whoever lies on it up.
 */
export type DismantleActionData = { type: "dismantle"; item: string } | { type: "dismantle"; equipment: string };

export class DismantleAction extends Action<DismantleActionData> {
  constructor() {
    super("dismantle");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.dismantle.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.dismantle.successChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DismantleActionData[] {
    return [
      ...state.items.filter((item) => ITEM_TYPES[item.type]?.dismantle && canReach(state, player, item.at)).map((item): DismantleActionData => ({ type: "dismantle", item: item.id })),
      ...dismantlable(state, player).map((e): DismantleActionData => ({ type: "dismantle", equipment: e.id })),
    ];
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): string | null {
    if ("equipment" in target) {
      if (!dismantlable(state, player).some((e) => e.id === target.equipment)) return "cant_dismantle";
      return this.canAfford(state, player, target);
    }
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.dismantle || !canReach(state, player, item.at)) return "cant_dismantle";
    return this.canAfford(state, player, target);
  }

  override fail(state: GameState, player: PlayerState, target: DismantleActionData): void {
    if ("equipment" in target) {
      const type = state.config.equipment[player.room]!.find((e) => e.id === target.equipment)!.type; // checked, so it exists
      logPrivate(state, player.id, "dismantleEquipmentFailed", { equipment: type });
    } else logPrivate(state, player.id, "dismantleFailed", { item: state.items.find((i) => i.id === target.item)!.type });
  }

  override apply(state: GameState, player: PlayerState, target: DismantleActionData): void {
    let scraps: { metal: number; plastic: number };
    if ("equipment" in target) {
      const list = state.config.equipment[player.room]!; // checked, so it exists
      const { type } = list.splice(list.findIndex((e) => e.id === target.equipment), 1)[0]!;
      for (const p of state.players) if (p.lyingIn === target.equipment) getUp(p);
      scraps = EQUIPMENT_TYPES[type]!.dismantle!;
      logPublic(state, player.room, "dismantledEquipment", { name: player.character, equipment: type });
    } else {
      const index = state.items.findIndex((i) => i.id === target.item); // checked, so it exists
      const [{ type }] = state.items.splice(index, 1) as [ItemState];
      scraps = ITEM_TYPES[type]!.dismantle!;
      logPublic(state, player.room, "dismantled", { name: player.character, item: type });
    }
    for (const [scrapType, amount] of [
      ["metal_scraps", scraps.metal],
      ["plastic_scraps", scraps.plastic],
    ] as const) {
      for (let i = 0; i < amount; i++) {
        state.items.push({ id: `item-${state.nextItemId++}`, type: scrapType, at: { kind: "room", id: player.room } });
      }
    }
  }
}

const dismantlable = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.config.equipment[player.room] ?? []).filter((e) => EQUIPMENT_TYPES[e.type]?.dismantle);
