import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { EQUIPMENT_TYPES, isEquipmentEnabled } from "../equipment.ts";
import { HACKER_KIT_ITEM, isWorking, itemsIn } from "../items.ts";
import { logPrivate } from "../log.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type HackActionData = { type: "hack"; equipment: string };

/**
 * Hack a title-locked terminal (`PILOT_MODULE`, `COM_CENTER`, `NERON_BIOS_TERM`) in your room using a carried,
 * working hacker kit. Costs 2 AP or 1 Computer point. Base 25% chance, 1.25x failure streak, doubled by Computer
 * Scientist. Grants access to that terminal until leaving the room. Private visibility.
 */
export class HackAction extends Action<HackActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("hack", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.comp > 0 ? { ap: 0, mp: 0, paidBy: "comp" } : { ap: state.config.hack.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.hack.successChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): HackActionData[] {
    if (!hasWorkingKit(state, player)) return [];
    return hackableHere(state, player).map((e): HackActionData => ({ type: "hack", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HackActionData): string | null {
    if (!hasWorkingKit(state, player)) return "no_hacker_kit";
    const equip = (state.equipment[player.room] ?? []).find((e) => e.id === target.equipment);
    if (!equip) return "cant_hack";
    const title = EQUIPMENT_TYPES[equip.type]?.title;
    if (!title || equip.broken || !isEquipmentEnabled(state, equip)) return "cant_hack";
    if (hasTitleAccess(state, player, title)) return "already_have_access";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: HackActionData): void {
    const equip = state.equipment[player.room]!.find((e) => e.id === target.equipment)!;
    const hacked = (player.hackedEquipment ??= []);
    if (!hacked.includes(equip.id)) hacked.push(equip.id);
    logPrivate(state, player.id, "hacked", { equipment: equip.type });
  }

  override fail(state: GameState, player: PlayerState, target: HackActionData): void {
    const equip = state.equipment[player.room]!.find((e) => e.id === target.equipment)!;
    logPrivate(state, player.id, "hackFailed", { equipment: equip.type });
  }
}

const hasWorkingKit = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  itemsIn(state, { kind: "player", id: player.id }).some((item) => item.type === HACKER_KIT_ITEM && isWorking(item));

const hackableHere = (state: Readonly<GameState>, player: Readonly<PlayerState>) =>
  (state.equipment[player.room] ?? []).filter((e) => {
    const title = EQUIPMENT_TYPES[e.type]?.title;
    return title !== undefined && !e.broken && isEquipmentEnabled(state, e) && !hasTitleAccess(state, player, title);
  });
