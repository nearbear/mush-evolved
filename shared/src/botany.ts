// Botany, Pass 1 (owner, 2026-10-22; docs/scratchpad/botany-plan.md): plants grow in hydropots, anywhere, carried
// too. Thirst is public; sickness is hidden from everyone outside the Botanist role. No plant dies yet: a plant left
// unwatered stops at dried, and a sick one stays sick until treated.

import { ITEM_TYPES, TREE_POT_ITEM, produceItem } from "./items.ts";
import { logPublic } from "./log.ts";
import { nextFloat } from "./rng.ts";
import { hasSkill } from "./skills.ts";
import type { GameState, ItemState, ItemView, PlantState, PlayerState, RoomId } from "./types.ts";

export type PlantedPot = ItemState & { plant: PlantState };

/**
 * Who sees plant sickness (and so may treat only a sick plant): the Botanist and the Skilful, Mush or not
 * (owner, 2026-10-22). Being Mush grants nothing. The view, `treat` and the UI all ask here.
 */
export function isBotanistRole(player: Readonly<PlayerState>): boolean {
  return hasSkill(player, "botanic") || hasSkill(player, "skilful");
}

export const isPot = (item: Readonly<ItemState>): boolean => item.type === TREE_POT_ITEM;

export const isPlanted = (item: Readonly<ItemState>): item is PlantedPot => isPot(item) && item.plant !== undefined;

export const isEmptyPot = (item: Readonly<ItemState>): boolean => isPot(item) && item.plant === undefined;

export const isFruit = (item: Readonly<ItemState>): boolean => !!ITEM_TYPES[item.type]?.fruit;

/** The room a pot is in: its own, or its carrier's. */
export function potRoom(state: Readonly<GameState>, pot: Readonly<ItemState>): RoomId {
  if (pot.at.kind === "room") return pot.at.id;
  const carrier = state.players.find((p) => p.id === pot.at.id);
  return carrier!.room;
}

/** Garden points pay for a botany action only on a plant in the garden (owner, 2026-10-22), when the actor has one. */
export function paidWithGardenPoint(state: Readonly<GameState>, player: Readonly<PlayerState>, pot: Readonly<ItemState> | undefined): boolean {
  return player.resources.garden > 0 && pot !== undefined && potRoom(state, pot) === state.config.botany.gardenRoom;
}

/** A pot's plant as `viewer` may see it: sickness only for the Botanist role. */
export function plantView(plant: Readonly<PlantState>, viewer: Readonly<PlayerState>): NonNullable<ItemView["plant"]> {
  const { species, age, thirst, sick } = plant;
  return { species, age, thirst, ...(isBotanistRole(viewer) && { sick }) };
}

/**
 * At every cycle change: young plants age by one, and each healthy plant, young or adult, may fall sick
 * (`sickChancePerCycle`, seeded). Mutates a state the caller already cloned.
 */
export function botanyCycle(state: GameState): void {
  for (const pot of state.items) {
    if (!isPlanted(pot)) continue;
    const { plant } = pot;
    if (plant.age !== null) plant.age += 1;
    if (plant.sick) continue;
    const [roll, rng] = nextFloat(state.rng);
    state.rng = rng;
    if (roll < state.config.botany.sickChancePerCycle) plant.sick = true;
  }
}

/**
 * At day start, after `botanyCycle`: young plants that have had their cycles become adult; each adult plant that
 * is not thirsty, dried or sick gives oxygen (up to the ship's max) and one fruit of its species; then every plant
 * gets thirstier, stopping at dried. Mutates a state the caller already cloned.
 */
export function botanyDay(state: GameState): void {
  const { botany, ship } = state.config;
  for (const pot of state.items.filter(isPlanted)) {
    const { plant } = pot;
    const room = potRoom(state, pot);
    if (plant.age !== null && plant.age >= (botany.growCycles[plant.species] ?? 0)) {
      plant.age = null;
      logPublic(state, room, "plantMatured", { item: plant.species });
    }
    if (plant.age === null && plant.thirst === 0 && !plant.sick) {
      state.ship.oxygen = Math.min(ship.oxygen.max, state.ship.oxygen + botany.oxygenPerPlant);
      produceFruit(state, pot);
      logPublic(state, room, "plantProduced", { item: plant.species });
    }
    plant.thirst = Math.min(2, plant.thirst + 1) as PlantState["thirst"];
  }
}

/** A floor pot's fruit lands beside it; a carried pot's goes to the carrier (inventory, else their room's floor). */
function produceFruit(state: GameState, pot: PlantedPot): void {
  const { species } = pot.plant;
  if (pot.at.kind === "player") {
    const carrier = state.players.find((p) => p.id === pot.at.id)!;
    produceItem(state, carrier, species);
    return;
  }
  state.items.push({ id: `item-${state.nextItemId++}`, type: species, at: { kind: "room", id: pot.at.id } });
}
