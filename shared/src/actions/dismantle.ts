import { Action } from "./action.ts";
import { CAMERA_EQUIPMENT } from "../equipment.ts";
import { ITEM_TYPES, canReach } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/**
 * An item you can reach, or (#35, owner 2026-10-17) the room's installed camera, which is taken out
 * of the room's equipment and leaves the camera's scrap instead of a camera item.
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
      ...installedCameras(state, player).map((e): DismantleActionData => ({ type: "dismantle", equipment: e.id })),
    ];
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): string | null {
    if ("equipment" in target) {
      if (!installedCameras(state, player).some((e) => e.id === target.equipment)) return "cant_dismantle";
      return this.canAfford(state, player, target);
    }
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.dismantle || !canReach(state, player, item.at)) return "cant_dismantle";
    return this.canAfford(state, player, target);
  }

  override fail(state: GameState, player: PlayerState, target: DismantleActionData): void {
    logPrivate(state, player.id, "dismantleFailed", { item: "equipment" in target ? "camera" : state.items.find((i) => i.id === target.item)!.type });
  }

  override apply(state: GameState, player: PlayerState, target: DismantleActionData): void {
    let type: string;
    if ("equipment" in target) {
      const list = state.config.equipment[player.room]!; // checked, so it exists
      list.splice(list.findIndex((e) => e.id === target.equipment), 1);
      type = "camera";
    } else {
      const index = state.items.findIndex((i) => i.id === target.item); // checked, so it exists
      [{ type }] = state.items.splice(index, 1) as [ItemState];
    }
    const scraps = ITEM_TYPES[type]!.dismantle!;
    for (const [scrapType, amount] of [
      ["metal_scraps", scraps.metal],
      ["plastic_scraps", scraps.plastic],
    ] as const) {
      for (let i = 0; i < amount; i++) {
        state.items.push({ id: `item-${state.nextItemId++}`, type: scrapType, at: { kind: "room", id: player.room } });
      }
    }
    logPublic(state, player.room, "dismantled", { name: player.character, item: type });
  }
}

const installedCameras = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.config.equipment[player.room] ?? []).filter((e) => e.type === CAMERA_EQUIPMENT);
