import { Action, IN_PRESELECTION, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { pushChat } from "../chat.ts";
import { CAT_ITEM, canReachItem } from "../items.ts";
import { logCovert } from "../log.ts";
import { MUSH_CHANNEL, type GameState, type PlayerState } from "../types.ts";

export type MushCaressActionData = { type: "mush_caress"; item: string };

/**
 * Infectious Caress (owner, 2026-11-21; eMush ConvertPet): Mush only (post-selection), 1 AP + 1 spore,
 * covert with `spore` tag (camera reveals, rings myco alarms), works on floor or in inventory. Marks
 * Schrödinger as Mush (`item.mush = true`) once only and posts a system notice in the Mush channel.
 */
export class MushCaressAction extends Action<MushCaressActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("mush_caress", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.schrodinger.mushCaress.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): MushCaressActionData[] {
    if (player.role !== "mush" || state.preselection) return [];
    return state.items
      .filter((item) => item.type === CAT_ITEM && !item.mush && canReachItem(state, player, item))
      .map((item) => ({ type: "mush_caress", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MushCaressActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== CAT_ITEM || !canReachItem(state, player, item)) return "no_such_item";
    if (item.mush) return "already_infected";
    if (player.spores < 1) return "no_spores";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: MushCaressActionData): void {
    const item = state.items.find((i) => i.id === target.item)!;
    player.spores -= 1;
    item.mush = true;
    logCovert(state, player.id, "mushCaressedCat", { name: player.character });
    pushChat(state, MUSH_CHANNEL, { from: null, isBot: false, text: "", system: { key: "mushConvertedCat", params: { name: player.character } } });
  }
}
