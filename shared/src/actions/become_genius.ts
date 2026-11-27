import { Action, type ActionVisibility } from "./action.ts";
import { hasSkill } from "../skills.ts";
import { addStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type BecomeGeniusActionData = { type: "become_genius" };

/**
 * Eureka moment, granted by the Genius skill (owner, 2026-11-05): free, once per game. Gives the private `genius` status,
 * which makes the next Research or Project the holder works on finish at once, and the next repair (repair.ts, repair_hull.ts; not PILGRED's) certain (they consume it). The
 * status lasts until used. Private: no room log line.
 */
export class BecomeGeniusAction extends Action<BecomeGeniusActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("become_genius");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): BecomeGeniusActionData[] {
    return this.validate(_state, player) === null ? [{ type: "become_genius" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "genius")) return "no_skill";
    return player.geniusUsed ? "genius_used" : null;
  }

  override apply(_state: GameState, player: PlayerState): void {
    player.geniusUsed = true;
    addStatus(player, "genius");
  }
}
