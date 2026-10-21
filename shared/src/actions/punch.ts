import { Action, peopleHere, type ActionTag } from "./action.ts";
import { damage } from "../death.ts";
import { logPublic } from "../log.ts";
import { punchDamage } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PunchActionData = { type: "punch"; target: string };

/**
 * Punch (issue 29, confirmed 2026-10-15): 1 AP, a living person in your room (never yourself), misses
 * `punchMissOdds` of the time. A hit removes `punchDamage` HP (0 HP kills; see death.ts). Both outcomes
 * are public room history.
 */
export class PunchAction extends Action<PunchActionData> {
  override tags: readonly ActionTag[] = ["aggressive"];

  constructor() {
    super("punch");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.punch.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.punch.successChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PunchActionData[] {
    return peopleHere(state, player).map((o) => ({ type: "punch", target: o.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PunchActionData): string | null {
    if (!peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: PunchActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    logPublic(state, player.room, "punched", { name: player.character, target: victim.character });
    damage(state, victim, punchDamage(state, player));
  }

  override fail(state: GameState, player: PlayerState, target: PunchActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!;
    logPublic(state, player.room, "punchMissed", { name: player.character, target: victim.character });
  }

  override dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PunchActionData): number {
    return state.config.punch.dirtyChance;
  }
}
