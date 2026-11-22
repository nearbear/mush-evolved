import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, legalActions } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { seedsFrom } from "./randomGame.ts";
import { clone, makeSeats, nextCycle } from "./support.ts";

// #108: applyAction accepts an action exactly when legalActions offers it. A short seeded walk visits varied
// states; at each one every offered action must be accepted, and every action made by swapping one id in an
// offered action (an item, a room, a player) for another of its kind must be accepted only if it too is offered.
// Every applyAction clones the whole state (~0.2 ms even when refused), so the walk checks only the player about
// to act at each step, with two swaps per id: under half a second a seed. verify runs one seed; npm run test:slow
// (REPLAY_SEEDS=5, and CI) runs five.

const SEEDS = seedsFrom(1);
const STEPS = 15;
const SWAPS_PER_ACTION = 2;

/** A tiny seeded generator for the walk itself, separate from the game's RNG. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

const key = (a: Action) => JSON.stringify(a);

/** Every action made by replacing one id-valued string in `action` with another id of the same pool. */
function swaps(action: Action, pools: string[][], pick: (n: number) => number): Action[] {
  const out: Action[] = [];
  const visit = (obj: Record<string, unknown>, path: string[]) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "type") continue;
      if (v && typeof v === "object" && !Array.isArray(v)) visit(v as Record<string, unknown>, [...path, k]);
      if (typeof v !== "string") continue;
      const pool = pools.find((p) => p.includes(v));
      if (!pool) continue;
      for (let i = 0; i < SWAPS_PER_ACTION; i++) {
        const other = pool[pick(pool.length)]!;
        if (other === v) continue;
        const copy = JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
        let at = copy;
        for (const p of path) at = at[p] as Record<string, unknown>;
        at[k] = other;
        out.push(copy as Action);
      }
    }
  };
  visit(action as unknown as Record<string, unknown>, []);
  return out;
}

function checkPlayer(state: GameState, id: string, pick: (n: number) => number) {
  const pools = [
    state.items.map((i) => i.id),
    Object.keys(state.config.rooms),
    state.players.map((p) => p.id),
  ];
  const legal = legalActions(state, id);
  const legalKeys = new Set(legal.map(key));
  for (const a of legal) {
    const r = applyAction(state, id, a);
    expect(r.ok, `${id} offered but refused ${key(a)}${r.ok ? "" : `: ${r.error}`}`).toBe(true);
    for (const b of swaps(a, pools, pick)) {
      const ok = applyAction(state, id, b).ok;
      expect(ok, `${id} ${ok ? "accepted unoffered" : "refused offered"} ${key(b)}`).toBe(legalKeys.has(key(b)));
    }
  }
}

describe("legality (#108)", () => {
  it("accepts exactly the offered actions, and swapped ids only when they are offered too", () => {
    for (const seed of SEEDS) {
      const pick = lcg(seed);
      let state = createGame(makeSeats(4), DEFAULT_CONFIG, seed);
      for (let step = 0; step < STEPS && state.phase === "playing"; step++) {
        const living = state.players.filter((p) => p.alive);
        const actor = living[pick(living.length)]!;
        checkPlayer(state, actor.id, pick);
        const legal = legalActions(state, actor.id);
        if (legal.length === 0 || step % 10 === 9) {
          state = nextCycle(state);
          continue;
        }
        const r = applyAction(state, actor.id, legal[pick(legal.length)]!);
        if (r.ok) state = r.state;
      }
    }
  });

  it("refuses everything from a dead player", () => {
    const state = createGame(makeSeats(4), DEFAULT_CONFIG, 1);
    const offered = legalActions(state, "p0");
    const dead = clone(state);
    dead.players.find((p) => p.id === "p0")!.alive = false;
    expect(legalActions(dead, "p0")).toEqual([]);
    for (const a of offered) expect(applyAction(dead, "p0", a).ok, key(a)).toBe(false);
  });
});
