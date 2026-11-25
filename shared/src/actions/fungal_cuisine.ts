import { Action, IN_PRESELECTION, type ActionCost, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { ITEM_TYPES, canReachItem } from "../items.ts";
import { logPrivate } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type FungalCuisineActionData = { type: "fungal_cuisine"; item: string };

/**
 * Fungal cuisine, the Mush skill `fungus_cook` (owner, 2026-10-24, rules-design.md; eMushpedia `Cuisine fongique`):
 * for `fungalCuisine.cost.ap` and 1 spore, a Mush adds one contamination level (`ItemState.spores`) to an edible item
 * they can reach. Levels stack. A human who eats it is contaminated by that many levels (`consume.ts`). Private: only
 * the Mush gets a log line, no camera or roommate sees it, but myco-alarms ring (`spore` tag). Cooking the item
 * destroys the spores.
 */
export class FungalCuisineAction extends Action<FungalCuisineActionData> {
  override visibility: ActionVisibility = "private";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("fungal_cuisine", { item: isString });
  }

  /** A Cook point (`resources.cook`) makes one use free, like Cook. */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.cook > 0 ? { ap: 0, mp: 0, paidBy: "cook" } : { ap: state.config.fungalCuisine.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): FungalCuisineActionData[] {
    if (player.role !== "mush" || !hasSkill(player, "fungus_cook") || player.spores < 1) return [];
    return state.items.filter((item) => ITEM_TYPES[item.type]?.consume && canReachItem(state, player, item)).map((item) => ({ type: "fungal_cuisine", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: FungalCuisineActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "fungus_cook")) return "no_skill";
    if (player.spores < 1) return "no_spores";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.consume || !canReachItem(state, player, item)) return "cant_consume";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: FungalCuisineActionData): void {
    const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    player.spores -= 1;
    item.spores = (item.spores ?? 0) + 1;
    logPrivate(state, player.id, "fungalCooked", { item: item.type, level: item.spores });
  }
}
