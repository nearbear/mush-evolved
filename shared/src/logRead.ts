// ---- Room log read state (#513) -----------------------------------------------
// A room log line is unread only if it arrived while the seat had no connection open on any device; lines that arrive
// while connected are read straight away. Positions count in `PlayerView.logSeen`: a body's running count of lines it
// has been able to see, so the last line of `view.log` is position `logSeen − 1`.
//
// Not game state: the server keeps one `LogRead` per seat in its own storage (beside chat's, chatRead.ts), outside
// the snapshot, the input log and every view. It names the body it counts for: `logSeen` restarts when a body changes
// (a Transfer, the `swapCharacter` cheat), so the record starts over then with nothing unread, and old positions can't
// reveal when the body's previous mind was offline. docs/plans/archive/chat-pages.md, "Room log read state (#513)".

import type { PlayerId } from "./types.ts";

export interface LogRead {
  /** The body the positions count for. */
  body: PlayerId;
  /** Lines before this position are read. */
  readUpTo: number;
  /** The body's `logSeen` when the seat was last known connected: its last connection closing, or a save while connected. */
  live: number;
}

/** What a body brings: its id and its `logSeen`. */
type Body = { id: PlayerId; logSeen: number };

/**
 * The seat's record for `body`: the stored one clamped to `body.logSeen`, or a fresh one with nothing unread when
 * there is none (a game running at deploy) or it counted for another body.
 */
export function logReadFor(stored: Readonly<LogRead> | undefined, body: Body): LogRead {
  if (!stored || stored.body !== body.id) return { body: body.id, readUpTo: body.logSeen, live: body.logSeen };
  return { body: body.id, readUpTo: Math.min(stored.readUpTo, body.logSeen), live: Math.min(stored.live, body.logSeen) };
}

/**
 * `record` with lines read up to `upTo` (from the client: clamped to `body.logSeen`), or null when that is no rise.
 * The point only moves forward.
 */
export function raiseLogRead(record: Readonly<LogRead>, body: Body, upTo: number): LogRead | null {
  const next = Math.min(upTo, body.logSeen);
  return next > record.readUpTo ? { ...record, readUpTo: next } : null;
}

/**
 * `record` while the seat is connected, its first connection having opened at position `connectedFrom`: the body has
 * seen every line since live, so `live` is now. If nothing it missed before then is unread (`readUpTo` reached
 * `connectedFrom`), every line after is read too, and the point moves to the end; otherwise it waits for the reader.
 */
export function presentLogRead(record: Readonly<LogRead>, body: Body, connectedFrom: number): LogRead {
  return { ...record, live: body.logSeen, readUpTo: record.readUpTo >= connectedFrom ? body.logSeen : record.readUpTo };
}

/** A `logRead` position from untrusted input: a safe non-negative integer, or null. */
export function parseLogPosition(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}
