// ---- Shared expedition reports ---------------------------------------------------
// Sharing an expedition's report in the Expeditions feature (owner, 2026-11-07, #356, docs/plans/expedition.md item 13).
// Any living member of the expedition, from anywhere, with what opens the feature (an iTrackie, or the rebel base's
// brain probes), posts free text about it, for free. The text is never parsed: lies are allowed. Each expedition gets
// one entry, which is also a discussion thread with the feature's access (chat.ts). Unlike a shared planet, sharing
// again (by the same or another member) appends the new text to the entry's thread instead of replacing it, and an
// entry is never marked no longer applicable: it is historical. Like chat, this is not an Action, and the server
// moderates the text first. The length limits are the shared planets' (`MAX_SHARED_PLANET_LENGTH`, Claude's reading).

import { chatChannels, pushChat } from "./chat.ts";
import { clone, dayOf, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { MAX_SHARED_PLANET_LENGTH } from "./sharedPlanets.ts";
import type { GameState, PlayerId, PlayerState, SharedReportId } from "./types.ts";

/** The feature channel shared reports are listed in. */
export const REPORTS_FEATURE = "expeditions";

/** Whether this player may share their reports now: alive with what opens the Expeditions feature (`chatChannels` holds only the living, and only while playing). */
export const canShareReports = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean => player.alive && chatChannels(state, player).includes(REPORTS_FEATURE);

/**
 * Shares the report of an expedition you went on. The first share makes the entry, headed by `text`; a later one, by
 * any member, appends `text` to the entry's thread as the sharer's message. Free. `text` comes moderated.
 */
export function shareReport(state: GameState, playerId: PlayerId, reportId: string, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !canShareReports(state, p)) return fail("report_share_forbidden");
  const report = state.expeditions.find((r) => r.id === reportId);
  if (!report || !report.members.includes(playerId)) return fail("report_not_found");
  const body = text.trim();
  if (!body || body.length > MAX_SHARED_PLANET_LENGTH) return fail("share_text_invalid");

  const next = clone(state);
  const entry = next.sharedReports.find((s) => s.report === reportId);
  if (entry) {
    pushChat(next, entry.id, { from: p.id, isBot: p.isBot, text: body });
  } else {
    const id: SharedReportId = `sr-${next.nextSharedReportId++}`;
    next.sharedReports.push({ id, report: reportId, text: body, by: playerId, ...dayOf(next) });
  }
  pushChat(next, REPORTS_FEATURE, { from: null, isBot: false, text: "", system: { key: entry ? "reportShareAppended" : "reportShared", params: { name: p.character, planet: report.planet } } });
  return { ok: true, state: next };
}
