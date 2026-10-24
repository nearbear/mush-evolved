// Recording and replaying games (decided 2026-10-14, docs/rules-design.md
// "Replays"). A game is its setup plus the ordered inputs the server accepted;
// the rules are pure, so running the inputs again rebuilds every state.
// Every state change must go through applyInput, or it won't be in the record.

import type { GameClientMessage } from "./protocol.ts";
import { joinShip } from "./preselection.ts";
import { createGame, newCycle, setActopiCheat, setCheat, setRoleCheat, type ActionResult } from "./rules.ts";
import { clearQueue, queueAction, tick } from "./queue.ts";
import { walk } from "./spot.ts";
import { createChannel, createThread, inviteToChannel, leaveChannel, sendChat, toggleCheckbox } from "./chat.ts";
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
  /** The cycle of day 1 the ship launched in, from the UTC clock (#24). 1 if left out. */
  startCycle?: number;
}

/**
 * One accepted change to the game. Chat and channel names hold the text after
 * moderation, which is what the rules saw. An action carries the server time
 * it arrived (`at`), and `tick` is the server saying time has reached `at`
 * (queue.ts); the rules read no clock of their own. `cycle` is the server's
 * clock passing a cycle boundary (#24). Other server-driven inputs (scheduled
 * plans) will join this union without a `by`.
 */
export type Input =
  | (Exclude<GameClientMessage, { type: "action" }> & { by: PlayerId })
  | (Extract<GameClientMessage, { type: "action" }> & { by: PlayerId; at: number })
  | { type: "tick"; at: number }
  | { type: "cycle" }
  | { type: "join"; seat: Seat };

export function startGame(setup: GameSetup): GameState {
  return createGame(setup.seats, setup.config, setup.seed, setup.forcedRoles, setup.startCycle);
}

/** The single entry point for changing a game. */
export function applyInput(state: GameState, input: Input): ActionResult {
  switch (input.type) {
    case "action":
      return queueAction(state, input.by, input.action, input.at);
    case "clearQueue":
      return clearQueue(state, input.by);
    case "tick":
      return tick(state, input.at);
    case "cycle":
      return newCycle(state);
    case "join":
      return joinShip(state, input.seat);
    case "chat":
      return sendChat(state, input.by, input.channel, input.text);
    case "toggleCheckbox":
      return toggleCheckbox(state, input.by, input.message, input.line);
    case "createChannel":
      return createChannel(state, input.by, input.name, input.members);
    case "createThread":
      return createThread(state, input.by, input.name, input.from);
    case "invite":
      return inviteToChannel(state, input.by, input.channel, input.player);
    case "leaveChannel":
      return leaveChannel(state, input.by, input.channel);
    case "cheat":
      return setCheat(state, input.by, input.cheat, input.on);
    case "actopiCheat":
      return setActopiCheat(state, input.by, input.mode);
    case "walk":
      return walk(state, input.by, input.x, input.y, input.sitting, input.behind);
    case "roleCheat":
      return setRoleCheat(state, input.by, input.role);
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
