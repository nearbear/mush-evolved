import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { EQUIPMENT_TYPES, isEquipmentEnabled } from "../equipment.ts";
import { ITEM_TYPES, canReachItem, removeItem } from "../items.ts";
import { logPrivate } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type ReinforceActionData = { type: "reinforce"; equipment: string } | { type: "reinforce"; item: string };

/**
 * An Engineer's action (owner, 2026-11-07): `config.reinforce.cost.ap`, at `config.reinforce.chance`, uses up one scrap
 * to give equipment in the room or an item in reach shielding: the scrap's `gain`, capped at `config.reinforce.max`. The scrap
 * is picked by `findScrap`: metal in the inventory, plastic in the inventory, metal in the room, plastic in the room. A target qualifies if its type can be
 * dismantled or sabotaged. A target already at the cap isn't offered. The scrap is kept when the roll fails. Only Engineers
 * and Mush see the shielding (the shield has no effect yet). The result lines are private to the actor.
 */
export class ReinforceAction extends Action<ReinforceActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("reinforce");
  }

  override parse(raw: Readonly<Record<string, unknown>>): ReinforceActionData | null {
    if (isString(raw.item)) return { type: "reinforce", item: raw.item };
    if (isString(raw.equipment)) return { type: "reinforce", equipment: raw.equipment };
    return null;
  }

  /** An Engineer point (`resources.eng`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.eng > 0 ? { ap: 0, mp: 0, paidBy: "eng" } : { ap: state.config.reinforce.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.reinforce.chance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReinforceActionData[] {
    if (!hasSkill(player, "engineer")) return [];
    return [
      ...targetItems(state, player).filter((i) => findScrap(state, player, i.id)).map((i): ReinforceActionData => ({ type: "reinforce", item: i.id })),
      ...(findScrap(state, player) ? targetEquipment(state, player).map((e): ReinforceActionData => ({ type: "reinforce", equipment: e.id })) : []),
    ];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReinforceActionData): string | null {
    if (!hasSkill(player, "engineer")) return "no_skill";
    if ("item" in target) {
      if (!targetItems(state, player).some((i) => i.id === target.item)) return "cant_reinforce";
      return findScrap(state, player, target.item) ? null : "no_scrap";
    }
    if (!targetEquipment(state, player).some((e) => e.id === target.equipment)) return "cant_reinforce";
    return findScrap(state, player) ? null : "no_scrap";
  }

  override apply(state: GameState, player: PlayerState, target: ReinforceActionData): void {
    const { gain, max } = state.config.reinforce;
    const thing = "item" in target ? state.items.find((i) => i.id === target.item)! : state.equipment[player.room]!.find((e) => e.id === target.equipment)!; // checked, so it exists
    const scrap = findScrap(state, player, "item" in target ? target.item : undefined)!; // checked, so it exists
    removeItem(state, scrap.id);
    thing.shield = Math.min(max, (thing.shield ?? 0) + gain[scrap.type]!);
    if ("item" in target) logPrivate(state, player.id, "reinforcedItem", { item: thing.type, shield: thing.shield });
    else logPrivate(state, player.id, "reinforced", { equipment: thing.type, shield: thing.shield });
  }

  override fail(state: GameState, player: PlayerState, target: ReinforceActionData): void {
    if ("item" in target) logPrivate(state, player.id, "reinforceFailedItem", { item: state.items.find((i) => i.id === target.item)!.type });
    else logPrivate(state, player.id, "reinforceFailed", { equipment: state.equipment[player.room]!.find((e) => e.id === target.equipment)!.type });
  }
}

/** Shielding at `config.reinforce.fortifiedAt` or more: Sabotage and Dismantle refuse it (owner, 2026-11-07). Green Jelly is unaffected for now. */
export const isFortified = (state: Readonly<GameState>, thing: Readonly<{ shield?: number }>): boolean => (thing.shield ?? 0) >= state.config.reinforce.fortifiedAt;

/**
 * The scrap to use, in this order: metal in the inventory, plastic in the inventory, metal in the room, plastic in the room
 * (owner, 2026-11-07). The types are `config.reinforce.gain`'s keys, in order (metal first). Never the target itself.
 */
function findScrap(state: Readonly<GameState>, player: Readonly<PlayerState>, except?: string): ItemState | undefined {
  const usable = state.items.filter((i) => i.id !== except && i.type in state.config.reinforce.gain && canReachItem(state, player, i));
  for (const where of ["player", "room"] as const)
    for (const type of Object.keys(state.config.reinforce.gain)) {
      const found = usable.find((i) => i.type === type && i.at.kind === where);
      if (found) return found;
    }
  return undefined;
}

const targetItems = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  state.items.filter((i) => (ITEM_TYPES[i.type]?.dismantle || ITEM_TYPES[i.type]?.canBeSabotaged) && canReachItem(state, player, i) && (i.shield ?? 0) < state.config.reinforce.max);

const targetEquipment = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => (EQUIPMENT_TYPES[e.type]?.dismantle || EQUIPMENT_TYPES[e.type]?.canBeSabotaged) && isEquipmentEnabled(state, e) && (e.shield ?? 0) < state.config.reinforce.max);
