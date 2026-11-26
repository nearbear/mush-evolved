// The Politician's coup (owner, 2026-11-12), resolved at a cycle change.

import { pushChat } from "./chat.ts";
import { eligibleForTitle, setTitleHolder, successionLine } from "./titles.ts";
import type { GameState } from "./types.ts";

/**
 * Called at each cycle change, after the inactivity check. Every pending coup is cleared. If any Politician who staged one
 * is still eligible for a title (alive, not inactive), the first of them in the Commander's line becomes Commander and the
 * usual crew-chat `titlePassed` follows; otherwise nothing happens. Mutates a state the caller already cloned.
 */
export function coupCycle(state: GameState): void {
  const plotters = state.players.filter((p) => p.coupPending && eligibleForTitle(p));
  for (const p of state.players) delete p.coupPending;
  if (plotters.length === 0 || state.preselection) return;
  const line = successionLine(state, "commander"); // an Outcast plotter still plots, but ranks last among plotters
  const winner = [...plotters].sort((a, b) => line.indexOf(a.character) - line.indexOf(b.character))[0]!;
  if (state.titles.commander === winner.id) return;
  setTitleHolder(state, "commander", winner.id);
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "titlePassed", params: { name: winner.character, title: "commander" } } });
}
