// Inactive and super inactive (#145; owner, 2026-10-31). Measured in real time, not cycles: at a cycle change, a player
// who hasn't connected for `inactivity.inactiveAfterHours` and whose AP gauge is full goes inactive; once
// `inactivity.superAfterHours` have passed since they last connected, an inactive player is super inactive. Connecting
// clears both at once. The rules read no clock: the server says who is connected and when (`seen`), and when each
// clock cycle begins (the `cycle` input's `at`). Single player has no clock cycles, so nobody there goes inactive.
// Going inactive costs titles (titles.ts) and ends an Outcast's curse. Both statuses are public and never announced.

import { fail, findPlayer, clone, type ActionResult } from "./helpers.ts";
import { refreshTitles } from "./titles.ts";
import type { GameState, Inactivity, PlayerId, PlayerState } from "./types.ts";

export type { Inactivity };

const HOUR_MS = 3_600_000;

/** Inactive or worse: no title, a punch on them lands more often, and no Transfer onto them. */
export function isInactive(p: Readonly<PlayerState>): boolean {
  return p.inactivity !== undefined;
}

/** Super inactive: Logistics skips them. */
export function isSuperInactive(p: Readonly<PlayerState>): boolean {
  return p.inactivity === "super_inactive";
}

/** The player's inactivity status, if any (statuses.ts). */
export function inactivityOf(p: Readonly<PlayerState>): Inactivity | null {
  return p.inactivity ?? null;
}

/** Makes `p` inactive (or worse) now. Mutates a state the caller already cloned; the caller refreshes titles. */
function goInactive(p: PlayerState, level: Inactivity): void {
  p.inactivity = level;
  // An Outcast's curse ends when they go inactive (eMush; owner, 2026-10-31).
  delete p.outcastBy;
}

/**
 * Called as a clock cycle begins at server time `at`, after the AP gain. A living human player not seen for
 * `inactiveAfterHours` whose AP gauge is full goes inactive; an inactive one not seen for `superAfterHours` goes super
 * inactive. A player the rules haven't seen yet starts counting now. Mutates a state the caller already cloned.
 */
export function inactivityCycle(state: GameState, at: number): void {
  const { inactiveAfterHours, superAfterHours } = state.config.inactivity;
  let changed = false;
  for (const p of state.players) {
    if (!p.alive || p.isBot) continue;
    if (p.lastSeenAt === undefined) {
      p.lastSeenAt = at;
      continue;
    }
    const away = at - p.lastSeenAt;
    if (p.inactivity === undefined) {
      if (away < inactiveAfterHours * HOUR_MS || p.ap < state.config.maxAp) continue;
      goInactive(p, "inactive");
      changed = true;
    }
    // Checked straight after, so a gauge that only fills after the longer wait goes straight to super inactive.
    if (p.inactivity === "inactive" && away >= superAfterHours * HOUR_MS) p.inactivity = "super_inactive";
  }
  if (changed) refreshTitles(state);
}

/**
 * These players are connected at server time `at`: either status ends. A title doesn't come back (titles.ts), but a
 * vacant one may now go to them. Returns whether anything changed. Mutates a state the caller already cloned.
 */
export function markSeen(state: GameState, ids: readonly PlayerId[], at: number): boolean {
  let changed = false;
  let woke = false;
  for (const id of ids) {
    const p = findPlayer(state, id);
    if (!p) continue;
    if (p.lastSeenAt !== at) {
      p.lastSeenAt = at;
      changed = true;
    }
    if (p.inactivity !== undefined) {
      delete p.inactivity;
      changed = woke = true;
    }
  }
  if (woke) refreshTitles(state);
  return changed;
}

/** The `seen` input: the server's list of connected players (by body) and the time. Fails with `unchanged` when it changes nothing, so it isn't recorded. */
export function seen(state: GameState, ids: readonly PlayerId[], at: number): ActionResult {
  if (state.phase !== "playing") return fail("game_over");
  const next = clone(state);
  return markSeen(next, ids, at) ? { ok: true, state: next } : fail("unchanged");
}

/** The `inactivate` input: the server makes a seat inactive at once, without the thresholds (a banned account; #23, owner 2026-10-29). */
export function inactivate(state: GameState, id: PlayerId): ActionResult {
  if (state.phase !== "playing") return fail("game_over");
  const p = findPlayer(state, id);
  if (!p) return fail("no_player");
  if (!p.alive || isInactive(p)) return fail("unchanged");
  const next = clone(state);
  goInactive(findPlayer(next, id)!, "inactive");
  refreshTitles(next);
  return { ok: true, state: next };
}
