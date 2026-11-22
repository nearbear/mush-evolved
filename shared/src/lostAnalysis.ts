// Finola's lost analysis (#394, owner 2026-11-13): who was known not to be Mush when the Daedalus left. It is rolled
// once, when the Mush are chosen, on a stream of its own (so it moves no other roll), and kept server-side until
// Xyloph's LOST_ANALYSIS entry prints it as a `document` on the bridge floor (comms.ts, `applyXyloph`). Rows are
// characters (bodies): later deaths, conversions, cures and Transfers never change it.

import type { CharacterId } from "./characters.ts";
import { type HasRng, type RngState, rollShuffle, streamFor } from "./rng.ts";
import type { DocumentRow, DocumentState, GameState } from "./types.ts";

/** The generic document item (`ItemState.document`): this analysis, and THE List (#266, actions/print_list.ts). Named after its icon. */
export const DOCUMENT_ITEM = "document";

/** A deep copy of what a document says, for a view. */
export const copyDocument = (document: Readonly<DocumentState>): DocumentState =>
  document.kind === "lost_analysis" ? { kind: "lost_analysis", rows: document.rows.map((r) => ({ ...r })) } : { kind: "the_list", characters: [...document.characters] };

export interface LostAnalysisState {
  /** Its own stream, from `streamFor(seed, "lost-analysis")`; kept until selection, since only creation knows the seed. */
  rng: RngState;
  /** The analysis once the Mush are chosen; null before. Never in any view until printed. */
  rows: DocumentRow[] | null;
}

export const newLostAnalysis = (seed: number): LostAnalysisState => ({ rng: streamFor(seed, "lost-analysis"), rows: null });

/**
 * Every character aboard, in order, with `floor(starting Mush × perMush)` of the non-Mush bodies marked negative,
 * drawn without replacement (all of them if fewer are eligible). A Mush body is never marked.
 */
export function rollLostAnalysis(holder: HasRng, aboard: readonly { character: CharacterId; mush: boolean }[], perMush: number): DocumentRow[] {
  const count = Math.floor(aboard.filter((a) => a.mush).length * perMush);
  const eligible = aboard.filter((a) => !a.mush).map((a) => a.character);
  const marked = new Set(rollShuffle(holder, eligible).slice(0, count));
  return aboard.map((a) => ({ character: a.character, negative: marked.has(a.character) }));
}

/** At Mush selection (`selectMush`, or `createGame` without pre-selection): rolls and stores the analysis. Mutates a state the caller already cloned. */
export function rollAtSelection(state: GameState): void {
  const aboard = state.players.filter((p) => p.alive).map((p) => ({ character: p.character, mush: p.role === "mush" }));
  state.lostAnalysis.rows = rollLostAnalysis(state.lostAnalysis, aboard, state.config.comms.xyloph.lostAnalysisPerMush);
}
