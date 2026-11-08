// Recording and replaying games (decided 2026-10-14, docs/rules/rules-design.md
// "Replays"). A game is its setup plus the ordered inputs the server accepted;
// the rules are pure, so running the inputs again rebuilds every state.
// Every state change must go through applyInput, or it won't be in the record.

import type { GameClientMessage } from "./protocol.ts";
import { joinShip } from "./preselection.ts";
import { acknowledgeTransfer } from "./mind.ts";
import { createGame, newCycle, setCheat, setRoleCheat, solCheat, type ActionResult } from "./rules.ts";
import { clearQueue, dropQueues, queueAction, tick } from "./queue.ts";
import { walk } from "./spot.ts";
import { createChannel, createThread, inviteToChannel, leaveChannel, sendChat, takeChatOutbox, toggleCheckbox } from "./chat.ts";
import { sharePlanet } from "./sharedPlanets.ts";
import { postPlan } from "./plans.ts";
import { inactivate, seen } from "./inactivity.ts";
import type { ConfigOverrides, GameConfig, GameState, PlayerId, Role, Seat } from "./types.ts";
import type { HistoryStep } from "./viewHistory.ts";

/** What createGame needed, plus which rules produced the game. */
export interface GameSetup {
  seats: Seat[];
  /** The config at launch. A live game resolves its config again on each load, so it can drift from this. */
  config: GameConfig;
  /** What the launch asked for, which `config` was resolved from (provenance only). Missing on older games. */
  overrides?: ConfigOverrides;
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
  /** Server time it launched (ms), which stamps the first log lines. Missing on older games. */
  launchedAt?: number;
}

/** One entry of the server's record: an input and the server time it was accepted (ms). */
export interface RecordedInput {
  at: number;
  input: Input;
  /** The text as typed, when moderation changed it. Moderators only. */
  raw?: string;
  /**
   * A `chat` input's message id (`ChatMessage.id`), so a report can cite it after the message's page has left the
   * state (#355) or its private channel is gone (#292). Ids are never reused. Missing on older games.
   */
  chatId?: number;
  /** The input's change to the full view, for the replay (#335, viewHistory.ts). Missing on older games. */
  history?: HistoryStep;
}

/**
 * One accepted change to the game. Chat and channel names hold the text after
 * moderation, which is what the rules saw. An action carries the server time
 * it arrived (`at`), and `tick` is the server saying time has reached `at`
 * (queue.ts); the rules read no clock of their own. `cycle` is the server's
 * clock passing a cycle boundary at `at` (#24). Other server-driven inputs (scheduled
 * plans) will join this union without a `by`.
 */
export type Input =
  // Never the model key messages (BYOK): every input is recorded, and a key must never be stored. Nor Leave ship, which
  // only the server handles (it changes who plays a seat, not the game), nor a chat page request (read-only).
  | (Exclude<GameClientMessage, { type: "action" | "setModel" | "clearModel" | "leaveShip" | "chatPage" }> & { by: PlayerId })
  | (Extract<GameClientMessage, { type: "action" }> & { by: PlayerId; at: number })
  | { type: "tick"; at: number }
  | { type: "cycle"; at: number }
  | { type: "join"; seat: Seat }
  // The server: these bodies are connected now (inactivity.ts, #145).
  | { type: "seen"; players: PlayerId[]; at: number }
  // The server: this body's player goes inactive at once (a banned account, #23). Nothing sends it until bans exist.
  | { type: "inactivate"; player: PlayerId }
  // The server: a restart dropped every action under way and queued (#384), as the load did.
  | { type: "dropQueues" };

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
    case "acknowledgeTransfer":
      return acknowledgeTransfer(state, input.by);
    case "tick":
      return tick(state, input.at);
    case "cycle":
      return newCycle(state, input.at);
    case "join":
      return joinShip(state, input.seat);
    case "seen":
      return seen(state, input.players, input.at);
    case "inactivate":
      return inactivate(state, input.player);
    case "dropQueues":
      return dropQueues(state);
    case "chat":
      return sendChat(state, input.by, input.channel, input.text);
    case "toggleCheckbox":
      return toggleCheckbox(state, input.by, input.channel, input.seq, input.line);
    case "createChannel":
      return createChannel(state, input.by, input.name, input.members);
    case "createThread":
      return createThread(state, input.by, input.name, input.from);
    case "sharePlanet":
      return sharePlanet(state, input.by, input.planet, input.text);
    case "invite":
      return inviteToChannel(state, input.by, input.channel, input.player);
    case "leaveChannel":
      return leaveChannel(state, input.by, input.channel);
    case "postPlan":
      return postPlan(state, input.by, input.plan);
    case "cheat":
      return setCheat(state, input.by, input.cheat, input.on);
    case "walk":
      return walk(state, input.by, input.x, input.y, input.sitting, input.behind);
    case "roleCheat":
      return setRoleCheat(state, input.by, input.role);
    case "solCheat":
      return solCheat(state, input.by);
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
    // The server stores sealed pages and empties the outbox after every input; a replay does the same.
    takeChatOutbox(state);
  }
  return state;
}

/**
 * Gives the log and chat entries the rules just appended the server time `at`.
 * The rules have no clock, so the server stamps each new state, and a rebuild
 * stamps it the same way. Both lists only grow at the end, so walk back until
 * we reach one already stamped. Changes `state` in place.
 */
export function stampEntries(state: GameState, at: number): GameState {
  for (const list of [state.log, state.chat]) {
    for (let i = list.length - 1; i >= 0 && list[i]!.at === undefined; i--) list[i]!.at = at;
  }
  // A page sealed by the input that filled it (a burst of system messages) holds copies the walk above didn't reach.
  for (const page of state.chatOutbox.sealed) for (const m of page.messages) m.at ??= at;
  return state;
}

/**
 * Rebuilds the exact state the server stored, timestamps included, from its record (#167). Exact only if neither the
 * rules code nor `DEFAULT_CONFIG` changed while the game was live: a live game resolves its config again on each load.
 */
export function rebuildGame(setup: GameSetup, record: readonly RecordedInput[]): GameState {
  let state = stampEntries(startGame(setup), setup.launchedAt ?? 0);
  for (const [i, { at, input }] of record.entries()) {
    const result = applyInput(state, input);
    if (!result.ok) throw new Error(`Rebuild diverged at input ${i} (${input.type}): ${result.error}`);
    state = stampEntries(result.state, at);
    takeChatOutbox(state);
  }
  return state;
}
