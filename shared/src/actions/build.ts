import { Action, isString } from "./action.ts";
import { BLUEPRINTS } from "../blueprints.ts";
import { canReachItem, itemsIn, produceItem, visibleItemsIn, isWorking } from "../items.ts";
import { BLUEPRINT_ITEM, MASTER_BLUEPRINT_ITEM, SUPPORT_DRONE_ITEM } from "../itemIds.ts";
import { logPublic } from "../log.ts";
import { initNpc } from "../npcs.ts";
import { offShip } from "../patrol.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/** `recipe` only with the master blueprint (a development cheat): which of BLUEPRINTS to build. */
export type BuildActionData = { type: "build"; item: string } | { type: "build"; item: string; recipe: string };

/** The recipe key a build makes: the blueprint's own, or for the master blueprint the one the action names. */
function recipeOf(blueprint: Readonly<ItemState>, target: BuildActionData): string | undefined {
  if (blueprint.type === MASTER_BLUEPRINT_ITEM) return "recipe" in target && Object.hasOwn(BLUEPRINTS, target.recipe) ? target.recipe : undefined;
  return "recipe" in target ? undefined : blueprint.builds;
}

/**
 * The items that would be consumed for a blueprint, or null if an ingredient is missing. Ingredients are the
 * player's inventory and the room's floor (decided 2026-10-16); the floor is used first, so carried items are kept
 * when either would do.
 */
function ingredients(state: Readonly<GameState>, player: Readonly<PlayerState>, blueprint: Readonly<ItemState>, target: BuildActionData): ItemState[] | null {
  const key = recipeOf(blueprint, target);
  const recipe = key === undefined ? undefined : BLUEPRINTS[key];
  if (!recipe) return null;
  // The master blueprint (development cheat, owner 2026-11-26) needs nothing.
  if (blueprint.type === MASTER_BLUEPRINT_ITEM) return [];
  const pool = [...visibleItemsIn(state, { kind: "room", id: player.room }, player), ...itemsIn(state, { kind: "player", id: player.id })].filter((i) => i.id !== blueprint.id && isWorking(i));
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
 * The master blueprint (Superkube only, development cheat, owner 2026-11-26) offers every recipe, needs no
 * ingredients and is kept; the AP cost is the same.
 */
export class BuildAction extends Action<BuildActionData> {
  constructor() {
    super("build", { item: isString });
  }

  override parse(raw: Readonly<Record<string, unknown>>): BuildActionData | null {
    const action = super.parse(raw);
    if (!action || raw.recipe === undefined) return action;
    return isString(raw.recipe) ? { ...action, recipe: raw.recipe } : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.build.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BuildActionData[] {
    if (offShip(player.room)) return [];
    const out: BuildActionData[] = [];
    for (const i of state.items) {
      if (!canReachItem(state, player, i)) continue;
      if (i.type === BLUEPRINT_ITEM) {
        const data: BuildActionData = { type: "build", item: i.id };
        if (ingredients(state, player, i, data)) out.push(data);
      } else if (i.type === MASTER_BLUEPRINT_ITEM) {
        for (const recipe of Object.keys(BLUEPRINTS)) out.push({ type: "build", item: i.id, recipe });
      }
    }
    return out;
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: BuildActionData): string | null {
    if (offShip(player.room)) return "in_patrol_ship";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if ((item.type !== BLUEPRINT_ITEM && item.type !== MASTER_BLUEPRINT_ITEM) || !canReachItem(state, player, item)) return "cant_build";
    if (recipeOf(item, target) === undefined) return "cant_build";
    if (!ingredients(state, player, item, target)) return "missing_ingredients";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.build.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.build.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: BuildActionData): void {
    const blueprint = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    const kept = blueprint.type === MASTER_BLUEPRINT_ITEM;
    const used = new Set([...(kept ? [] : [blueprint.id]), ...ingredients(state, player, blueprint, target)!.map((i) => i.id)]);
    state.items = state.items.filter((i) => !used.has(i.id));
    const makes = BLUEPRINTS[recipeOf(blueprint, target)!]!.makes;
    if ("equipment" in makes) {
      // Built equipment joins the per-room list, beside the equipment from the map.
      (state.equipment[player.room] ??= []).push({ id: `${player.room}:${makes.equipment}:${state.nextItemId++}`, type: makes.equipment });
      logPublic(state, player.room, "built", { name: player.character, equipment: makes.equipment });
    } else {
      const built = produceItem(state, player, makes.item).item;
      initNpc(state, built);
      if (built.type === SUPPORT_DRONE_ITEM) built.owner = player.id;
      logPublic(state, player.room, "builtItem", { name: player.character, item: makes.item });
    }
  }
}
