// Development only (bot-goals.md, "Direction", point 1): the survival harness. Plays many seeds with scripted bots on
// every seat and no Mush (runSurvival, src/testing/survival.ts) and reports how long each ship lasted and what killed it.
// Free: no model, no network.
//
//   npm run survival -w server -- [--seeds 1-50] [--days 30] [--crew 16] [--no-incidents] [--out run.json] [--compare base.json] [--verbose <seed>]
//
// Runs under Vitest like model.trial.ts (the rules import JSON the bundler way), never in `npm test`. Arguments come
// through TRIAL_ARGS, which run-trial.mjs sets. `--out` saves the results; `--compare` prints each seed's change against
// a saved run, so "ships last longer on the same seeds" is one command. `--jobs N` splits the seeds across N processes
// (half the cores by default); `--verbose <seed>` traces one seed cycle by cycle.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { test } from "vitest";
import { runSurvival, type SurvivalResult } from "../src/testing/survival.ts";

const { values: args } = parseArgs({
  args: JSON.parse(process.env.TRIAL_ARGS ?? "[]") as string[],
  options: {
    seeds: { type: "string", default: "1-20" },
    days: { type: "string", default: "30" },
    crew: { type: "string", default: "16" },
    "no-incidents": { type: "boolean", default: false },
    out: { type: "string" },
    compare: { type: "string" },
    verbose: { type: "string" },
    /** Seeds run in this many processes at once (the rules cost a few ms per input, so a 30-day run takes minutes). */
    jobs: { type: "string", default: String(Math.max(1, Math.floor(availableParallelism() / 2))) },
    /** A child process of `--jobs`: runs its seeds, writes `--out`, prints no summary. */
    part: { type: "boolean", default: false },
  },
});

/** A path as the caller typed it: Vitest runs this from server/; TRIAL_CWD (run-trial.mjs) is where `npm run` was typed. */
const fromCaller = (path: string): string => resolve(process.env.TRIAL_CWD ?? process.cwd(), path);

/** "1-50", "3", or "1,4,9". */
function parseSeeds(spec: string): number[] {
  return spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`bad --seeds: ${spec}`);
    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
  });
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const tally = (xs: string[]): string =>
  Object.entries(xs.reduce<Record<string, number>>((t, x) => ({ ...t, [x]: (t[x] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ") || "none";
/** Days lasted, with a fraction for the cycle: a run that ended in cycle 3 of day 5 lasted 4.25 days at 8 cycles a day. */
const lasted = (r: SurvivalResult): number => (r.end === "survived" ? r.day : (r.cycle - 1) / r.cyclesPerDay);

async function play(seeds: number[], days: number, crew: number, verbose: boolean): Promise<SurvivalResult[]> {
  const results: SurvivalResult[] = [];
  for (const seed of seeds) {
    const t0 = performance.now();
    const r = await runSurvival(seed, { days, crew, noIncidents: args["no-incidents"], ...(verbose && { trace: (l: string) => console.log(l) }) });
    results.push(r);
    const first = r.deaths[0];
    console.log(
      `seed ${seed}: ${r.end} on day ${r.day} (cycle ${r.cycle}), decisions ${r.decisions}, deaths ${r.deaths.length}${first ? ` (first day ${first.day}, ${first.cause})` : ""}, hull ${r.days.at(-1)?.hull}, oxygen ${r.days.at(-1)?.oxygen}, fuel ${r.days.at(-1)?.fuel}, ${((performance.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
  return results;
}

/** Runs the seeds round-robin in `jobs` child processes (this same trial with `--part`) and gathers their results. */
async function inParallel(seeds: number[], jobs: number): Promise<SurvivalResult[]> {
  const dir = mkdtempSync(join(tmpdir(), "survival-"));
  try {
    const parts = Array.from({ length: jobs }, (_, j) => seeds.filter((_, i) => i % jobs === j));
    const shared = ["--days", args.days, "--crew", args.crew, ...(args["no-incidents"] ? ["--no-incidents"] : [])];
    await Promise.all(
      parts.map(
        (part, j) =>
          new Promise<void>((resolve, reject) => {
            const env = { ...process.env, TRIAL_FILE: "survival", TRIAL_ARGS: JSON.stringify(["--seeds", part.join(","), ...shared, "--part", "--out", join(dir, `${j}.json`)]) };
            const child = spawn("npx", ["vitest", "run", "--config", "scripts/vitest.trial.config.ts", "--silent=false", "--reporter=dot"], { env, cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "inherit"] });
            // Only the children's seed lines, not Vitest's own output.
            child.stdout.on("data", (b: Buffer) => {
              for (const line of b.toString().split("\n")) if (line.startsWith("seed ")) console.log(line);
            });
            child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`job ${j} exited ${code}`))));
          }),
      ),
    );
    return parts.flatMap((_, j) => JSON.parse(readFileSync(join(dir, `${j}.json`), "utf8")) as SurvivalResult[]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("survival", { timeout: 3_600_000 }, async () => {
  const days = Number(args.days);
  const crew = Number(args.crew);
  const verbose = args.verbose === undefined ? null : Number(args.verbose);
  const seeds = verbose === null ? parseSeeds(args.seeds) : [verbose];
  const started = performance.now();
  const jobs = Math.min(Number(args.jobs), seeds.length);
  const results = jobs > 1 && !args.part ? await inParallel(seeds, jobs) : await play(seeds, days, crew, verbose !== null);
  if (args.part) {
    writeFileSync(fromCaller(args.out!), JSON.stringify(results));
    return;
  }
  results.sort((a, b) => a.seed - b.seed);

  const kept = results.map(lasted);
  console.log(`\n${seeds.length} seeds, crew ${crew}, cap ${days} days${args["no-incidents"] ? ", no incidents" : ""}, ${((performance.now() - started) / 1000).toFixed(0)}s`);
  console.log(`days lasted: median ${median(kept).toFixed(2)}, mean ${(kept.reduce((a, b) => a + b, 0) / Math.max(1, kept.length)).toFixed(2)}, min ${Math.min(...kept).toFixed(2)}, max ${Math.max(...kept).toFixed(2)}`);
  console.log(`endings: ${tally(results.map((r) => r.end))}`);
  console.log(`deaths: ${tally(results.flatMap((r) => r.deaths.map((d) => d.cause)))}`);
  const firsts = results.flatMap((r) => (r.deaths[0] ? [r.deaths[0].day] : []));
  console.log(`first death: median day ${firsts.length ? median(firsts) : "-"} (${firsts.length} of ${results.length} runs had one)`);
  // The day each resource first hit 0, per run that ran it out: which one runs out first.
  for (const key of ["oxygen", "fuel", "hull"] as const) {
    const out = results.flatMap((r) => r.days.find((d) => d[key] <= 0)?.day ?? []);
    console.log(`${key} at 0: ${out.length} runs${out.length ? `, median day ${median(out)}` : ""}`);
  }
  const goals: Record<string, number> = {};
  for (const r of results) for (const [k, n] of Object.entries(r.goals)) goals[k] = (goals[k] ?? 0) + n;
  console.log(`goals started: ${Object.entries(goals).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const social: Record<string, number> = {};
  for (const r of results) for (const [k, n] of Object.entries(r.social ?? {})) social[k] = (social[k] ?? 0) + n;
  if (Object.keys(social).length > 0) console.log(`messages sent: ${Object.entries(social).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const refused = results.reduce((a, r) => a + r.refused, 0);
  if (refused) console.log(`refused steps: ${refused} (should be 0)`);

  if (args.compare) {
    const compare = fromCaller(args.compare);
    if (!existsSync(compare)) throw new Error(`no such file: ${compare}`);
    const base = new Map((JSON.parse(readFileSync(compare, "utf8")) as SurvivalResult[]).map((r) => [r.seed, r]));
    let better = 0;
    let worse = 0;
    const deltas: number[] = [];
    for (const r of results) {
      const b = base.get(r.seed);
      if (!b) continue;
      const d = lasted(r) - lasted(b);
      deltas.push(d);
      if (d > 0) better++;
      if (d < 0) worse++;
      if (d !== 0) console.log(`  seed ${r.seed}: ${lasted(b).toFixed(2)} -> ${lasted(r).toFixed(2)} days (${b.end} -> ${r.end})`);
    }
    console.log(`against ${args.compare}: ${deltas.length} shared seeds, longer ${better}, shorter ${worse}, same ${deltas.length - better - worse}, mean change ${(deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)).toFixed(2)} days`);
  }
  if (args.out) writeFileSync(fromCaller(args.out), JSON.stringify(results));
});
