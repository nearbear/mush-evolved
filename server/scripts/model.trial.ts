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
import { applyInput, CHARACTERS, createGame, nextDue, legalActions, moderateChat, readChannels, resolveConfig, singlePlayerGame, viewFor, SINGLE_PLAYER_HUMAN, type ChannelId, type GameState, type Input, type PlayerId } from "@mush2/shared";
import { BOT_CHAT_CHAIN_DEPTH, ModelBot, type Ranked } from "../src/bots.ts";
import type { BotMessage } from "../src/prompt.ts";
import type { Goal } from "../src/bots/goals/index.ts";
import { completeOpenAi, ModelGate, type Complete } from "../src/model.ts";

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
    /** With --fake: always pick the first goal (the registry order is roughly the priority order). */
    "fake-ready": { type: "boolean", default: false },
    /** Rounds the human waits after every bot has ended its cycle before ending theirs (a real player takes a while). */
    linger: { type: "string", default: "0" },
    /** Writes the first prompt to this file. */
    "dump-prompt": { type: "string" },
    /** Stops a cycle after this many model calls (a loop guard). Default: 12 per bot. */
    "calls-per-cycle": { type: "string" },
    /** Crew size, the human included. Above single player's 9, every character may be a bot (trial only, not the game). */
    crew: { type: "string", default: "9" },
    /** No incidents (breakage, fires): the incident budget is zero, so the pool never fills. Trial only. */
    "no-incidents": { type: "boolean", default: false },
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
  calls.push({ ms: 0, prompt: 0, completion: 0, reasoning: 0, cost: 0, finish: "fake" });
  if (args["fake-ready"]) return "GOAL: 1";
  fakeRng = (fakeRng * 1103515245 + 12345) % 2 ** 31;
  return `GOAL: ${(fakeRng % n) + 1}`;
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
// A bigger crew than single player's 9 (trial only): the same bot seats, then every other character in list order.
const crew = Number(args.crew);
if (!(crew >= 2 && crew <= CHARACTERS.length)) throw new Error(`--crew must be 2 to ${CHARACTERS.length}`);
const [humanSeat, botSeat] = [setup.seats[0]!, setup.seats[1]!];
const drawn = setup.seats.slice(1).map((s) => s.character);
const others = CHARACTERS.map((c) => c.id).filter((id) => id !== humanSeat.character && !drawn.includes(id));
const botSeats = [...drawn, ...others].slice(0, crew - 1).map((character, i) => ({ ...botSeat, id: `p${i + 1}`, name: `Bot ${i + 1} (AI)`, character }));
let game: GameState = createGame([humanSeat, ...botSeats], resolveConfig(setup.overrides), seed, setup.forcedRoles);
if (args["no-incidents"]) {
  // A zero budget: the pool gets nothing at cycle changes, so the chance of an incident stays 0 (incidents.ts).
  const never = 1_000_000;
  game = { ...game, config: { ...game.config, incidents: { ...game.config.incidents, budget: { base: [0], tier1: { fromDay: never, bonus: 0 }, tier2: { fromDay: never, bonus: 0 } } } } };
}
let now = 0;

let fallbacks = 0;
const goalsChosen: Record<string, number> = {};
/** Counts the goals chosen, and the choices made by priority instead of the model (garbage reply, choice cap). */
class Counted extends ModelBot {
  protected override async choose(...args: Parameters<ModelBot["choose"]>): Promise<Goal | null> {
    const goal = await super.choose(...args);
    if (goal) goalsChosen[goal.id] = (goalsChosen[goal.id] ?? 0) + 1;
    return goal;
  }
  protected override byPriority(options: readonly Ranked[]): Goal {
    fallbacks++;
    return super.byPriority(options);
  }
}
const bots = new Map<PlayerId, ModelBot>(game.players.filter((p) => p.isBot).map((p, i) => [p.id, new Counted(gate, seed + i)]));

function apply(input: Input): string | null {
  const r = applyInput(game, input);
  if (!r.ok) return r.error;
  game = r.state;
  return null;
}

/** Like GameRoom.wakeBots and botSay, without the rate limit: per bot, the depth of the message that woke it. */
const wakes = new Map<PlayerId, number>();
let messages = 0;
function say(id: PlayerId, message: BotMessage, depth: number): void {
  const pair = (c: { members: PlayerId[] }, to: PlayerId) => c.members.length === 2 && c.members.includes(id) && c.members.includes(to);
  let channel: ChannelId | undefined = "channel" in message ? message.channel : game.channels.find((c) => pair(c, message.to))?.id;
  if (channel === undefined && "to" in message) {
    if (apply({ type: "createChannel", members: [message.to], by: id })) return;
    const opened = game.channels.filter((c) => c.createdBy === id).at(-1);
    if (!opened) return;
    if (!pair(opened, message.to)) {
      apply({ type: "leaveChannel", channel: opened.id, by: id });
      return;
    }
    channel = opened.id;
  }
  const moderated = moderateChat(message.text);
  if (!moderated.ok || apply({ type: "chat", channel: channel!, text: moderated.text, by: id })) return;
  messages++;
  console.log(`  ${id} (${game.players.find((p) => p.id === id)!.character}) [${channel}${"to" in message ? ` to ${message.to}` : ""}] depth ${depth}: ${moderated.text}`);
  if (depth >= BOT_CHAT_CHAIN_DEPTH) return;
  for (const [other, bot] of bots) {
    const p = game.players.find((q) => q.id === other)!;
    if (other !== id && readChannels(game, p).includes(channel!) && bot.wake()) wakes.set(other, depth);
  }
}

const idle = (id: PlayerId): boolean => {
  const p = game.players.find((pl) => pl.id === id)!;
  return p.current === null && p.queue.length === 0 && legalActions(game, id).length > 0;
};

// Deaths have no recorded cause yet (#177): print each one with the player's last seen stats, to tell hunger from injury.
const lastSeen = new Map(game.players.map((p) => [p.id, { alive: p.alive, hp: p.hp, morale: p.morale, satiety: p.satiety, room: p.room }]));
let logSeen = 0;
function noteDeaths(): void {
  for (const p of game.players) {
    const before = lastSeen.get(p.id)!;
    if (p.hp < before.hp || (before.alive && !p.alive)) {
      const mine = game.log.slice(logSeen).filter((e) => (e.visibleTo === "all" || e.visibleTo.includes(p.id)) && (e.room === before.room || Object.values(e.params ?? {}).includes(p.character)));
      console.log(`  hp ${p.id} (${p.character}) ${before.hp} -> ${p.hp} in cycle ${game.cycle} in ${before.room}: ${mine.map((e) => e.key).join(", ") || "no log entry"}`);
    }
    if (before.alive && !p.alive) console.log(`  died in cycle ${game.cycle}: ${p.id} (${p.character}) last hp ${before.hp} morale ${before.morale} satiety ${before.satiety} in ${before.room}, hull ${game.ship.hull}`);
    lastSeen.set(p.id, { alive: p.alive, hp: p.hp, morale: p.morale, satiety: p.satiety, room: p.room });
  }
  logSeen = game.log.length;
}

const perCycle: { cycle: number; calls: number; perBot: Record<PlayerId, number>; readyRepeats: number; wallMs: number }[] = [];
const cycles = Number(args.cycles);
const callsPerCycleLimit = args["calls-per-cycle"] ? Number(args["calls-per-cycle"]) : 12 * bots.size;
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
        const depth = wakes.get(id);
        wakes.delete(id);
        const action = await bots.get(id)!.decideAction(viewFor(game, id));
        return { id, action, wasReady, depth, message: bots.get(id)!.takeMessage() };
      }),
    );
    for (const { id, action, wasReady, depth, message } of decided) {
      if (message) say(id, message, depth === undefined ? 0 : depth + 1);
      row.perBot[id] = (row.perBot[id] ?? 0) + 1;
      if (!action) {
        stats.nulls++;
        continue;
      }
      if (wasReady && action.type === "ready") row.readyRepeats++;
      chosen[action.type] = (chosen[action.type] ?? 0) + 1;
      if (apply({ type: "action", action, by: id, at: now })) stats.illegal++;
    }
    if (calls.length === before && decided.every((d) => d.action === null)) {
      // Bots hold off on ready while a living human is unready; once every bot is waiting and no wake or timer is pending, the passive human readies.
      if (idle(SINGLE_PLAYER_HUMAN) && wakes.size === 0 && gate.pause === null && (lingered++ >= Number(args.linger) || nextDue(game) === null)) {
        apply({ type: "action", action: { type: "ready" }, by: SINGLE_PLAYER_HUMAN, at: now });
        continue;
      }
      break;
    }
    // Like GameRoom.afterBotTurn: while calls fail in passing, wait before asking again, doubling up to a minute.
    if (gate.pause === "unavailable") {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    } else backoff = 2_000;
    now += 50;
    noteDeaths();
  }
  row.calls = calls.length - callsAtStart;
  noteDeaths();
  row.wallMs = performance.now() - t0;
  perCycle.push(row);
  console.log(`cycle ${cycle}: ${row.calls} calls, ${(row.wallMs / 1000).toFixed(1)}s, ready repeats ${row.readyRepeats}, hull ${game.ship.hull}, $${spent.toFixed(4)} so far`);
  {
    const alive = game.players.filter((p) => p.alive);
    const mean = (f: (p: (typeof alive)[number]) => number) => (alive.reduce((a, p) => a + f(p), 0) / Math.max(1, alive.length)).toFixed(1);
    const turrets = Object.values(game.equipment).flat().filter((t) => t.type === "TURRET_COMMAND").map((t) => `${game.turrets[t.id] ?? game.config.turrets.charges}${t.broken ? "b" : ""}`).join("/");
    console.log(`  hunters ${game.hunters.list.length} (hp ${game.hunters.list.reduce((a, h) => a + h.hp, 0)}, pool ${game.hunters.points}), turret charges ${turrets}; living ${alive.length}: hp ${mean((p) => p.hp)}, morale ${mean((p) => p.morale)}, satiety ${mean((p) => p.satiety)}, ap ${mean((p) => p.ap)}`);
  }
  if (game.phase !== "playing") {
    console.log(`game ended in cycle ${game.cycle}: ${game.winner} (${JSON.stringify(game.ending)}); hull ${game.ship.hull}, alive ${game.players.filter((p) => p.alive).length}/${game.players.length}`);
    break;
  }
  if (game.cycle === cycle) {
    // Why the game stopped short: the phase, and where each player stands (full state: this is a dev harness).
    console.log(`stopped in cycle ${cycle}: phase ${game.phase}, gate pause ${gate.pause ?? "none"}`);
    for (const p of game.players) {
      const goal = bots.get(p.id)?.current ?? "-";
      console.log(`  ${p.id} ${p.alive ? "" : "dead "}ready ${p.ready} current ${p.current?.action.type ?? "-"} queue ${p.queue.length} ap ${p.ap} mp ${p.mp} room ${p.room} goal ${goal} legal ${legalActions(game, p.id).length}`);
    }
    break;
  }
}

// ---- Report --------------------------------------------------------------------------------------------------------

const ok = calls.filter((c) => !c.error);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
const unparsed = replies.filter((r) => !/(GOAL:\s*\d+|HELP:|SAY:)/i.test(r.reply) && !/^\d+$/.test(r.reply.trim())).length;
const lengths = calls.filter((c) => c.finish === "length").length;
const cyclesDone = perCycle.length;

console.log(`\nmodel ${args.model}${args.extra ? ` extra ${args.extra}` : ""}${args["max-tokens"] ? ` max_tokens ${args["max-tokens"]}` : ""}; crew ${crew}${args["no-incidents"] ? ", no incidents" : ""}`);
console.log(`cycles ${cyclesDone}, calls ${calls.length} (${(calls.length / Math.max(1, cyclesDone) / bots.size).toFixed(1)} per bot per cycle), errors ${calls.length - ok.length}, wall ${((performance.now() - started) / 1000).toFixed(0)}s`);
console.log(`tokens per call: prompt ${avg(ok.map((c) => c.prompt)).toFixed(0)}, completion ${avg(ok.map((c) => c.completion)).toFixed(0)} (reasoning ${avg(ok.map((c) => c.reasoning)).toFixed(0)}, max ${Math.max(0, ...ok.map((c) => c.completion))})`);
console.log(`latency ms: p50 ${pct(ok.map((c) => c.ms), 0.5).toFixed(0)}, p90 ${pct(ok.map((c) => c.ms), 0.9).toFixed(0)}, max ${Math.max(0, ...ok.map((c) => c.ms)).toFixed(0)}`);
console.log(`replies: ${replies.length}, without GOAL ${unparsed}, cut off by max_tokens ${lengths}; fallbacks ${fallbacks}; messages ${messages}; nulls ${stats.nulls}; illegal ${stats.illegal}`);
console.log(`cost: $${spent.toFixed(4)} this run, $${(spent / Math.max(1, calls.length)).toFixed(6)} per call, $${((spent / Math.max(1, cyclesDone)) * 8).toFixed(4)} per game day`);
console.log(`goals (model calls and choices by priority): ${Object.entries(goalsChosen).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`actions: ${Object.entries(chosen).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
for (const e of new Set(calls.filter((c) => c.error).map((c) => c.error))) console.log(`  error: ${e}`);
const sample = replies.filter((r) => !/GOAL:\s*\d+\s*$/i.test(r.reply.trim())).slice(0, 3);
for (const r of sample) console.log(`  odd reply: ${JSON.stringify(r.reply.slice(0, 200))}`);

if (ledgerPath) writeFileSync(ledgerPath, String(spentBefore + spent));
});
