// Helpers shared by the rules tests. They hide how tests reach into state and views, so a change to an API
// shape (a renamed view field, a new Seat field) is fixed here once instead of in every test file. Setting up a
// scenario (who is where, holding what) stays in each test file, next to the tests that depend on it.
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { RebelBaseId } from "../src/comms.ts";
import { addSignal, type Signal } from "../src/signals.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { DRUG_ITEMS, ITEM_TYPES } from "../src/items.ts";
import { ANY_CONSUMABLE, RESEARCH_REQUIRES, type ResearchId } from "../src/research.ts";
import { PROJECT_COMPLETE, type ProjectId } from "../src/projects.ts";
import { type ActionResult, applyAction, legalIn, newCycle, viewFor } from "../src/rules.ts";
import type { RelayPool } from "../src/relay.ts";
import type { Action, ActionOption, GameConfig, GameState, PlayerId, PlayerState, Seat } from "../src/types.ts";

/** `state` without the drugs a new ship stocks in its Medlab, for tests that count or index the items on the floor. */
export function withoutDrugs(state: GameState): GameState {
  state.items = state.items.filter((i) => !DRUG_ITEMS.includes(i.type));
  return state;
}

/** `config` with no hunter waves, for tests that run many cycles with nobody at the turrets (the ship would explode). */
export const noHunters = <C extends GameConfig>(config: C): C => ({ ...config, hunters: { ...config.hunters, waveChance: 0 } });

/** `config` where incidents never happen (the pool still fills), for tests that run many cycles and count HP or morale. */
export const noIncidents = <C extends GameConfig>(config: C): C => ({ ...config, incidents: { ...config.incidents, rollPoints: Number.MAX_SAFE_INTEGER } });

/** `config` with no character's built-in skills (Chun's immunity, Ian's pacifism, …), for tests of a skill or status. */
export const noCharacterModifiers = <C extends GameConfig>(config: C): C => ({ ...config, characterModifiers: {} });

/** A partial `T` at every depth; arrays are whole values, never partial. */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `base` with `overrides` on top: plain objects merge key by key, anything else (arrays, numbers, null) replaces.
 * So `{}` adds nothing; to empty a record, use a named helper such as `noCharacterModifiers`.
 */
export function deepMerge<T>(base: T, overrides: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) out[key] = deepMerge(out[key], value as never);
  return out as T;
}

/**
 * The quiet baseline for a rules test: one Mush, nobody starts with anything, and no item lies on the floor
 * (`startItems`, so no Medlab drugs and no medikit in the lab); no hunter waves and no incidents. A new default that
 * acts on its own (a random event, a spawn) belongs here too, so tests that don't care about it stay unaffected.
 * Character modifiers stay on: turn them off with `noCharacterModifiers`.
 */
export const QUIET_CONFIG: GameConfig = noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] }));

/**
 * `QUIET_CONFIG` with `overrides` deep-merged on top, e.g. `testConfig({ repair: { chance: { COFFEE_DISPENSER: 0 } } })`.
 * Wrap it in `noCharacterModifiers(…)` or other helpers for what a merge can't say. Tests that should see the
 * whole default game (setup, determinism, the survival harness) use `DEFAULT_CONFIG` on purpose instead.
 */
export const testConfig = (overrides: DeepPartial<GameConfig> = {}): GameConfig => deepMerge(QUIET_CONFIG, overrides);

/**
 * Sets every dismantlable type's own `chance` (they override `config.dismantle.successChance`), to force a success
 * (1) or a miss (0). Returns a function that puts the real odds back; test files run isolated, so a file that never
 * restores only affects itself.
 */
export function forceDismantleOdds(odds: number): () => void {
  const types = [...Object.values(ITEM_TYPES), ...Object.values(EQUIPMENT_TYPES)].filter((t) => t.dismantle?.chance !== undefined);
  const before = types.map((t) => t.dismantle!.chance!);
  for (const t of types) t.dismantle!.chance = odds;
  return () => types.forEach((t, i) => (t.dismantle!.chance = before[i]!));
}

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

/**
 * Meets a research's RESEARCH_REQUIRES in `room`, for tests about something else: its items on the floor (coffee for
 * any consumable), Chun's requirement lifted by her Xyloph entry, and pre-selection over.
 */
export function stockLab(s: GameState, room: string, research: ResearchId): void {
  const needs = RESEARCH_REQUIRES[research] ?? {};
  for (const type of needs.items ?? []) s.items.push({ id: `item-${s.nextItemId++}`, type: type === ANY_CONSUMABLE ? "coffee" : type, at: { kind: "room", id: room } });
  if (needs.chun && !s.comms.xyloph.includes("ZONG_CHUN_SAMPLE")) s.comms.xyloph.push("ZONG_CHUN_SAMPLE");
  if (needs.postSelection) s.preselection = false;
}

/** Puts `percent` in a relay pool as one token from a player not in the game, so later contributions add to it (relay.ts). */
function seedPool(pool: RelayPool, percent: number): void {
  pool.tokens.push({ by: "seed", base: percent, roll: 0 });
}

/** Sets a research, project or PILGRED to `percent` (and ensures an unfinished project is in the offered draw). */
export function setProgress(s: GameState, target: { research: string } | { project: string } | "pilgred", percent: number): void {
  if (target === "pilgred") {
    seedPool(s.pilgred.pool, percent);
    s.pilgred.progress = percent;
  } else if ("research" in target) {
    seedPool((s.relay.research[target.research] ??= { tokens: [], pending: [] }), percent);
    s.research[target.research] = percent;
  } else {
    s.projects[target.project] = percent;
    delete s.relay.projects[target.project];
    const project = target.project as ProjectId;
    if (percent < PROJECT_COMPLETE) s.projectDeck = [project, ...s.projectDeck.filter((id) => id !== project)];
  }
}

/**
 * Puts `base`'s rebel call in the signals list now, decoded to `progress`, open for `window` cycles, without rolling (so
 * a test's other rolls don't move). At 100% it is reached, as a decode would leave it, but with no bonus applied
 * beyond what `rebelContacted` reads.
 */
export function rebelCallAt(s: GameState, base: RebelBaseId, progress: number, window = 10): Signal {
  const signal = addSignal(s, "rebel", s.cycle + window, { rebel: { base, progress } });
  if (progress >= 100) signal.status = "reached";
  return signal;
}
