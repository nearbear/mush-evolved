// The full-state view for replays (#334, docs/rules/rules-design.md "Replay history and storage"): everything in the
// game (roles, every room, hidden stats, every channel), and each seat's own view rebuilt from it with `perspective`.
// It shows all hidden information, so it may only leave the server for a game that has ended, through the replay
// route (#337). Nothing sends one yet.
//
// Its shape is the game state without the RNG (owner, 2026-11-01): `perspective` runs `viewFor` on it, so a seat's
// view of a replay is the view the seat had. The RNG is left out because no view may depend on it.

import type { CharacterId } from "./characters.ts";
import { clone } from "./helpers.ts";
import { bodyOf } from "./mind.ts";
import { seatViewFor } from "./rules.ts";
import type { DeepReadonly, GameConfig, GameCore, GameState, PlayerId, Role, SeatView } from "./types.ts";
import { HistoryError } from "./viewHistory.ts";

/** A seat as it was when the Mush were chosen: Mush then means an alpha Mush, Mush later a beta Mush. */
export interface SeatStart {
  role: Role;
  character: CharacterId;
}

/** Every seat's start, by seat (the player, not the body: a Transfer moves a player to another character). */
export type SeatStarts = Record<PlayerId, SeatStart>;

/** The game as a replay shows it. */
export interface FullView extends GameCore {
  /** The game's whole resolved config as it was at this step, not just its overrides. */
  readonly config: DeepReadonly<GameConfig>;
  /** Each seat's role and character when the Mush were chosen; null before they are (pre-selection). */
  starts: SeatStarts | null;
}

/** Each seat's role and character now, by seat. The server keeps this from the moment the Mush are chosen. */
export function seatStarts(state: Readonly<GameState>): SeatStarts {
  return Object.fromEntries(state.players.map((p) => [p.mind, { role: p.role, character: p.character }]));
}

/**
 * The full view of `state`, a copy that shares nothing with it. `starts` is what the server noted when the Mush were
 * chosen (`seatStarts`); the state doesn't keep it.
 */
export function fullViewFor(state: Readonly<GameState>, starts: Readonly<SeatStarts> | null): FullView {
  // The outbox only carries copies of pages already in the history, on their way to storage.
  const { rng: _rng, chatOutbox: _outbox, ...rest } = state;
  return clone({ ...rest, starts }) as FullView;
}

/**
 * What `seat` (the mind, across a Transfer) saw: equal to `viewFor` on the body `seat` played in `full`, plus each log
 * line's id (`SeatView`). Throws
 * `HistoryError` when `full` is from an older rules build whose state shape `viewFor` can no longer read.
 */
export function perspective(full: Readonly<FullView>, seat: PlayerId): SeatView {
  const { starts: _starts, ...rest } = full;
  const state = { ...rest } as GameState;
  const by = Array.isArray(state.players) ? bodyOf(state, seat) : undefined;
  if (!by && Array.isArray(state.players)) throw new Error(`Unknown player ${seat}`);
  let rngRead = false;
  Object.defineProperty(state, "rng", {
    enumerable: true,
    get: () => {
      rngRead = true;
      throw new Error("A view read the RNG, which the full view leaves out");
    },
  });
  try {
    return seatViewFor(state, by ?? seat);
  } catch (e) {
    if (rngRead) throw e;
    throw new HistoryError(`Full view cannot be read by current rules: ${e instanceof Error ? e.message : String(e)}`);
  }
}
