// Helpers shared by the rules tests. They hide how tests reach into state and views, so a change to an API
// shape (a renamed view field, a new Seat field) is fixed here once instead of in every test file. Setting up a
// scenario (who is where, holding what) stays in each test file, next to the tests that depend on it.
import { CHARACTERS } from "../src/characters.ts";
import { type ActionResult, applyAction, legalIn, newCycle, viewFor } from "../src/rules.ts";
import type { Action, ActionOption, GameConfig, GameState, PlayerId, PlayerState, Seat } from "../src/types.ts";

/** `config` with no hunter waves, for tests that run many cycles with nobody at the turrets (the ship would explode). */
export const noHunters = <C extends GameConfig>(config: C): C => ({ ...config, hunters: { ...config.hunters, waveChance: 0 } });

/** Seats p0, p1, … with the first `n` characters. `bots` says which seats are bots. */
export function makeSeats(n: number, bots: "none" | "others" | "all" = "none"): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    isBot: bots === "all" || (bots === "others" && i > 0),
    character: CHARACTERS[i]!.id,
  }));
}

export function player(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((q) => q.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

/** The new state of an accepted action; throws with the error if it was refused. */
export function must(r: ActionResult): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Applies each action in turn as `id`, throwing at the first one refused. */
export function mustApply(s: GameState, id: PlayerId, ...actions: Action[]): GameState {
  for (const a of actions) s = must(applyAction(s, id, a));
  return s;
}

/**
 * `id` picks `skill` whether or not it is on their character's list (the `anySkill` cheat is on for the pick only),
 * so a test can give any seat any skill. Throws if the pick is refused for another reason.
 */
export function pickSkill(s: GameState, id: PlayerId, skill: string): GameState {
  const cheating = clone(s);
  player(cheating, id).cheats.push("anySkill");
  const next = mustApply(cheating, id, { type: "pick_skill", skill });
  const p = player(next, id);
  p.cheats = p.cheats.filter((c) => c !== "anySkill");
  return next;
}

/** The clock passes a cycle boundary. */
export function nextCycle(s: GameState): GameState {
  return must(newCycle(s));
}

export const dayOf = (s: GameState) => Math.floor((s.cycle - 1) / s.config.cyclesPerDay);

/** Plays cycles until a new day starts. */
export function nextDay(s: GameState): GameState {
  const day = dayOf(s);
  while (dayOf(s) === day) s = nextCycle(s);
  return s;
}

/** What `id` can do right now, as their view offers it (affordable actions only). */
export const offered = (s: GameState, id: PlayerId): Action[] => legalIn(viewFor(s, id));

type ActionMatch = Partial<Action> | ((a: Action) => boolean);

/**
 * The first entry in `id`'s view offering an action that matches: every field given must be equal, so
 * `{ type: "punch" }` is any punch and `{ type: "punch", target: "p1" }` one in particular. Includes actions
 * they can't afford (see `lacks`).
 */
export function option(s: GameState, id: PlayerId, match: ActionMatch): ActionOption | undefined {
  const test =
    typeof match === "function"
      ? match
      : (a: Action) => Object.entries(match).every(([k, v]) => JSON.stringify((a as Record<string, unknown>)[k]) === JSON.stringify(v));
  return viewFor(s, id).actions.find((o) => test(o.action));
}

/** What `id`'s view says a matching action costs, or undefined if none is offered. */
export const costOf = (s: GameState, id: PlayerId, match: ActionMatch) => option(s, id, match)?.cost;
