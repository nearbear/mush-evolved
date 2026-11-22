// THE List (#266, owner 2026-10-25 and 2026-11-21; docs/plans/the-list.md): a Tracker prints, once per game, a list
// of names from the tabulator in front storage, with at least one Mush among them when any are left. This file holds
// its server-only state and the pure rolls; the action is `print_list`. The list names characters (bodies), like
// Finola's lost analysis, and never changes once printed.

import type { CharacterId } from "./characters.ts";
import { type RngState, rollInt, rollShuffle, streamFor } from "./rng.ts";
import type { GameState, PlayerState } from "./types.ts";

/** Never named except as the last-resort guaranteed name (owner, 2026-11-21, as eMushpedia). */
const CHUN: CharacterId = "chun";

export interface TheListState {
  /** Its own stream, from `streamFor(seed, "the-list")`, so printing moves no other roll. */
  rng: RngState;
  /** The bodies that were Mush when the Mush were chosen; empty before. */
  startingMush: CharacterId[];
  /** The cycle the Mush were chosen in; null before. The list shrinks by one name per whole day since. */
  selectedAt: number | null;
  /** Whether the one print of the game is spent (a torn list stays spent). */
  printed: boolean;
}

export const newTheList = (seed: number): TheListState => ({ rng: streamFor(seed, "the-list"), startingMush: [], selectedAt: null, printed: false });

/** At Mush selection (`selectMush`, or `createGame` without pre-selection). Mutates a state the caller already cloned. */
export function recordSelection(state: GameState): void {
  state.theList.startingMush = state.players.filter((p) => p.alive && p.role === "mush").map((p) => p.character);
  state.theList.selectedAt = state.cycle;
}

const living = (state: Readonly<GameState>): PlayerState[] => state.players.filter((p) => p.alive);

/**
 * How many names a print would hold now: `startNames` less one per whole day since selection, never below 1, and
 * never more than the names there are to print (living characters other than Chun, plus the guaranteed name). 0 when
 * no Mush is left, since the list then names nobody.
 */
export function listSize(state: Readonly<GameState>): number {
  const { selectedAt } = state.theList;
  const days = selectedAt === null ? 0 : Math.floor((state.cycle - selectedAt) / state.config.cyclesPerDay);
  const wanted = Math.max(1, state.config.theList.startNames - days);
  const group = guaranteedGroup(state);
  // The guaranteed name is among the living non-Chun characters unless it is Chun herself.
  const available = group.length === 0 ? 0 : living(state).filter((p) => p.character !== CHUN).length + (group[0] === CHUN ? 1 : 0);
  return Math.min(wanted, available);
}

/**
 * The group the guaranteed name is drawn from, the first that isn't empty: living starting-Mush bodies that are still
 * Mush (not Chun), then any living Mush (not Chun), then Chun if she is a living Mush. Empty when no Mush is left.
 */
export function guaranteedGroup(state: Readonly<GameState>): CharacterId[] {
  const mush = living(state).filter((p) => p.role === "mush");
  const starting = mush.filter((p) => p.character !== CHUN && state.theList.startingMush.includes(p.character));
  if (starting.length > 0) return starting.map((p) => p.character);
  const converted = mush.filter((p) => p.character !== CHUN);
  if (converted.length > 0) return converted.map((p) => p.character);
  return mush.map((p) => p.character);
}

/** The guaranteed name, drawn at random within its group on the list's stream; null when no Mush is left. */
export function guaranteedName(state: GameState): CharacterId | null {
  const group = guaranteedGroup(state);
  return group.length === 0 ? null : group[rollInt(state.theList, group.length)]!;
}

/**
 * A fresh list: the guaranteed name plus random filler (living characters other than Chun and that name), shuffled
 * so the Mush's place says nothing. Empty when no Mush is left ("no Mush aboard"). Advances only the list's stream;
 * does not mark the print spent. Mutates a state the caller already cloned.
 */
export function rollList(state: GameState): CharacterId[] {
  const size = listSize(state);
  const named = guaranteedName(state);
  if (named === null) return [];
  const filler = rollShuffle(
    state.theList,
    living(state)
      .map((p) => p.character)
      .filter((c) => c !== CHUN && c !== named),
  ).slice(0, size - 1);
  return rollShuffle(state.theList, [named, ...filler]);
}
