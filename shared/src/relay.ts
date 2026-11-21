// Relay tokens (docs/plans/relay-tokens.md; owner, 2026-10-30/31), shared by research, NERON projects and PILGRED. Each
// contribution adds a token to its target's pool instead of rolling a gain at once. The target's progress is the best
// total any ordering of its tokens could give under the original's relay penalty (`getBaseProgress` in
// Mush/src/common/Solver.hx): each token in a row by the same player loses `relayPenalty` more. Players never arrange
// anything; the game finds the best ordering, so the crew no longer has to take turns live.

import { roll, rollFloat, type HasRng } from "./rng.ts";
import { hasSkill, type SkillId } from "./skills.ts";
import type { GameState, PlayerId, PlayerState } from "./types.ts";

/** The knobs of one thing's formula (`config.pilgred.progress`, `config.research.progress`, `config.project.progress`). */
export type RelayProgressConfig = { rate: number; mod: number; skillBoost: number; relayPenalty: number };

/**
 * One contribution. `base` is its worth before the penalty, fixed when it is made (a later skill pick never rewrites it);
 * `roll` is a luck draw in [0, 1), made then from the seeded RNG so a replay is deterministic. The pool's rolls go to
 * slots, not to their own tokens (`poolProgress`; owner, 2026-10-31). `unpenalized` is set when the
 * noRelayPenalty cheat was on: the token then counts as if from a player of its own (owner, 2026-10-31).
 */
export type RelayToken = { by: PlayerId; base: number; roll: number; unpenalized?: true };

/** A target's tokens, kept for the target's lifetime (owner, 2026-10-31). The rolls are never sent in a view. */
export type RelayPool = { tokens: RelayToken[] };

/**
 * A research token, which players call a sample (docs/plans/research-sabotage.md). `contaminatedBy` is set by a Mush's own
 * spoil (their own id) or by Saboteur's Contaminate: the sample spoils at the next assay. Never in a view.
 */
export type Sample = RelayToken & { contaminatedBy?: PlayerId };

/**
 * A research's pool: `tokens` are the verified samples (they passed an assay and can never spoil), `pending` the
 * samples made since the last assay (assay.ts).
 */
export type ResearchPool = { tokens: Sample[]; pending: Sample[] };

/** What Migraine takes off each relay contribution (owner, 2026-11-15). */
export const MIGRAINE_RELAY_MALUS = 2;

/**
 * A contribution's worth before the penalty: `rate * mod / 10` (rounded down), plus `bonus` (e.g. BIOS CPU priority),
 * plus `skillBoost` for each matching skill, minus `MIGRAINE_RELAY_MALUS` for a human with Migraine, never below 0.
 */
export function tokenBase(config: Readonly<RelayProgressConfig>, player: Readonly<PlayerState>, skills: readonly SkillId[], bonus = 0): number {
  let base = Math.floor((config.rate * config.mod) / 10) + bonus;
  for (const skill of skills) if (hasSkill(player, skill)) base += config.skillBoost;
  if (player.role === "human" && player.modifiers.includes("migraine_disease")) base -= MIGRAINE_RELAY_MALUS;
  return Math.max(0, base);
}


/** Makes this player's token, drawing its roll from the seeded RNG. */
export function makeToken(state: GameState, config: Readonly<RelayProgressConfig>, player: Readonly<PlayerState>, skills: readonly SkillId[], bonus = 0): RelayToken {
  const token: RelayToken = { by: player.id, base: tokenBase(config, player, skills, bonus), roll: rollFloat(state) };
  if (player.cheats.includes("noRelayPenalty")) token.unpenalized = true;
  return token;
}

/** A value `g` rolled in [g, g + g/2] by `roll` in [0, 1). */
export function rolled(g: number, roll: number): number {
  return g + Math.floor(roll * ((g >> 1) + 1));
}

/**
 * The penalty each token takes in the best ordering, by index into `tokens`. Only the player with the most tokens can be
 * penalized, and only when they hold more than everyone else combined plus one: then their tokens are split into as
 * even runs as possible between the others' tokens, and their highest bases take the lowest
 * penalties. That maximizes the sum of `max(0, base - penalty)` over every ordering (docs/plans/relay-tokens.md, "The formula").
 */
export function arrangeTokens(tokens: readonly Readonly<RelayToken>[], relayPenalty: number): number[] {
  const penalties = tokens.map(() => 0);
  const counts = new Map<PlayerId, number>();
  for (const t of tokens) if (!t.unpenalized) counts.set(t.by, (counts.get(t.by) ?? 0) + 1);
  let dominant: PlayerId | null = null;
  let c = 0;
  for (const [by, count] of counts) {
    if (count > c) [dominant, c] = [by, count];
  }
  const m = tokens.length - c;
  if (dominant === null || c <= m + 1) return penalties;
  // c split into m + 1 runs: r runs of q + 1, the rest of q. A run's k-th token (from 0) loses k * relayPenalty.
  const runs = m + 1;
  const q = Math.floor(c / runs);
  const r = c % runs;
  const slots: number[] = [];
  for (let run = 0; run < runs; run++) {
    const length = q + (run < r ? 1 : 0);
    for (let k = 0; k < length; k++) slots.push(k * relayPenalty);
  }
  slots.sort((a, b) => a - b);
  const mine = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.by === dominant && !t.unpenalized)
    .sort((a, b) => b.t.base - a.t.base || a.i - b.i);
  mine.forEach(({ i }, n) => {
    penalties[i] = slots[n]!;
  });
  return penalties;
}

/** What a pool adds up to, capped at `complete`. */
export type PoolProgress = {
  /** The best ordering's total. */
  progress: number;
  /** How much more the pool would be worth with every penalty waived: held back only for lack of other contributors. */
  waiting: number;
  /** Each token's value in the best ordering, by index into `pool.tokens`. */
  values: number[];
};

/**
 * The pool's progress, its waiting work and each token's value (pure). The pool's rolls, highest first, go to the tokens'
 * values before the roll, highest first (ties by token order). Owner, 2026-10-31: a token keeping its own roll could make
 * progress fall when one player's tokens have different bases; this pairing never does (tests/relay.test.ts).
 */
export function poolProgress(pool: Readonly<RelayPool>, config: Readonly<RelayProgressConfig>, complete = 100): PoolProgress {
  const penalties = arrangeTokens(pool.tokens, config.relayPenalty);
  const values = withRolls(pool.tokens, pool.tokens.map((t, i) => Math.max(0, t.base - penalties[i]!)));
  const progress = Math.min(complete, sum(values));
  const full = Math.min(complete, sum(withRolls(pool.tokens, pool.tokens.map((t) => t.base))));
  return { progress, waiting: Math.max(0, full - progress), values };
}

/** Rolls each of `gs` (by token index) with the pool's rolls, the highest roll to the highest value. */
function withRolls(tokens: readonly Readonly<RelayToken>[], gs: readonly number[]): number[] {
  const rolls = tokens.map((t) => t.roll).sort((a, b) => b - a);
  const order = gs.map((g, i) => ({ g, i })).sort((a, b) => b.g - a.g || a.i - b.i);
  const values = gs.map(() => 0);
  order.forEach(({ g, i }, n) => {
    values[i] = rolled(g, rolls[n]!);
  });
  return values;
}

/** The highest roll a token can draw (just under 1), for the top of `contributionGain`'s range. */
const TOP_ROLL = 1 - Number.EPSILON;

/**
 * How much the target goes up if this player contributes now, as a range over their token's roll: it can be more than
 * their token is worth alone when it breaks up someone else's streak (owner, 2026-10-31). Pure: no roll is drawn.
 */
export function contributionGain(pool: Readonly<RelayPool>, config: Readonly<RelayProgressConfig>, player: Readonly<PlayerState>, skills: readonly SkillId[], complete = 100, bonus = 0): { min: number; max: number } {
  const now = poolProgress(pool, config, complete).progress;
  const token = (roll: number): RelayToken => ({ by: player.id, base: tokenBase(config, player, skills, bonus), roll, ...(player.cheats.includes("noRelayPenalty") ? { unpenalized: true as const } : {}) });
  const after = (roll: number) => poolProgress({ tokens: [...pool.tokens, token(roll)] }, config, complete).progress - now;
  return { min: after(0), max: after(TOP_ROLL) };
}

/** Adds this player's token to `pool` and returns the target's new progress. */
export function contribute(state: GameState, pool: RelayPool, config: Readonly<RelayProgressConfig>, player: Readonly<PlayerState>, skills: readonly SkillId[], complete = 100, bonus = 0): number {
  pool.tokens.push(makeToken(state, config, player, skills, bonus));
  return poolProgress(pool, config, complete).progress;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Who contributed last to a non-pooled target (NERON projects) and how many times in a row. Never sent. */
export interface RelayStreak {
  lastBy: PlayerId | null;
  streak: number;
}

/**
 * The gain range of one contribution: its base (`tokenBase`), minus
 * `relayPenalty` for each contribution in a row this player has just made (it resets once someone else contributes; the
 * noRelayPenalty cheat waives it), never below 0. The gain is rolled in [min, min + min / 2].
 */
export function relayGainRange(
  config: Readonly<RelayProgressConfig>,
  player: Readonly<PlayerState>,
  skills: readonly SkillId[],
  last: Readonly<RelayStreak> | null | undefined,
  bonus = 0,
): { min: number; max: number } {
  const relaying = last?.lastBy === player.id && !player.cheats.includes("noRelayPenalty");
  const streak = relaying ? last.streak : 0;
  const base = tokenBase(config, player, skills, bonus);
  const min = Math.max(0, Math.min(100, base - streak * config.relayPenalty));
  return { min, max: Math.min(100, min + (min >> 1)) };
}

/** Rolls one contribution's gain with the seeded RNG (no draw when the range is a single value). */
export function rollRelayGain(state: HasRng, range: { min: number; max: number }): number {
  return range.max === range.min ? range.min : roll(state, [range.min, range.max]);
}

/** Records this player's contribution to `id`: their streak grows if they were last, else it restarts at 1. */
export function touchRelay(streaks: Record<string, RelayStreak>, id: string, player: PlayerId): void {
  const prev = streaks[id];
  streaks[id] = prev?.lastBy === player ? { lastBy: player, streak: prev.streak + 1 } : { lastBy: player, streak: 1 };
}
