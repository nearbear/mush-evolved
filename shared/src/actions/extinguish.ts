import { Action, isString } from "./action.ts";
import { isOnFire } from "../fire.ts";
import { canReachItem } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ExtinguishActionData = { type: "extinguish"; item: string };

export const EXTINGUISHER_ITEM = "extinguisher";

/**
 * Put out the fire in your room with an extinguisher you can reach, carried or on the floor (owner, 2026-10-25,
 * eMushpedia "Extincteur"): 1 AP, 50%. The extinguisher isn't used up. A success is public in the room, a failure
 * private. A Firefighter never fails with one (owner, 2026-11-01), but risks the random injury on every try (the owner chose this over the wiki, where only the manual try hurts).
 */
export class ExtinguishAction extends Action<ExtinguishActionData> {
  constructor() {
    super("extinguish", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.extinguish.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    return hasSkill(player, "fireman") ? 1 : state.config.extinguish.chance;
  }

  override injuryChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    return hasSkill(player, "fireman") ? state.config.extinguish.firefighterInjuryChance : 0;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ExtinguishActionData[] {
    if (!isOnFire(state, player.room)) return [];
    return state.items
      .filter((item) => item.type === EXTINGUISHER_ITEM && canReachItem(state, player, item))
      .map((item): ExtinguishActionData => ({ type: "extinguish", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ExtinguishActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (item.type !== EXTINGUISHER_ITEM || !canReachItem(state, player, item)) return "cant_extinguish";
    if (!isOnFire(state, player.room)) return "no_fire";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    state.fires = state.fires.filter((room) => room !== player.room);
    logPublic(state, player.room, "fireExtinguished", { name: player.character });
  }

  override fail(state: GameState, player: PlayerState): void {
    logPrivate(state, player.id, "extinguishFailed");
  }
}
