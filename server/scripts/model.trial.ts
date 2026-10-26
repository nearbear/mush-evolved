// Development only (#224): plays a single-player game headless with the real ModelBot and ModelGate against a hosted
// model, and reports tokens, latency, calls per bot per cycle and reply quality. No browser, no wrangler: the rules
// run here, the way GameRoom runs them (a bot is asked whenever it is idle; timed actions finish on a simulated clock).
//
//   npm run model-trial -w server -- --model google/gemini-2.5-flash-lite --cycles 8 [--fake] [--extra '{"reasoning":{"effort":"low"}}']
//
// It runs under Vitest (vitest.trial.config.ts, never part of `npm test`) because the rules import JSON the bundler
// way, which plain Node refuses. Arguments come through TRIAL_ARGS, which the npm script sets.
//
// The key comes from MODEL_API_KEY in server/.dev.vars (never printed). OpenRouter only: it reports each call's cost.
// `--ledger <file>` keeps a running total across runs and `--cap <usd>` refuses to start or go on past it.
// `--fake` answers at random without the network, to check the harness for free.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { test } from "vitest";
import { applyInput, createGame, nextDue, legalActions, resolveConfig, singlePlayerGame, viewFor, SINGLE_PLAYER_HUMAN, type GameState, type Input, type PlayerId } from "@mush2/shared";
import { ModelBot, WanderBot, type Bot } from "../src/bots.ts";
import { completeOpenAi, ModelGate, type Complete } from "../src/model.ts";
import { choices } from "../src/prompt.ts";

const { values: args } = parseArgs({
  args: JSON.parse(process.env.TRIAL_ARGS ?? "[]") as string[],
  options: {
    model: { type: "string", default: "google/gemini-2.5-flash-lite" },
    cycles: { type: "string", default: "8" },
    "max-tokens": { type: "string" },
    extra: { type: "string" },
    ledger: { type: "string" },
    cap: { type: "string", default: "3" },
    seed: { type: "string", default: "1" },
    fake: { type: "boolean", default: false },
    /** With --fake: always pick End cycle when it is offered. */
    "fake-ready": { type: "boolean", default: false },
    /** Rounds the human waits after every bot has ended its cycle before ending theirs (a real player takes a while). */
    linger: { type: "string", default: "0" },
    /** Writes the first prompt to this file. */
    "dump-prompt": { type: "string" },
    "calls-per-cycle": { type: "string", default: "60" },
  },
});

const cap = Number(args.cap);
const ledgerPath = args.ledger;
const spentBefore = ledgerPath && existsSync(ledgerPath) ? Number(readFileSync(ledgerPath, "utf8")) || 0 : 0;
if (spentBefore >= cap) throw new Error(`Ledger at $${spentBefore.toFixed(4)}, cap $${cap}: refusing to run`);

function devVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const path = new URL("../.dev.vars", import.meta.url);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]*)"?\\s*$`, "m"))?.[1]?.trim();
}
const apiKey = args.fake ? "fake" : devVar("MODEL_API_KEY");
if (!apiKey) throw new Error("No MODEL_API_KEY in server/.dev.vars");

// ---- Measuring: a fetch wrapper adds the body overrides and reads each reply's usage --------------------------------

interface Call {
  ms: number;
  prompt: number;
  completion: number;
  reasoning: number;
  cost: number;
  finish: string;
  error?: string;
}
const calls: Call[] = [];
let spent = 0;
const overrides = { ...(args.extra ? JSON.parse(args.extra) : {}), ...(args["max-tokens"] && { max_tokens: Number(args["max-tokens"]) }), usage: { include: true } };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const body = { ...JSON.parse(String(init?.body)), ...overrides };
  const start = performance.now();
  const res = await realFetch(input, { ...init, body: JSON.stringify(body) });
  const text = await res.text();
  const ms = performance.now() - start;
  try {
    const json = JSON.parse(text);
    const u = json.usage ?? {};
    const call: Call = {
      ms,
      prompt: u.prompt_tokens ?? 0,
      completion: u.completion_tokens ?? 0,
      reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
      cost: u.cost ?? 0,
      finish: json.choices?.[0]?.finish_reason ?? "none",
      ...(json.error && { error: `${json.error.code ?? ""} ${String(json.error.message ?? "").slice(0, 80)}` }),
    };
    calls.push(call);
    spent += call.cost;
  } catch {
    calls.push({ ms, prompt: 0, completion: 0, reasoning: 0, cost: 0, finish: `http ${res.status}`, error: "not json" });
  }
  return new Response(text, { status: res.status, headers: res.headers });
};

let fakeRng = Number(args.seed);
const fakeComplete: Complete = async (_c, turns) => {
  const lines = turns[1]!.content.split("\n").filter((l) => /^\d+\. /.test(l));
  const n = lines.length;
  const ready = lines.findIndex((l) => l.includes('{"type":"ready"}'));
  if (args["fake-ready"] && ready >= 0) {
    calls.push({ ms: 0, prompt: 0, completion: 0, reasoning: 0, cost: 0, finish: "fake" });
    return `ACTION: ${ready + 1}`;
  }
  fakeRng = (fakeRng * 1103515245 + 12345) % 2 ** 31;
  calls.push({ ms: 0, prompt: 0, completion: 0, reasoning: 0, cost: 0, finish: "fake" });
  return `ACTION: ${(fakeRng % n) + 1}`;
};

test("model trial", { timeout: 3_600_000 }, async () => {
// ---- The game ------------------------------------------------------------------------------------------------------

const replies: { reply: string; options: number }[] = [];
const complete: Complete = async (credentials, turns, signal) => {
  if (args["dump-prompt"] && replies.length === 0) writeFileSync(args["dump-prompt"], turns.map((t) => `### ${t.role}\n${t.content}`).join("\n\n"));
  const reply = await (args.fake ? fakeComplete : completeOpenAi)(credentials, turns, signal);
  replies.push({ reply, options: turns[1]!.content.split("\n").filter((l) => /^\d+\. /.test(l)).length });
  return reply;
};
// Matches GameRoom's gate, apart from the budget (the cap here is in dollars).
const gate = new ModelGate({ baseUrl: "https://openrouter.ai/api/v1", model: args.model, apiKey }, { budget: 100_000, maxInFlight: 2, timeoutMs: 20_000, complete });

const seed = Number(args.seed);
const setup = singlePlayerGame("Trial", "kuanti", seed);
let game: GameState = createGame(setup.seats, resolveConfig(setup.overrides), seed, setup.forcedRoles);
let now = 0;

let fallbacks = 0;
class Counted implements Bot {
  constructor(private bot: Bot) {}
  decideAction: Bot["decideAction"] = (v) => {
    fallbacks++;
    return this.bot.decideAction(v);
  };
}
const bots = new Map<PlayerId, ModelBot>(game.players.filter((p) => p.isBot).map((p, i) => [p.id, new ModelBot(gate, new Counted(new WanderBot(seed + i)))]));

function apply(input: Input): string | null {
  const r = applyInput(game, input);
  if (!r.ok) return r.error;
  game = r.state;
  return null;
}

const idle = (id: PlayerId): boolean => {
  const p = game.players.find((pl) => pl.id === id)!;
  return p.current === null && p.queue.length === 0 && legalActions(game, id).length > 0;
};

const perCycle: { cycle: number; calls: number; perBot: Record<PlayerId, number>; readyRepeats: number; wallMs: number }[] = [];
const cycles = Number(args.cycles);
const callsPerCycleLimit = Number(args["calls-per-cycle"]);
const stats = { illegal: 0, nulls: 0 };
const chosen: Record<string, number> = {};
const started = performance.now();

for (let c = 0; c < cycles && game.phase === "playing" && spent + spentBefore < cap; c++) {
  const cycle = game.cycle;
  const row = { cycle, calls: 0, perBot: {} as Record<PlayerId, number>, readyRepeats: 0, wallMs: 0 };
  const t0 = performance.now();
  const callsAtStart = calls.length;
  let lingered = 0;
  let backoff = 2_000;
  // One round: every idle bot decides on the same state (as the room's parallel timers do), then the choices apply.
  while (game.cycle === cycle && game.phase === "playing") {
    if (calls.length - callsAtStart >= callsPerCycleLimit) {
      console.log(`  cycle ${cycle}: stopped at ${callsPerCycleLimit} calls (loop?)`);
      break;
    }
    if (spent + spentBefore >= cap) break;
    const ready = [...bots.keys()].filter(idle);
    const allBotsReady = [...bots.keys()].every((id) => game.players.find((p) => p.id === id)!.ready || !game.players.find((p) => p.id === id)!.alive);
    // The human (a passive Mush here) ends their cycle once every bot has.
    if (allBotsReady && idle(SINGLE_PLAYER_HUMAN) && (lingered++ >= Number(args.linger) || (ready.length === 0 && nextDue(game) === null))) {
      apply({ type: "action", action: { type: "ready" }, by: SINGLE_PLAYER_HUMAN, at: now });
      continue;
    }
    if (ready.length === 0) {
      const due = nextDue(game);
      if (due === null) break;
      now = Math.max(now, due);
      apply({ type: "tick", at: now });
      continue;
    }
    const before = calls.length;
    const decided = await Promise.all(
      ready.map(async (id) => {
        const wasReady = game.players.find((p) => p.id === id)!.ready;
        const action = await bots.get(id)!.decideAction(viewFor(game, id));
        return { id, action, wasReady };
      }),
    );
    for (const { id, action, wasReady } of decided) {
      row.perBot[id] = (row.perBot[id] ?? 0) + 1;
      if (!action) {
        stats.nulls++;
        continue;
      }
      if (wasReady && action.type === "ready") row.readyRepeats++;
      chosen[action.type] = (chosen[action.type] ?? 0) + 1;
      if (apply({ type: "action", action, by: id, at: now })) stats.illegal++;
    }
    if (calls.length === before && decided.every((d) => d.action === null)) break;
    // Like GameRoom.afterBotTurn: while calls fail in passing, wait before asking again, doubling up to a minute.
    if (gate.pause === "unavailable") {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    } else backoff = 2_000;
    now += 50;
  }
  row.calls = calls.length - callsAtStart;
  row.wallMs = performance.now() - t0;
  perCycle.push(row);
  console.log(`cycle ${cycle}: ${row.calls} calls, ${(row.wallMs / 1000).toFixed(1)}s, ready repeats ${row.readyRepeats}, $${spent.toFixed(4)} so far`);
  if (game.cycle === cycle) break;
}

// ---- Report --------------------------------------------------------------------------------------------------------

const ok = calls.filter((c) => !c.error);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
const unparsed = replies.filter((r) => !/ACTION:\s*\d+/i.test(r.reply) && !/^\d+$/.test(r.reply.trim())).length;
const lengths = calls.filter((c) => c.finish === "length").length;
const cyclesDone = perCycle.length;

console.log(`\nmodel ${args.model}${args.extra ? ` extra ${args.extra}` : ""}${args["max-tokens"] ? ` max_tokens ${args["max-tokens"]}` : ""}`);
console.log(`cycles ${cyclesDone}, calls ${calls.length} (${(calls.length / Math.max(1, cyclesDone) / bots.size).toFixed(1)} per bot per cycle), errors ${calls.length - ok.length}, wall ${((performance.now() - started) / 1000).toFixed(0)}s`);
console.log(`tokens per call: prompt ${avg(ok.map((c) => c.prompt)).toFixed(0)}, completion ${avg(ok.map((c) => c.completion)).toFixed(0)} (reasoning ${avg(ok.map((c) => c.reasoning)).toFixed(0)}, max ${Math.max(0, ...ok.map((c) => c.completion))})`);
console.log(`latency ms: p50 ${pct(ok.map((c) => c.ms), 0.5).toFixed(0)}, p90 ${pct(ok.map((c) => c.ms), 0.9).toFixed(0)}, max ${Math.max(0, ...ok.map((c) => c.ms)).toFixed(0)}`);
console.log(`replies: ${replies.length}, without ACTION ${unparsed}, cut off by max_tokens ${lengths}; fallbacks ${fallbacks}; nulls ${stats.nulls}; illegal ${stats.illegal}`);
console.log(`cost: $${spent.toFixed(4)} this run, $${(spent / Math.max(1, calls.length)).toFixed(6)} per call, $${((spent / Math.max(1, cyclesDone)) * 8).toFixed(4)} per game day`);
console.log(`chosen: ${Object.entries(chosen).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
for (const e of new Set(calls.filter((c) => c.error).map((c) => c.error))) console.log(`  error: ${e}`);
const sample = replies.filter((r) => !/ACTION:\s*\d+\s*$/i.test(r.reply.trim())).slice(0, 3);
for (const r of sample) console.log(`  odd reply: ${JSON.stringify(r.reply.slice(0, 200))}`);

if (ledgerPath) writeFileSync(ledgerPath, String(spentBefore + spent));
});
