import { Action } from "./action.ts";
import { BLUEPRINTS, BLUEPRINT_ITEM } from "../blueprints.ts";
import { canReach, itemsIn, produceItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type BuildActionData = { type: "build"; item: string };

/**
 * The items that would be consumed for a blueprint, or null if an ingredient is missing. Ingredients are the
 * player's inventory and the room's floor (decided 2026-10-16); the floor is used first, so carried items are kept
 * when either would do.
 */
function ingredients(state: Readonly<GameState>, player: Readonly<PlayerState>, blueprint: Readonly<ItemState>): ItemState[] | null {
  const recipe = blueprint.builds === undefined ? undefined : BLUEPRINTS[blueprint.builds];
  if (!recipe) return null;
  const pool = [...itemsIn(state, { kind: "room", id: player.room }), ...itemsIn(state, { kind: "player", id: player.id })].filter((i) => i.id !== blueprint.id);
  const used: ItemState[] = [];
  for (const type of recipe.needs) {
    const found = pool.find((i) => i.type === type && !used.includes(i));
    if (!found) return null;
    used.push(found);
  }
  return used;
}

/**
 * Build (decided 2026-10-16): anyone, anywhere, 3 AP, no failure chance. Uses up the blueprint and its
 * ingredients and produces the result (equipment in the room, or an item for the builder). Public room log.
 */
export class BuildAction extends Action<BuildActionData> {
  constructor() {
    super("build");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.build.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BuildActionData[] {
    return state.items.filter((i) => i.type === BLUEPRINT_ITEM && canReach(state, player, i.at) && ingredients(state, player, i)).map((i) => ({ type: "build", item: i.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: BuildActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (item.type !== BLUEPRINT_ITEM || !canReach(state, player, item.at)) return "cant_build";
    if (!ingredients(state, player, item)) return "missing_ingredients";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: BuildActionData): void {
    const blueprint = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    const used = new Set([blueprint.id, ...ingredients(state, player, blueprint)!.map((i) => i.id)]);
    state.items = state.items.filter((i) => !used.has(i.id));
    const makes = BLUEPRINTS[blueprint.builds!]!.makes;
    if ("equipment" in makes) {
      // Built equipment lives in the config's per-room list, like the equipment from the map.
      (state.config.equipment[player.room] ??= []).push({ id: `${player.room}:${makes.equipment}:${state.nextItemId++}`, type: makes.equipment });
      logPublic(state, player.room, "built", { name: player.character, equipment: makes.equipment });
    } else {
      produceItem(state, player, makes.item);
      logPublic(state, player.room, "builtItem", { name: player.character, item: makes.item });
    }
  }
}
