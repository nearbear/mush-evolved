import { Action, type ActionVisibility, isString } from "./action.ts";
import { breakEquipment, breakItem, isBreakable } from "../breakage.ts";
import { EQUIPMENT_TYPES } from "../equipment.ts";
import { ITEM_TYPES, canReachItem, isWorking } from "../items.ts";
import { logSecret } from "../log.ts";
import { isFortified } from "./reinforce.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SabotageActionData = { type: "sabotage"; equipment: string } | { type: "sabotage"; item: string };

/**
 * A Mush breaks a piece of equipment in the room or an item in reach, if its type has `canBeSabotaged` (owner,
 * 2026-11-07): `config.sabotage.cost.ap`, at the target's repair chance (`config.repair.chance` for equipment,
 * `ItemType.repairChance` for an item) or `config.sabotage.defaultChance` for an item without one. Secret, and silent:
 * no NERON line for equipment, no line for an item that vanishes. Equipment must be one that can break
 * (`isBreakable`), an item one with `canBreak`; the break is `breakEquipment` / `breakItem`.
 */
export class SabotageAction extends Action<SabotageActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("sabotage");
  }

  override parse(raw: Readonly<Record<string, unknown>>): SabotageActionData | null {
    if (isString(raw.item)) return { type: "sabotage", item: raw.item };
    if (isString(raw.equipment)) return { type: "sabotage", equipment: raw.equipment };
    return null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.sabotage.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SabotageActionData): number {
    if ("item" in target) {
      const type = state.items.find((i) => i.id === target.item)?.type ?? "";
      return ITEM_TYPES[type]?.repairChance ?? state.config.sabotage.defaultChance;
    }
    const type = (state.equipment[player.room] ?? []).find((e) => e.id === target.equipment)?.type ?? "";
    return state.config.repair.chance[type] ?? 0;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SabotageActionData[] {
    if (player.role !== "mush") return [];
    return [
      ...sabotageableEquipment(state, player).filter((e) => !isFortified(state, e)).map((e): SabotageActionData => ({ type: "sabotage", equipment: e.id })),
      ...sabotageableItems(state, player).filter((i) => !isFortified(state, i)).map((i): SabotageActionData => ({ type: "sabotage", item: i.id })),
    ];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SabotageActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    const found = "item" in target
      ? sabotageableItems(state, player).some((i) => i.id === target.item && !isFortified(state, i))
      : sabotageableEquipment(state, player).some((e) => e.id === target.equipment && !isFortified(state, e));
    return found ? null : "cant_sabotage";
  }

  override apply(state: GameState, player: PlayerState, target: SabotageActionData): void {
    if ("item" in target) {
      const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
      logSecret(state, player.id, "sabotagedItem", { name: player.character, item: item.type });
      breakItem(state, item);
      return;
    }
    const equipment = state.equipment[player.room]!.find((e) => e.id === target.equipment)!;
    logSecret(state, player.id, "sabotaged", { name: player.character, equipment: equipment.type });
    breakEquipment(state, equipment, false);
  }

  override fail(state: GameState, player: PlayerState, target: SabotageActionData): void {
    if ("item" in target) logSecret(state, player.id, "sabotageFailedItem", { name: player.character, item: state.items.find((i) => i.id === target.item)!.type });
    else logSecret(state, player.id, "sabotageFailed", { name: player.character, equipment: state.equipment[player.room]!.find((e) => e.id === target.equipment)!.type });
  }
}

export const sabotageableEquipment = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => !e.broken && EQUIPMENT_TYPES[e.type]?.canBeSabotaged && isBreakable(state, e.type));

export const sabotageableItems = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  state.items.filter((i) => isWorking(i) && ITEM_TYPES[i.type]?.canBeSabotaged && ITEM_TYPES[i.type]?.canBreak && canReachItem(state, player, i));
