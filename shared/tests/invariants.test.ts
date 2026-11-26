// Invariants under random play (#112): seeded games of random legal play, checked after every accepted input. The checks name
// no rooms, numbers or view fields (caps come from the state and its config), so they survive refactors and retuning; they
// catch rule combinations nobody wrote a test for. A failure names the setup, seed, step and input: `play(step + 1, seed,
// from)` (randomGame.ts) rebuilds the failing state.

import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { dayOf } from "../src/helpers.ts";
import type { Input } from "../src/replay.ts";
import { applyAction, legalActions } from "../src/rules.ts";
import { nextInt, type RngState } from "../src/rng.ts";
import type { GameState } from "../src/types.ts";
import { play, preselectionSetup, seedsFrom, setup, slowRun } from "./randomGame.ts";

/** How many of the acting player's legal actions each step tries for real; all of them is too slow, even for a slow run. */
const ACTIONS_TRIED = slowRun ? 3 : 1;

/** Every broken invariant in `state`, as readable lines; empty when all hold. */
function broken(state: GameState): string[] {
  const out: string[] = [];
  const rooms = new Set(Object.keys(state.config.rooms));
  const players = new Set(state.players.map((p) => p.id));

  // Every item is in exactly one place (one `at`, one entry per id), and that place exists.
  const ids = new Set<string>();
  for (const item of state.items) {
    if (ids.has(item.id)) out.push(`item ${item.id} is listed twice`);
    ids.add(item.id);
    const { kind, id } = item.at;
    if (kind === "room" ? !rooms.has(id) : kind === "player" ? !players.has(id) : true) out.push(`item ${item.id} (${item.type}) is in a missing ${kind} ${id}`);
  }

  for (const p of state.players) {
    const stats = [
      ["AP", p.ap, p.maxAp],
      ["MP", p.mp, p.maxMp],
      ["HP", p.hp, p.maxHp],
      ["morale", p.morale, p.maxMorale],
    ] as const;
    for (const [stat, value, max] of stats) {
      if (!Number.isInteger(value) || value < 0 || value > max) out.push(`${p.id} has ${stat} ${value} (cap ${max})`);
    }
    if (p.hp <= 0 && p.alive) out.push(`${p.id} is alive at ${p.hp} HP`);
    if (!rooms.has(p.room)) out.push(`${p.id} is in a missing room ${p.room}`);
  }

  // Someone can always do something while the game is on. Tighten this as win conditions settle.
  if (state.phase === "playing" && !state.preselection && state.players.some((p) => p.alive)) {
    if (!state.players.some((p) => p.alive && legalActions(state, p.id).length > 0)) out.push("no living player has a legal action");
  }
  return out;
}

/** How often (in steps) the state goes through JSON; every step doubles the run, as the log grows. */
const JSON_EVERY = 10;

/** Some of the actor's legal actions that `applyAction` refuses: offered means accepted, since the client and bots trust the list. */
function refused(state: GameState, input: Input, rng: RngState): [string[], RngState] {
  const by = "by" in input ? input.by : undefined;
  if (by === undefined) return [[], rng];
  const actions = legalActions(state, by);
  const out: string[] = [];
  for (let n = 0; n < Math.min(ACTIONS_TRIED, actions.length); n++) {
    let pick: number;
    [pick, rng] = nextInt(rng, actions.length);
    const action = actions[pick]!;
    const result = applyAction(state, by, action);
    if (!result.ok) out.push(`${by} was offered ${JSON.stringify(action)} but it was refused (${result.error})`);
  }
  return [out, rng];
}

/** Plays one game and fails on the first step that breaks an invariant, naming everything needed to replay it. */
function check(name: string, from: typeof setup, steps: number, seed: number): GameState {
  let rng: RngState = seed * 7919 + 1;
  return play(steps, seed, from, (state, input, step) => {
    let problems: string[];
    [problems, rng] = refused(state, input, rng);
    problems = [...broken(state), ...problems];
    // The state survives the JSON the server stores it as (#111): no Map, Set, Date, undefined, NaN or Infinity creeping in.
    if (step % JSON_EVERY === 0 && !isDeepStrictEqual(JSON.parse(JSON.stringify(state)), state)) problems.push("the state changes through JSON");
    if (problems.length > 0) expect.fail(`${name} seed ${seed}, step ${step}, after ${JSON.stringify(input)}:\n${problems.join("\n")}`);
  }).state;
}

/** Two cycles a day, so a short game crosses day boundaries (spoilage, daily resets) without the cost of a long one. */
const shortDays = { ...setup, config: { ...setup.config, cycleHours: 12, cyclesPerDay: 2 } };

/**
 * The games, one test each to stay inside the per-test budget: three in `npm test` and `verify`, more under `npm run test:slow`
 * (two pre-selection ships and six games per `REPLAY_SEEDS` seed), where more seeds catch rarer paths.
 */
const preselectionSeeds = slowRun ? seedsFrom(100).flatMap((s) => [s, s + 1000]) : [100];
const shortDaySeeds = slowRun ? seedsFrom(200).flatMap((s) => Array.from({ length: 6 }, (_, i) => s + i * 1000)) : [200, 1200];

describe("invariants under random play (#112)", () => {
  it.each(preselectionSeeds)("hold after every step of a ship filling in pre-selection, seed %i", (seed) => {
    expect(check("preselection", preselectionSetup, 150, seed).preselection, "the ship filled").toBe(false);
  });

  it.each(shortDaySeeds)("hold after every step of a game that crosses a day boundary, seed %i", (seed) => {
    expect(dayOf(check("shortDays", shortDays, 400, seed)).day, "the game passed a day").toBeGreaterThan(1);
  });
});
