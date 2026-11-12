import { Action, IN_PRESELECTION, peopleHere, type ActionTag, isString } from "./action.ts";
import { damage } from "../death.ts";
import { isInactive } from "../inactivity.ts";
import { logPublic } from "../log.ts";
import { punchDamage } from "../modifiers.ts";
import { roll, rollFloat } from "../rng.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PunchActionData = { type: "punch"; target: string };

/**
 * Punch (issue 29, confirmed 2026-10-15): 1 AP, a living person in your room (never yourself), misses
 * `punchMissOdds` of the time. A hit removes a uniform roll in `punch.effect.damage` (1 to 2), or in `punch.crit.damage` (2 to 3) with `punch.crit.chance`, folded through `punchDamage`, in HP (0 HP kills; see death.ts). Both outcomes
 * are public room history.
 */
export class PunchAction extends Action<PunchActionData> {
  override tags: readonly ActionTag[] = ["aggressive", "melee"];

  constructor() {
    super("punch", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.punch.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, _player: Readonly<PlayerState>, target: PunchActionData): number {
    const victim = state.players.find((o) => o.id === target.target);
    // An inactive target is easier to hit (owner, 2026-10-31, #145).
    return victim && isInactive(victim) ? state.config.punch.inactiveTargetSuccessChance : state.config.punch.successChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PunchActionData[] {
    return peopleHere(state, player).map((o) => ({ type: "punch", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PunchActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: PunchActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    const crit = rollFloat(state) < state.config.punch.crit.chance;
    const amount = roll(state, crit ? state.config.punch.crit.damage : state.config.punch.effect.damage);
    logPublic(state, player.room, crit ? "punchCrit" : "punched", { name: player.character, target: victim.character });
    damage(state, victim, punchDamage(state, player, amount), "assassinated");
  }

  override fail(state: GameState, player: PlayerState, target: PunchActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!;
    logPublic(state, player.room, "punchMissed", { name: player.character, target: victim.character });
  }

  override dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PunchActionData): number {
    return state.config.punch.dirtyChance;
  }
}
