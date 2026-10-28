// The original's relay formula (`getBaseProgress` in Mush/src/common/Solver.hx), shared by research, NERON projects and PILGRED:
// progress per action falls when the same player contributes to the same thing several times in a row, so the crew relays.

import { roll } from "./rng.ts";
import { hasSkill, type SkillId } from "./skills.ts";
import type { GameState, PlayerId, PlayerState } from "./types.ts";

/** The knobs of one thing's formula (`config.pilgred.progress`, `config.research.progress`, `config.project.progress`). */
export type RelayProgressConfig = { rate: number; mod: number; skillBoost: number; relayPenalty: number };

/** Who contributed last to one target and how many times in a row. Not sent in any view. */
export type RelayStreak = { lastBy: PlayerId | null; streak: number };

/**
 * The gain range of one contribution: `rate * mod / 10` (rounded down), plus `skillBoost` for each matching skill, minus
 * `relayPenalty` for each contribution in a row this player has just made (it resets once someone else contributes; the
 * noRelayPenalty cheat waives it), never below 0. The gain is rolled in [min, min + min / 2].
 */
export function relayGainRange(config: Readonly<RelayProgressConfig>, player: Readonly<PlayerState>, skills: readonly SkillId[], last: Readonly<RelayStreak> | null | undefined): { min: number; max: number } {
  const relaying = last?.lastBy === player.id && !player.cheats.includes("noRelayPenalty");
  const streak = relaying ? last.streak : 0;
  let base = Math.floor((config.rate * config.mod) / 10);
  for (const skill of skills) if (hasSkill(player, skill)) base += config.skillBoost;
  base = Math.max(0, base - streak * config.relayPenalty);
  return { min: base, max: base + (base >> 1) };
}

/** Rolls one contribution's gain with the seeded RNG (no draw when the range is a single value). */
export function rollRelayGain(state: GameState, range: { min: number; max: number }): number {
  return range.max === range.min ? range.min : roll(state, [range.min, range.max]);
}

/** Records this player's contribution to `id`: their streak grows if they were last, else it restarts at 1. */
export function touchRelay(streaks: Record<string, RelayStreak>, id: string, player: Readonly<PlayerState>): void {
  const last = streaks[id];
  streaks[id] = { lastBy: player.id, streak: last?.lastBy === player.id ? last.streak + 1 : 1 };
}
