import { Action, type ActionVisibility } from "./action.ts";
import { onExpedition, sabotage } from "../expeditions.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SabotageExpeditionActionData = { type: "sabotage_expedition" };

/**
 * The Traitor's Sabotage (Mush skill `traitor`; owner, 2026-11-08, #358, docs/plans/expedition.md): free, for a holder
 * still with the crew of the expedition under way, once per expedition. The next sector only draws negative events
 * (`sabotage`; owner, 2026-11-17). Secret in the strongest sense: no log line, no bar anyone sees, and kept out of the action history
 * that Interrogate and Chitchat reveal ("nothing records it anywhere").
 */
export class SabotageExpeditionAction extends Action<SabotageExpeditionActionData> {
  override visibility: ActionVisibility = "private";
  override recorded = false;

  constructor() {
    super("sabotage_expedition");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SabotageExpeditionActionData[] {
    return this.validate(state, player) === null ? [{ type: "sabotage_expedition" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "traitor")) return "no_skill";
    if (!onExpedition(state, player)) return "not_on_expedition";
    if (state.expedition!.sabotaged) return "already_sabotaged";
    return null;
  }

  override apply(state: GameState): void {
    sabotage(state);
  }
}
