import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { hasSpace } from "../items.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SearchActionData = { type: "search" };

/**
 * Searches the room for hidden items (owner, 2026-10-25, from the wiki): always offered, so the offer says nothing
 * about what is hidden. It finds every hidden item in the room, whoever hid it; each goes into the searcher's
 * inventory while there is space, and otherwise stays in the room's storage, no longer hidden.
 */
export class SearchAction extends Action<SearchActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("search");
  }

  override getCandidates(): SearchActionData[] {
    return [{ type: "search" }];
  }

  override validate(state: Readonly<GameState>): string | null {
    return state.preselection ? IN_PRESELECTION : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.search.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    const found = state.items.filter((i) => i.hiddenBy !== undefined && i.at.kind === "room" && i.at.id === player.room);
    if (found.length === 0) {
      logSecret(state, player.id, "searchedNothing", { name: player.character });
      return;
    }
    const mine = { kind: "player", id: player.id } as const;
    for (const item of found) {
      delete item.hiddenBy;
      if (hasSpace(state, mine)) item.at = mine;
      logSecret(state, player.id, "foundHidden", { name: player.character, item: item.type });
    }
  }
}
