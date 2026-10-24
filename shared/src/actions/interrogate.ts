import { Action, IN_PRESELECTION, peopleHere, type ActionTag } from "./action.ts";
import { damage } from "../death.ts";
import { revealHistory } from "../history.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type InterrogateActionData = { type: "interrogate"; target: string };

/**
 * The Torturer's (`torturer`) Interrogate (owner, 2026-10-24; eMushpedia Bourreau, actions.json TORTURE):
 * `interrogate.cost.ap` (1) AP, once a day (`PlayerState.interrogatedToday`, cleared at day start), a living person in
 * your room. They take `interrogate.damage` (1), always, past any damage modifier (0 HP kills, death.ts); then the
 * torturer learns their last X actions, X being their missing HP after the hit (history.ts). The interrogation is
 * public room history; what it reveals only the torturer sees. Aggressive, and it waits for Mush selection like Punch.
 */
export class InterrogateAction extends Action<InterrogateActionData> {
  override tags: readonly ActionTag[] = ["aggressive"];

  constructor() {
    super("interrogate");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.interrogate.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): InterrogateActionData[] {
    if (!hasSkill(player, "torturer") || player.interrogatedToday) return [];
    return peopleHere(state, player).map((o) => ({ type: "interrogate", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: InterrogateActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!hasSkill(player, "torturer")) return "no_skill";
    if (player.interrogatedToday) return "daily_cap";
    if (!peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: InterrogateActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    player.interrogatedToday = true;
    logPublic(state, player.room, "interrogated", { name: player.character, target: victim.character });
    damage(state, victim, state.config.interrogate.damage);
    revealHistory(state, player, victim, state.config.maxHp - victim.hp);
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.interrogate.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.interrogate.injuryChance;
  }
}
