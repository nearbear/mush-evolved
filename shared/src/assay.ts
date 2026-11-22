// Research samples and assays (docs/plans/archive/research-sabotage.md; owner, 2026-10-30/31). A research's relay tokens (relay.ts)
// are samples to players. A new sample is pending; an assay tests all of a research's pending samples together when
// the best arrangement of verified plus pending samples reaches the next assay mark above verified progress (25, 50,
// 75, 100). A contaminated sample always spoils and every other one spoils at `spoilChance` (the noise), so a spoil
// never proves who caused it. Spoiled samples are removed as if never made; the rest become verified and never spoil.
// Verified progress never falls: spoils only remove pending samples, and adding samples never lowers the best
// arrangement (relay.ts). Pure; rolls come from the seeded RNG.

import { poolProgress, type RelayProgressConfig, type ResearchPool, type Sample } from "./relay.ts";
import { rollFloat, rollInt } from "./rng.ts";
import type { GameState, PlayerId } from "./types.ts";

/** A research's verified progress and the striped pending segment above it (the best arrangement of all its samples, minus verified). */
export function researchProgress(pool: Readonly<ResearchPool>, config: Readonly<RelayProgressConfig>, complete: number): { verified: number; pending: number } {
  const verified = poolProgress({ tokens: pool.tokens }, config, complete).progress;
  const all = poolProgress({ tokens: [...pool.tokens, ...pool.pending] }, config, complete).progress;
  return { verified, pending: all - verified };
}

/** The first assay mark above `verified`, or null past the last one. */
export function nextMark(marks: readonly number[], verified: number): number | null {
  return marks.find((mark) => mark > verified) ?? null;
}

/** Whether the striped total has reached the next mark, so an assay is due. */
export function assayDue(pool: Readonly<ResearchPool>, config: Readonly<RelayProgressConfig>, marks: readonly number[], complete: number): boolean {
  const { verified, pending } = researchProgress(pool, config, complete);
  const mark = nextMark(marks, verified);
  return pool.pending.length > 0 && mark !== null && verified + pending >= mark;
}

/** Counts by contributor, in the order each first appears. */
export type SampleCounts = [by: PlayerId, count: number][];

function countBy(samples: readonly Readonly<Sample>[]): SampleCounts {
  const counts = new Map<PlayerId, number>();
  for (const s of samples) counts.set(s.by, (counts.get(s.by) ?? 0) + 1);
  return [...counts];
}

/**
 * Tests every pending sample (mutates `pool`): one noise roll per pending sample in sample order, drawn whether or not
 * it is contaminated, so the RNG's use never depends on contamination. Returns who was tested and whose spoiled.
 */
export function runAssay(state: GameState, pool: ResearchPool, spoilChance: number): { tested: SampleCounts; spoiled: SampleCounts } {
  const tested = countBy(pool.pending);
  const spoiled: Sample[] = [];
  for (const sample of pool.pending) {
    const noise = rollFloat(state) < spoilChance;
    if (sample.contaminatedBy !== undefined || noise) spoiled.push(sample);
    else pool.tokens.push(withoutContamination(sample));
  }
  pool.pending = [];
  return { tested, spoiled: countBy(spoiled) };
}

function withoutContamination(sample: Readonly<Sample>): Sample {
  const { contaminatedBy: _, ...token } = sample;
  return token;
}

/**
 * The pending samples Saboteur's Contaminate could hit (owner, 2026-10-31): made by someone else, not already
 * contaminated, and by a contributor with the fewest samples (verified and pending) in this research among them. Never
 * by role. Empty when there is none.
 */
export function contaminationCandidates(pool: Readonly<ResearchPool>, saboteur: PlayerId): Readonly<Sample>[] {
  const eligible = pool.pending.filter((s) => s.by !== saboteur && s.contaminatedBy === undefined);
  if (eligible.length === 0) return [];
  const counts = new Map(countBy([...pool.tokens, ...pool.pending]));
  const least = Math.min(...eligible.map((s) => counts.get(s.by)!));
  return eligible.filter((s) => counts.get(s.by) === least);
}

/** Contaminates one of `contaminationCandidates`, a tie broken by the seeded RNG. Returns false if there was none. */
export function contaminate(state: GameState, pool: ResearchPool, saboteur: PlayerId): boolean {
  const candidates = contaminationCandidates(pool, saboteur);
  if (candidates.length === 0) return false;
  const target = candidates.length === 1 ? candidates[0]! : candidates[rollInt(state, candidates.length)]!;
  (target as Sample).contaminatedBy = saboteur;
  return true;
}
