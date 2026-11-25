import { Action, type ActionCost, isString } from "./action.ts";
import { canReachItem, removeItem } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { hullRepairAmount } from "../modifiers.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";
import { rubellaBlocks } from "../diseases.ts";

export type RepairHullActionData = { type: "repair_hull"; item: string };

export const HULL_REPAIR_ITEM = "metal_scraps";

/**
 * Patch the hull with a metal scrap (owner, 2026-10-24, the wiki's Armure et Bouclier and eMush's StrengthenHull):
 * 1 AP, 25%, +5 hull up to its max, from any room, with a scrap lying there or carried. The scrap is used up only on a
 * success, and the action isn't offered while the hull is full. A success is public in the room, a failure private.
 */
export class RepairHullAction extends Action<RepairHullActionData> {
  constructor() {
    super("repair_hull", { item: isString });
  }

  /** An Engineer point (`resources.eng`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.eng > 0 ? { ap: 0, mp: 0, paidBy: "eng" } : { ap: state.config.hullRepair.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    if (player.statuses.includes("genius")) return 1; // Owner, 2026-11-05: Genius makes the next repair certain.
    return state.config.hullRepair.chance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RepairHullActionData[] {
    if (state.ship.hull >= state.config.ship.hull.max) return [];
    return state.items
      .filter((item) => item.type === HULL_REPAIR_ITEM && canReachItem(state, player, item))
      .map((item): RepairHullActionData => ({ type: "repair_hull", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairHullActionData): string | null {
    if (rubellaBlocks(player)) return "cant_repair";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (item.type !== HULL_REPAIR_ITEM || !canReachItem(state, player, item)) return "cant_repair_hull";
    if (state.ship.hull >= state.config.ship.hull.max) return "hull_full";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.hullRepair.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: RepairHullActionData): void {
    removeItem(state, target.item);
    removeStatus(player, "genius");
    const amount = hullRepairAmount(state, player, state.config.hullRepair.amount);
    state.ship.hull = Math.min(state.config.ship.hull.max, state.ship.hull + amount);
    logPublic(state, player.room, "hullRepaired", { name: player.character });
  }

   override injuryChance(state: Readonly<GameState>): number {
    return state.config.hullRepair.injuryChance;
  }

  override fail(state: GameState, player: PlayerState): void {
    logPrivate(state, player.id, "hullRepairFailed");
  }
}
