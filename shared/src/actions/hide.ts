import { Action, IN_PRESELECTION, type ActionVisibility, isString } from "./action.ts";
import { ITEM_TYPES } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type HideActionData = { type: "hide"; item: string };

/** The items this player carries that can be hidden: anything they could drop (not the camera) whose type allows it (not a drone). */
function hideable(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return state.items.filter((i) => i.at.kind === "player" && i.at.id === player.id && ITEM_TYPES[i.type]?.canDrop !== false && ITEM_TYPES[i.type]?.canHide !== false);
}

/**
 * Hides a carried item in the room's storage (owner, 2026-10-25, from the wiki). Only the hider sees it there,
 * and it stays active (counts for research, rings alarms, grows). `search` finds it.
 */
export class HideAction extends Action<HideActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("hide", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): HideActionData[] {
    return hideable(state, player).map((item) => ({ type: "hide", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HideActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    return hideable(state, player).some((i) => i.id === target.item) ? null : "cant_hide";
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.hide.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: HideActionData): void {
    const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    item.at = { kind: "room", id: player.room };
    item.hiddenBy = player.id;
    logSecret(state, player.id, "hid", { name: player.character, item: item.type });
  }
}
