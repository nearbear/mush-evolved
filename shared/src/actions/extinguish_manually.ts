import { Action } from "./action.ts";
import { isOnFire } from "../fire.ts";
import { canReachItem, isWorking } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";
import { EXTINGUISHER_ITEM } from "../itemIds.ts";

export type ExtinguishManuallyActionData = { type: "extinguish_manually" };

/**
 * A Firefighter puts out the fire in their room without an extinguisher (owner, 2026-11-01, eMushpedia "Pompier"): 1 AP,
 * 50% x1.25 for each miss in a row (reset by a success), and a 50% chance of the random injury on every try, even a
 * miss (the base action's `injuryChance`), and 25% dirt (owner, 2026-11-25: eMush's). A success is public, a failure private. Not offered while an extinguisher is
 * within reach, since that never fails.
 */
export class ExtinguishManuallyAction extends Action<ExtinguishManuallyActionData> {
  constructor() {
    super("extinguish_manually");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.extinguish.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.extinguish.manual.chance;
  }

  override getFailureMultiplier(state: Readonly<GameState>): number {
    return state.config.extinguish.manual.failureMultiplier;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.extinguish.manual.injuryChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ExtinguishManuallyActionData[] {
    const target: ExtinguishManuallyActionData = { type: "extinguish_manually" };
    return this.validate(state, player) === null ? [target] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, _target?: ExtinguishManuallyActionData): string | null {
    if (!hasSkill(player, "fireman")) return "cant_extinguish";
    if (!isOnFire(state, player.room)) return "no_fire";
    if (state.items.some((item) => item.type === EXTINGUISHER_ITEM && isWorking(item) && canReachItem(state, player, item))) return "has_extinguisher";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.extinguish.manual.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    state.fires = state.fires.filter((room) => room !== player.room);
    logPublic(state, player.room, "fireExtinguished", { name: player.character });
  }

  override fail(state: GameState, player: PlayerState): void {
    logPrivate(state, player.id, "extinguishFailed");
  }
}
