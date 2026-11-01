import { Action, type ActionVisibility } from "./action.ts";
import { produceItem } from "../items.ts";
import { logPrivate } from "../log.ts";
import { rollWeighted } from "../rng.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SnoopActionData = { type: "snoop" };

/**
 * The Scrapper's (`metaliciste`) Snoop (owner, 2026-11-01; eMushpedia Terrence Archer, "Métalo"): in a storage room
 * (`snoop.rooms`), once a day per room (`PlayerState.snoopedToday`, cleared at day start), for `snoop.cost.ap` (0) AP,
 * always succeeds. It makes one new item, picked from `snoop.items` by weight (eMushpedia "Recycleur": metal scraps 4,
 * plastic scraps 3, an uncooked ration, a fuel capsule and an oxygen capsule 1 each), into your inventory, or onto the
 * floor if it is full. `snoop.dirtyChance` (50%) to get dirty and `snoop.injuryChance` (10%) of the 2 HP random
 * injury, rolled by performAction like any action's. Private to the actor.
 * Unlike Search, nothing was there before: the item is created.
 */
export class SnoopAction extends Action<SnoopActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("snoop");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SnoopActionData[] {
    return this.reason(state, player) === null ? [{ type: "snoop" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return this.reason(state, player);
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.snoop.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.snoop.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.snoop.injuryChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.snoopedToday = [...(player.snoopedToday ?? []), player.room];
    const found = state.config.snoop.items;
    const kinds = Object.keys(found);
    const kind = kinds[rollWeighted(state, kinds.map((k) => found[k]!))]!;
    const { item, inInventory } = produceItem(state, player, kind);
    logPrivate(state, player.id, inInventory ? "snooped" : "snoopedKnocked", { item: item.type });
  }

  private reason(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "metaliciste")) return "no_skill";
    if (!state.config.snoop.rooms.includes(player.room)) return "not_storage";
    if (player.snoopedToday?.includes(player.room)) return "daily_cap";
    return null;
  }
}
