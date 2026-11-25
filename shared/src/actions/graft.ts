import { Action, type ActionCost, isString } from "./action.ts";
import { growCyclesFor, isPlanted, paidWithGardenPoint } from "../botany.ts";
import { ALIEN_FRUIT_ITEMS, canReachItem, hybridOf, removeItem } from "../items.ts";
import { logPublic } from "../log.ts";
import { clone } from "../helpers.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/** `item` is the planted pot (so the button sits on the plant's panel); `fruit` the alien fruit you hold. */
export type GraftActionData = { type: "graft"; item: string; fruit: string };

const isAlienSpecies = (type: string): boolean => (ALIEN_FRUIT_ITEMS as readonly string[]).includes(type);

/** The hybrid a fruit and a plant would make, or null when they can't be grafted (#438, owner 2026-11-21). */
function graftHybrid(state: Readonly<GameState>, fruit: Readonly<ItemState>, pot: Readonly<ItemState>): string | null {
  if (!isPlanted(pot) || !isAlienSpecies(fruit.type) || !isAlienSpecies(pot.plant.species)) return null;
  const hybrid = hybridOf(fruit.type, pot.plant.species);
  // A pair with no hybrid inside the value budget can't be grafted.
  return hybrid !== null && state.hybrids[hybrid] ? hybrid : null;
}

/** Whether `player` may graft the fruit onto the pot: a Botanist (not Skilful) holding the fruit, the pot in reach. */
function graftable(state: Readonly<GameState>, player: Readonly<PlayerState>, fruit: Readonly<ItemState>, pot: Readonly<ItemState>): boolean {
  return (
    hasSkill(player, "botanic") &&
    fruit.at.kind === "player" &&
    fruit.at.id === player.id &&
    canReachItem(state, player, pot) &&
    graftHybrid(state, fruit, pot) !== null
  );
}

/**
 * Graft (#438, owner 2026-11-21, eMush's rules with this game's hybrids): 2 AP, or a garden point on a plant in the
 * garden; Botanist only. You hold an alien fruit and target a planted alien pot of another species you can reach.
 * There is no roll: it fails when you are dirty or the plant is thirsty, dried or sick. On success the fruit is used up
 * and the plant becomes a young plant of the pair's hybrid (known from then on, in `state.fruits`); a Green Thumb's
 * starts with `graftHeadStart` of its grow time done. On failure the fruit and the plant are lost, leaving an empty
 * pot. A public room line either way.
 */
export class GraftAction extends Action<GraftActionData> {
  constructor() {
    super("graft", { item: isString, fruit: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): GraftActionData[] {
    if (!hasSkill(player, "botanic")) return [];
    const fruits = state.items.filter((i) => i.at.kind === "player" && i.at.id === player.id && isAlienSpecies(i.type));
    if (fruits.length === 0) return [];
    const pots = state.items.filter((i) => isPlanted(i) && canReachItem(state, player, i));
    return pots.flatMap((pot) =>
      fruits.filter((fruit) => graftable(state, player, fruit, pot)).map((fruit): GraftActionData => ({ type: "graft", item: pot.id, fruit: fruit.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: GraftActionData): string | null {
    const pot = state.items.find((i) => i.id === target.item);
    const fruit = state.items.find((i) => i.id === target.fruit);
    if (!pot || !fruit) return "no_such_item";
    return graftable(state, player, fruit, pot) ? null : "cant_graft";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: GraftActionData): ActionCost {
    const pot = state.items.find((i) => i.id === target.item);
    return paidWithGardenPoint(state, player, pot) ? { ap: 0, mp: 0, paidBy: "garden" } : { ap: state.config.botany.graft.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.graft.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: GraftActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    const plant = pot.plant!;
    const fruit = removeItem(state, target.fruit);
    const hybrid = hybridOf(fruit.type, plant.species)!;
    if (player.statuses.includes("dirty") || plant.thirst > 0 || plant.sick) {
      // "Something must have contaminated the operation": the fruit and the plant are lost, the pot stays.
      delete pot.plant;
      logPublic(state, player.room, "graftFailed", { name: player.character, item: plant.species });
      return;
    }
    state.fruits[hybrid] ??= clone(state.hybrids[hybrid]!);
    const age = hasSkill(player, "green_thumb") ? Math.floor(growCyclesFor(state, hybrid) * state.config.greenThumb.graftHeadStart) : 0;
    pot.plant = { species: hybrid, age, thirst: 0, sick: false };
    logPublic(state, player.room, "graftedPlant", { name: player.character, item: hybrid });
  }
}
