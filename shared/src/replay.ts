// Recording and replaying games (decided 2026-10-14, docs/rules-design.md
// "Replays"). A game is its setup plus the ordered inputs the server accepted;
// the rules are pure, so running the inputs again rebuilds every state.
// Every state change must go through applyInput, or it won't be in the record.

import type { GameClientMessage } from "./protocol.ts";
import { applyAction, createChannel, createGame, inviteToChannel, leaveChannel, sendChat, setActopiCheat, setCheat, type ActionResult } from "./rules.ts";
import type { GameConfig, GameState, PlayerId, Role, Seat } from "./types.ts";

/** What createGame needed, plus which rules produced the game. */
export interface GameSetup {
  seats: Seat[];
  config: GameConfig;
  seed: number;
  /**
   * Build of the rules that ran this game (a commit hash in production, "dev"
   * locally). Replaying under other rules can diverge; checking out this
   * commit rebuilds the game exactly.
   */
  rulesVersion: string;
  /** Testing only: seats whose role was forced from the lobby (needs ALLOW_CHEATS). */
  forcedRoles?: Record<PlayerId, Role>;
}

/**
 * One accepted change to the game. Chat and channel names hold the text after
 * moderation, which is what the rules saw. Server-driven inputs (cycle ticks,
 * scheduled plans) will join this union without a `by`.
 */
export type Input = GameClientMessage & { by: PlayerId };

export function startGame(setup: GameSetup): GameState {
  return createGame(setup.seats, setup.config, setup.seed, setup.forcedRoles);
}

/** The single entry point for changing a game. */
export function applyInput(state: GameState, input: Input): ActionResult {
  switch (input.type) {
    case "action":
      return applyAction(state, input.by, input.action);
    case "chat":
      return sendChat(state, input.by, input.channel, input.text);
    case "createChannel":
      return createChannel(state, input.by, input.name);
    case "invite":
      return inviteToChannel(state, input.by, input.channel, input.player);
    case "leaveChannel":
      return leaveChannel(state, input.by, input.channel);
    case "cheat":
      return setCheat(state, input.by, input.cheat, input.on);
    case "actopiCheat":
      return setActopiCheat(state, input.by, input.mode);
  }
}

/**
 * Rebuilds a game from its record. Every recorded input was accepted when it
 * happened, so a rejection here means the rules aren't the ones that ran the
 * game (or aren't deterministic), and the replay can't be trusted.
 */
export function replayGame(setup: GameSetup, inputs: readonly Input[]): GameState {
  let state = startGame(setup);
  for (const [i, input] of inputs.entries()) {
    const result = applyInput(state, input);
    if (!result.ok) throw new Error(`Replay diverged at input ${i} (${input.type}): ${result.error}`);
    state = result.state;
  }
  return state;
}
