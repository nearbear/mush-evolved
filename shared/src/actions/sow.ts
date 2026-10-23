import { Action } from "./action.ts";
import { isEmptyPot, isFruit, paidWithGardenPoint } from "../botany.ts";
import { canReach } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SowActionData = { type: "sow"; item: string; fruit: string };

/**
 * Sow (owner, 2026-10-22): 2 AP, or a garden point in the garden. A fruit you carry goes into an empty hydropot you
 * can reach, which becomes a young plant of its species (age 0, healthy). The fruit is used up. Public room log.
 */
export class SowAction extends Action<SowActionData> {
  constructor() {
    super("sow");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SowActionData[] {
    const fruits = state.items.filter((i) => isFruit(i) && i.at.kind === "player" && i.at.id === player.id);
    const pots = state.items.filter((i) => isEmptyPot(i) && canReach(state, player, i.at));
    return pots.flatMap((pot) => fruits.map((fruit): SowActionData => ({ type: "sow", item: pot.id, fruit: fruit.id })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SowActionData): string | null {
    const pot = state.items.find((i) => i.id === target.item);
    const fruit = state.items.find((i) => i.id === target.fruit);
    if (!pot || !fruit) return "no_such_item";
    if (!isEmptyPot(pot) || !canReach(state, player, pot.at)) return "cant_sow";
    if (!isFruit(fruit) || fruit.at.kind !== "player" || fruit.at.id !== player.id) return "cant_sow";
    return null;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SowActionData): { ap: number; mp: number } {
    const pot = state.items.find((i) => i.id === target.item);
    return { ap: paidWithGardenPoint(state, player, pot) ? 0 : state.config.botany.sow.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: SowActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    if (paidWithGardenPoint(state, player, pot)) player.resources.garden -= 1;
    const species = state.items.find((i) => i.id === target.fruit)!.type;
    state.items = state.items.filter((i) => i.id !== target.fruit);
    pot.plant = { species, age: 0, thirst: 0, sick: false };
    logPublic(state, player.room, "sowedPlant", { name: player.character, item: species });
  }
}
