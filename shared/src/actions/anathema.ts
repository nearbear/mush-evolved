import { Action, peopleHere } from "./action.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type AnathemaActionData = { type: "anathema"; target: string };

/**
 * Anathema, the Persecutor's (`juge`) action (owner, 2026-10-24, eMushpedia): `anathema.cost.ap` (1), on a living
 * other player in your room, Mush included. The target becomes an **Outcast** (`PlayerState.outcastBy` = you): their
 * actions that roll succeed at `anathema.successFactor` (x0.8, `actionSuccessRate`), and their covert and secret
 * actions are logged publicly (`logCovert`, `logSecret`, `activitySeen`). One Outcast per Persecutor: a new curse moves
 * it. It ends when either of them dies (`endAnathemaOnDeath`). No daily or per-game limit. The `outcast` status is
 * public to the room; the Persecutor's identity is never sent. Public room log.
 */
export class AnathemaAction extends Action<AnathemaActionData> {
  constructor() {
    super("anathema");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.anathema.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AnathemaActionData[] {
    if (!hasSkill(player, "juge")) return [];
    return peopleHere(state, player)
      .filter((o) => o.outcastBy !== player.id)
      .map((o) => ({ type: "anathema", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AnathemaActionData): string | null {
    if (!hasSkill(player, "juge")) return "no_skill";
    const victim = peopleHere(state, player).find((o) => o.id === target.target);
    if (!victim) return "cant_see";
    if (victim.outcastBy === player.id) return "already_outcast";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AnathemaActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    for (const o of state.players) if (o.outcastBy === player.id) delete o.outcastBy;
    victim.outcastBy = player.id;
    logPublic(state, player.room, "anathema", { name: player.character, target: victim.character });
  }
}

/** Ends the curse when either side dies (death.ts). No log line: the death line says enough. */
export function endAnathemaOnDeath(state: GameState, dead: PlayerState): void {
  delete dead.outcastBy;
  for (const o of state.players) if (o.outcastBy === dead.id) delete o.outcastBy;
}
