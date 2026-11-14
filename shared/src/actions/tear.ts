import { Action, isString } from "./action.ts";
import { canReachItem, removeItem } from "../items.ts";
import { DOCUMENT_ITEM } from "../lostAnalysis.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TearActionData = { type: "tear"; item: string };

/**
 * Tear up a document (#394, owner 2026-11-13): free, on a document you hold or that is on your room's floor. It is
 * destroyed for good. Public room log. Reading it is client-only (the rows travel on the item in views).
 */
export class TearAction extends Action<TearActionData> {
  constructor() {
    super("tear", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TearActionData[] {
    return state.items.filter((item) => item.type === DOCUMENT_ITEM && canReachItem(state, player, item)).map((item) => ({ type: "tear", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TearActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== DOCUMENT_ITEM || !canReachItem(state, player, item)) return "no_such_item";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TearActionData): void {
    removeItem(state, target.item);
    logPublic(state, player.room, "documentTorn", { name: player.character });
  }
}
