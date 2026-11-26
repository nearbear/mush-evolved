import { Action, isString, type ActionVisibility } from "./action.ts";
import { findPlayer } from "../helpers.ts";
import { logPrivate } from "../log.ts";
import { swapSeats } from "../mind.ts";
import type { GameState, PlayerId, PlayerState } from "../types.ts";

export type SwapCharacterActionData = { type: "swap_character"; crewmate: PlayerId };

/**
 * The swapCharacter development cheat (cheats.ts), not a game rule: like Transfer, but free, instant, unlimited
 * and on any other living crewmate anywhere aboard. Only the seats move (`swapSeats`): you take over their
 * character whole (role, stats, skills, items, room) and they take over yours. The cheat is a seat field, so it
 * comes with you. Private: each of the two gets one log line.
 *
 * The field is `crewmate`, not `target`, so `actionTarget()` doesn't walk you up to someone who may be in another
 * room (as with issue_mission's `subordinate`).
 */
export class SwapCharacterAction extends Action<SwapCharacterActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;

  constructor() {
    super("swap_character", { crewmate: isString });
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SwapCharacterActionData[] {
    if (!player.cheats.includes("swapCharacter")) return [];
    return state.players.filter((o) => o.id !== player.id && o.alive).map((o): SwapCharacterActionData => ({ type: "swap_character", crewmate: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, action: SwapCharacterActionData): string | null {
    if (!player.cheats.includes("swapCharacter")) return "no_cheat";
    const other = findPlayer(state, action.crewmate);
    if (!other || other.id === player.id || !other.alive) return "invalid_crewmate";
    return null;
  }

  override apply(state: GameState, player: PlayerState, action: SwapCharacterActionData): void {
    const other = findPlayer(state, action.crewmate);
    if (!other) return;
    swapSeats(state, player, other);
    // You now play `other`; whoever played it now plays `player`.
    logPrivate(state, other.id, "characterSwapped", { target: other.character });
    logPrivate(state, player.id, "characterSwappedWith", { target: other.character });
  }
}
