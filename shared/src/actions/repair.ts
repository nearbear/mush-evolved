import { Action, isString } from "./action.ts";
import { isBreakable } from "../breakage.ts";
import { itemsIn } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type RepairActionData = { type: "repair"; equipment: string };

/** The item that makes a repair `config.repair.wrenchFactor` times as likely, carried. */
export const WRENCH_ITEM = "wrench";

/**
 * Repair broken equipment in your room (owner, 2026-10-25, eMushpedia "Pannes"): 1 AP, at the equipment type's base
 * chance (`config.repair.chance`), x1.5 carrying a wrench and x2 for a Technician (`engineer`, its modifier). A success
 * is public in the room, a failure private (owner, 2026-11-01). A repaired turret gets its old charges back.
 */
export class RepairAction extends Action<RepairActionData> {
  override onBroken = true;

  constructor() {
    super("repair", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.repair.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairActionData): number {
    if (player.statuses.includes("genius")) return 1; // Owner, 2026-11-05: Genius makes the next repair certain.
    const type = brokenHere(state, player).find((e) => e.id === target.equipment)?.type;
    const base = (type !== undefined ? state.config.repair.chance[type] : undefined) ?? 0;
    const wrench = itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === WRENCH_ITEM);
    return Math.min(1, base * (wrench ? state.config.repair.wrenchFactor : 1));
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RepairActionData[] {
    return brokenHere(state, player).map((e): RepairActionData => ({ type: "repair", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairActionData): string | null {
    return brokenHere(state, player).some((e) => e.id === target.equipment) ? null : "cant_repair";
  }

  override apply(state: GameState, player: PlayerState, target: RepairActionData): void {
    const equipment = state.equipment[player.room]!.find((e) => e.id === target.equipment)!; // checked, so it exists
    delete equipment.broken;
    removeStatus(player, "genius");
    logPublic(state, player.room, "repaired", { name: player.character, equipment: equipment.type });
  }

  override fail(state: GameState, player: PlayerState, target: RepairActionData): void {
    const type = state.equipment[player.room]!.find((e) => e.id === target.equipment)!.type;
    logPrivate(state, player.id, "repairFailed", { equipment: type });
  }
}

const brokenHere = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => e.broken && isBreakable(state, e.type));
