import { Action, isString } from "./action.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { ITEM_TYPES, canReachItem, newItemId, removeItem } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { getUp } from "./lie_down.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

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

  /** An item or a piece of equipment; an item wins if both are sent. */
  override parse(raw: Readonly<Record<string, unknown>>): DismantleActionData | null {
    if (isString(raw.item)) return { type: "dismantle", item: raw.item };
    if (isString(raw.equipment)) return { type: "dismantle", equipment: raw.equipment };
    return null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.dismantle.cost.ap, mp: 0 };
  }

  /** The usual odds, unless the item or equipment type has its own in `ItemType.dismantle.chance` (knife and blaster, owner 2026-10-22). */
  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): number {
    const own = "item" in target
      ? ITEM_TYPES[state.items.find((i) => i.id === target.item)?.type ?? ""]?.dismantle?.chance
      : EQUIPMENT_TYPES[state.equipment[player.room]?.find((e) => e.id === target.equipment)?.type ?? ""]?.dismantle?.chance;
    return own ?? state.config.dismantle.successChance;
  }

  override dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): number {
    return state.config.dismantle.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.dismantle.injuryChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DismantleActionData[] {
    if (!hasSkill(player, "engineer")) return [];
    return [
      ...state.items.filter((item) => ITEM_TYPES[item.type]?.dismantle && canReachItem(state, player, item)).map((item): DismantleActionData => ({ type: "dismantle", item: item.id })),
      ...dismantlable(state, player).map((e): DismantleActionData => ({ type: "dismantle", equipment: e.id })),
    ];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DismantleActionData): string | null {
    if (!hasSkill(player, "engineer")) return "no_skill";
    if ("equipment" in target) {
      if (!dismantlable(state, player).some((e) => e.id === target.equipment)) return "cant_dismantle";
      return null;
    }
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.dismantle || !canReachItem(state, player, item)) return "cant_dismantle";
    return null;
  }

  override fail(state: GameState, player: PlayerState, target: DismantleActionData): void {
    if ("equipment" in target) {
      const type = state.equipment[player.room]!.find((e) => e.id === target.equipment)!.type; // checked, so it exists
      logPrivate(state, player.id, "dismantleEquipmentFailed", { equipment: type });
    } else logPrivate(state, player.id, "dismantleFailed", { item: state.items.find((i) => i.id === target.item)!.type });
  }

  override apply(state: GameState, player: PlayerState, target: DismantleActionData): void {
    let scraps: { metal: number; plastic: number; extra?: string[] };
    if ("equipment" in target) {
      const list = state.equipment[player.room]!; // checked, so it exists
      const { type } = list.splice(list.findIndex((e) => e.id === target.equipment), 1)[0]!;
      for (const p of state.players) if (p.lyingIn === target.equipment) getUp(p);
      scraps = EQUIPMENT_TYPES[type]!.dismantle!;
      logPublic(state, player.room, "dismantledEquipment", { name: player.character, equipment: type });
    } else {
      const { type } = removeItem(state, target.item);
      scraps = ITEM_TYPES[type]!.dismantle!;
      logPublic(state, player.room, "dismantled", { name: player.character, item: type });
    }
    const left = [...Array<string>(scraps.metal).fill("metal_scraps"), ...Array<string>(scraps.plastic).fill("plastic_scraps"), ...(scraps.extra ?? [])];
    for (const type of left) state.items.push({ id: newItemId(state), type, at: { kind: "room", id: player.room } });
  }
}

const dismantlable = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => EQUIPMENT_TYPES[e.type]?.dismantle);
