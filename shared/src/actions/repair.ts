import { Action, type ActionCost, isString } from "./action.ts";
import { isBreakable } from "../breakage.ts";
import { doorOtherRoom, doorsOf, repairDoor } from "../doors.ts";
import { ITEM_TYPES, canReachItem, isWorking, itemsIn } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { removeStatus } from "../statuses.ts";
import { repairEquipment } from "../gravity.ts";
import type { DoorId, GameState, PlayerState } from "../types.ts";
import { rubellaBlocks } from "../diseases.ts";

export type RepairActionData =
  | { type: "repair"; equipment: string }
  | { type: "repair"; item: string }
  | { type: "repair"; door: DoorId };

/** The item that makes a repair `config.repair.wrenchFactor` times as likely, carried. */
export const WRENCH_ITEM = "wrench";

/**
 * Repair broken equipment in your room (owner, 2026-10-25, eMushpedia "Pannes"): 1 AP, at the equipment type's base
 * chance (`config.repair.chance`), x1.5 carrying a wrench and x2 for a Technician (`engineer`, its modifier). A success
 * is public in the room, a failure private (owner, 2026-11-01). A repaired turret gets its old charges back,
 * and a repaired Gravity Simulator restarts (gravity.ts).
 * It also repairs a broken item you can reach, at `ItemType.repairChance` with the same factors (owner, 2026-11-07);
 * a type without one can't be repaired. The item's own `broken` flag is cleared; the logs are `itemRepaired` and
 * `itemRepairFailed`.
 */
export class RepairAction extends Action<RepairActionData> {
  override onBroken = true;

  constructor() {
    super("repair");
  }

  override parse(raw: Readonly<Record<string, unknown>>): RepairActionData | null {
    if (isString(raw.item)) return { type: "repair", item: raw.item };
    if (isString(raw.equipment)) return { type: "repair", equipment: raw.equipment };
    if (isString(raw.door)) return { type: "repair", door: raw.door };
    return null;
  }

  /** An Engineer point (`resources.eng`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.eng > 0 ? { ap: 0, mp: 0, paidBy: "eng" } : { ap: state.config.repair.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairActionData): number {
    if (player.statuses.includes("genius")) return 1; // Owner, 2026-11-05: Genius makes the next repair certain.
    const base = "item" in target
      ? (brokenItems(state, player).find((i) => i.id === target.item) && ITEM_TYPES[state.items.find((i) => i.id === target.item)!.type]?.repairChance) || 0
      : "door" in target
        ? brokenDoorsHere(state, player).some((d) => d.id === target.door) ? (state.config.repair.chance.DOOR ?? 0) : 0
        : state.config.repair.chance[brokenHere(state, player).find((e) => e.id === target.equipment)?.type ?? ""] ?? 0;
    const wrench = itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === WRENCH_ITEM && isWorking(item));
    return Math.min(1, base * (wrench ? state.config.repair.wrenchFactor : 1));
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RepairActionData[] {
    return [
      ...brokenHere(state, player).map((e): RepairActionData => ({ type: "repair", equipment: e.id })),
      ...brokenItems(state, player).map((i): RepairActionData => ({ type: "repair", item: i.id })),
      ...brokenDoorsHere(state, player).map((d): RepairActionData => ({ type: "repair", door: d.id })),
    ];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairActionData): string | null {
    if (rubellaBlocks(player)) return "cant_repair";
    if ("item" in target) return brokenItems(state, player).some((i) => i.id === target.item) ? null : "cant_repair";
    if ("door" in target) return brokenDoorsHere(state, player).some((d) => d.id === target.door) ? null : "cant_repair";
    return brokenHere(state, player).some((e) => e.id === target.equipment) ? null : "cant_repair";
  }

  override apply(state: GameState, player: PlayerState, target: RepairActionData): void {
    if ("item" in target) {
      const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
      delete item.broken;
      removeStatus(player, "genius");
      logPublic(state, player.room, "itemRepaired", { name: player.character, item: item.type });
      return;
    }
    if ("door" in target) {
      repairDoor(state, target.door);
      removeStatus(player, "genius");
      logPublic(state, player.room, "doorRepaired", { name: player.character, room: doorOtherRoom(target.door, player.room)! });
      return;
    }
    const equipment = state.equipment[player.room]!.find((e) => e.id === target.equipment)!; // checked, so it exists
    repairEquipment(state, equipment);
    removeStatus(player, "genius");
    logPublic(state, player.room, "repaired", { name: player.character, equipment: equipment.type });
  }

  override fail(state: GameState, player: PlayerState, target: RepairActionData): void {
    if ("item" in target) {
      logPrivate(state, player.id, "itemRepairFailed", { item: state.items.find((i) => i.id === target.item)!.type });
      return;
    }
    if ("door" in target) {
      logPrivate(state, player.id, "doorRepairFailed", { room: doorOtherRoom(target.door, player.room)! });
      return;
    }
    const type = state.equipment[player.room]!.find((e) => e.id === target.equipment)!.type;
    logPrivate(state, player.id, "repairFailed", { equipment: type });
  }
}

const brokenHere = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => e.broken && isBreakable(state, e.type));

/** Broken items you can reach whose type can be repaired. */
const brokenItems = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  state.items.filter((i) => !isWorking(i) && ITEM_TYPES[i.type]?.repairChance !== undefined && canReachItem(state, player, i));

/** Broken doors of the player's current room. */
const brokenDoorsHere = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  doorsOf(state, player.room).filter((d) => d.broken);
