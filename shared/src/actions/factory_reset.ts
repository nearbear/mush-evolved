import { Action, IN_PRESELECTION, type ActionVisibility, isString } from "./action.ts";
import { ITRACKIE_ITEM } from "../itemIds.ts";
import { itemsIn } from "../items.ts";
import { logPrivate } from "../log.ts";
import { resetHacksOn } from "../radioPiracy.ts";
import type { GameState, PlayerState } from "../types.ts";

export type FactoryResetActionData = { type: "factory_reset"; item: string };

/**
 * Factory reset of your own iTrackie (owner, 2026-11-18, radioPiracy.ts): `factoryReset.cost.ap` (1) AP, anyone with
 * their iTrackie in their inventory. It ends every Radio Piracy hack on it. Private: the resetter always gets the same
 * line, which never says whether there was a hack; each hacker who lost one gets a private line (`resetHacksOn`).
 */
export class FactoryResetAction extends Action<FactoryResetActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("factory_reset", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.factoryReset.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): FactoryResetActionData[] {
    return itemsIn(state, { kind: "player", id: player.id })
      .filter((i) => i.type === ITRACKIE_ITEM)
      .map((i) => ({ type: "factory_reset", item: i.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: FactoryResetActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    const carried = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.id === target.item && i.type === ITRACKIE_ITEM);
    return carried ? null : "no_such_item";
  }

  override apply(state: GameState, player: PlayerState): void {
    resetHacksOn(state, player);
    logPrivate(state, player.id, "factoryReset");
  }
}
