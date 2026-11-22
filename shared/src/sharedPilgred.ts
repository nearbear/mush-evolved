// ---- Shared PILGRED status ---------------------------------------------------
// Sharing PILGRED's repair progress in the PILGRED feature (owner, 2026-11-21): at a PILGRED terminal (`PILGRED`), a
// living player with an iTrackie posts an editable repair percentage (0..PILGRED_COMPLETE) plus an optional free-text
// note. The value is never checked against the real progress: lies and mistakes are allowed, like Botany's
// `sharePlants` and Astrophysics's `sharePlanet`. Only the latest share is kept, pinned above the PILGRED thread;
// sharing again replaces it and posts a system message in PILGRED chat. Like chat, this is not an Action, and the
// server moderates the free text first.

import { chatChannels, pushChat } from "./chat.ts";
import { cloneState, dayOf, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { PILGRED_COMPLETE, pilgredTerminalsHere } from "./pilgred.ts";
import { MAX_SHARED_PLANET_LENGTH, MAX_SHARED_PLANET_LINES } from "./sharedPlanets.ts";
import type { GameState, PlayerId, PlayerState, SharedPilgredStatus } from "./types.ts";

/** Longest free-text note in a PILGRED status share (same as a shared planet). */
export const MAX_SHARED_PILGRED_TEXT_LENGTH = MAX_SHARED_PLANET_LENGTH;

/** Most lines in a PILGRED status note; moderation enforces it. */
export const MAX_SHARED_PILGRED_TEXT_LINES = MAX_SHARED_PLANET_LINES;

/** Whether `value` is a valid shared PILGRED repair percent (integer 0..PILGRED_COMPLETE). */
export function parseSharedPilgredPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > PILGRED_COMPLETE) return null;
  return value;
}

/**
 * Whether this player may share the PILGRED repair progress now: alive at a PILGRED terminal (`PILGRED`) with what
 * opens the PILGRED feature (an iTrackie, or the rebel base's brain probes).
 */
export const canSharePilgred = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  player.alive && pilgredTerminalsHere(state, player).length > 0 && chatChannels(state, player).includes("pilgred");

/**
 * Shares the PILGRED repair progress in the PILGRED feature, replacing any previous share. Free. `text` comes
 * moderated.
 */
export function sharePilgred(state: GameState, playerId: PlayerId, percent: number, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !canSharePilgred(state, p)) return fail("share_forbidden");
  const parsed = parseSharedPilgredPercent(percent);
  if (parsed === null) return fail("share_pilgred_invalid");
  if (typeof text !== "string") return fail("share_text_invalid");
  const body = text.trim();
  if (body.length > MAX_SHARED_PILGRED_TEXT_LENGTH) return fail("share_text_invalid");

  const next = cloneState(state);
  const hadPrior = next.sharedPilgred !== null;
  next.sharedPilgred = { percent: parsed, text: body, by: playerId, ...dayOf(next) };
  pushChat(next, "pilgred", { from: null, isBot: false, text: "", system: { key: hadPrior ? "pilgredShareUpdated" : "pilgredShared", params: { name: p.character } } });
  return { ok: true, state: next };
}

/** Copy of the shared PILGRED repair status for a view, or null if none was shared. */
export function sharedPilgredView(state: Readonly<Pick<GameState, "sharedPilgred">>): SharedPilgredStatus | null {
  if (!state.sharedPilgred) return null;
  const { percent, text, by, day, cycleOfDay } = state.sharedPilgred;
  return { percent, text, by, day, cycleOfDay };
}
