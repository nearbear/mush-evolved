// ---- Pre-selection ----------------------------------------------------------
// Decided 2026-10-13 (docs/rules-design.md, "Joining and Mush selection"). A multiplayer ship launches with nobody
// Mush (`config.preselection`). Players join it (`joinShip`, a server input) until it fills or the deadline cycle
// begins, whichever comes first; then `selectMush` picks the Mush from whoever joined: `twoMushAbove` or fewer
// players get 1, more get 2. Titles and the first rebel call wait for selection too. Meanwhile there are no spore
// actions and no combat (punch, weapons): their actions refuse with `IN_PRESELECTION` (actions/action.ts).
//
// Stopgap (owner, 2026-10-24): with fewer than `minPlayers` aboard at selection, every human dies at once, so the
// game ends with the Mush win.

import { pushChat } from "./chat.ts";
import { killPlayer } from "./death.ts";
import { clone, fail, type ActionResult } from "./helpers.ts";
import { logPrivate } from "./log.ts";
import { callNextRebel } from "./comms.ts";
import { shuffle } from "./rng.ts";
import { newPlayer, startInventory } from "./rules.ts";
import { assignTitles } from "./titles.ts";
import { endGame, mushWinOnDeath } from "./victory.ts";
import type { GameState, PreselectionRules, Seat } from "./types.ts";

/** A player boards the ship. Only in pre-selection, with a seat free and a character nobody aboard has. */
export function joinShip(state: GameState, seat: Seat): ActionResult {
  const rules = state.config.preselection;
  if (!rules || !state.preselection || state.phase !== "playing" || state.players.length >= rules.seats) return fail("ship_closed");
  if (state.players.some((p) => p.character === seat.character)) return fail("character_taken");
  if (state.players.some((p) => p.id === seat.id)) return fail("duplicate_seat");
  const next = clone(state);
  next.players.push(newPlayer(seat, next.config, next.cycle, "human"));
  for (const item of startInventory(next.config, seat.id)) next.items.push({ id: `item-${next.nextItemId++}`, ...item });
  if (next.players.length >= rules.seats) selectMush(next);
  return { ok: true, state: next };
}

/** The global cycle at whose start Mush are chosen, if the ship hasn't filled first. */
export function preselectionDeadline(state: Readonly<GameState>, rules: PreselectionRules): number {
  return (rules.endsOn.day - 1) * state.config.cyclesPerDay + rules.endsOn.cycle;
}

/** Called as each cycle begins: picks the Mush once the deadline cycle has come. Mutates a state the caller already cloned. */
export function preselectionCycle(state: GameState): void {
  const rules = state.config.preselection;
  if (rules && state.preselection && state.phase === "playing" && state.cycle >= preselectionDeadline(state, rules)) selectMush(state);
}

/**
 * Ends pre-selection: picks the Mush with the seeded RNG from the living humans, issues the titles, and the first
 * rebel base calls. Each new Mush is told privately; the crew gets a system message in global chat that the Mush
 * have been chosen, without names. Mutates a state the caller already cloned.
 */
export function selectMush(state: GameState): void {
  const rules = state.config.preselection;
  if (!rules || !state.preselection) return;
  state.preselection = false;
  const aboard = state.players.filter((p) => p.alive);
  const wanted = aboard.length > rules.twoMushAbove ? 2 : 1;
  // A Mush made by the dev role cheat already counts.
  const already = aboard.filter((p) => p.role === "mush").length;
  const [order, rng] = shuffle(
    aboard.filter((p) => p.role === "human"),
    state.rng,
  );
  state.rng = rng;
  for (const p of order.slice(0, Math.max(0, wanted - already))) {
    p.role = "mush";
    p.alpha = true;
    // Satiety and hunger are human-only.
    p.satiety = 0;
    p.satietyZeroSince = null;
    logPrivate(state, p.id, "chosenMush");
  }
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "mushChosen" } });
  state.titles = assignTitles(state.players);
  callNextRebel(state);

  if (aboard.length < rules.minPlayers) {
    for (const p of aboard) if (p.role === "human") killPlayer(state, p);
    if (mushWinOnDeath(state)) endGame(state, "mush", "humans_dead");
  }
}
