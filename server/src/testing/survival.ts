// Development only (bot-goals.md, "Direction", point 1): plays one ship headless with a scripted GoalBot on every seat
// and no Mush, until the ship is lost, the crew is dead, or a day cap, and reports how long it lasted and what killed
// it. The benchmark for the bots: a change is good if ships last longer on the same seeds. Never a mode players can
// start (owner, 2026-11-10): a setup can't ask for zero Mush, only this helper does. No model, no network, no clock: the
// rules run here as GameRoom runs them, and timed actions finish on a simulated clock, so a seed always plays the same.

import { applyInput, CHARACTERS, createGame, legalActions, nextDue, resolveConfig, shuffle, viewFor, type DeathCause, type Ending, type GameState, type Input, type PlayerId, type Seat } from "@mush2/shared";
import { GoalBot } from "../bots.ts";

export interface SurvivalOptions {
  /** Stop counting after this many days (owner, 2026-11-11: 30 by default). */
  days: number;
  /** Seats, all bots (16 by default, a full ship). */
  crew: number;
  /** No incidents (breakage, fires, tremors): the incident budget is zero. */
  noIncidents?: boolean;
  /** Called with each line of a cycle-by-cycle trace (one seed, `--verbose`). */
  trace?: (line: string) => void;
}

/** How a run ended: the game's endings, `survived` (reached the day cap) or `stalled` (a harness or bot bug, never survival). */
export type SurvivalEnd = Ending | "survived" | "stalled";

export interface DaySnapshot {
  day: number;
  hull: number;
  oxygen: number;
  fuel: number;
  alive: number;
  broken: number;
  fires: number;
  hunters: number;
}

export interface SurvivalResult {
  seed: number;
  crew: string[];
  end: SurvivalEnd;
  /** Cycles in a day (config), to turn cycles into days. */
  cyclesPerDay: number;
  /** The last day and cycle played (at the cap: the cap). */
  day: number;
  cycle: number;
  deaths: { day: number; cycle: number; character: string; cause: DeathCause | "unknown" }[];
  /** The ship at the end of each day (and where the run ended). */
  days: DaySnapshot[];
  /** How often each goal (by id) was started. */
  goals: Record<string, number>;
  /** Times a bot was asked for its next step (the harness's cost, and a sign of goals churning). */
  decisions: number;
  /** Messages bots sent that aren't actions (sharing a planet, #417), by type, counting only the accepted ones. Absent in runs saved before. */
  social?: Record<string, number>;
  /** Times the ship traveled to a new place (the Commander, #417), from the public log line. Absent in runs saved before. */
  jumps?: number;
  /** Steps a bot returned that the rules refused (should be 0: goals step only from `legalIn`). */
  refused: number;
}

/** Rounds in one cycle before the run counts as stalled: far above what 16 bots spending their AP need. */
const ROUNDS_PER_CYCLE = 2_000;

export function survivalGame(seed: number, opts: Pick<SurvivalOptions, "crew" | "noIncidents">): GameState {
  if (!(opts.crew >= 2 && opts.crew <= CHARACTERS.length)) throw new Error(`crew must be 2 to ${CHARACTERS.length}`);
  // Every character may be a bot here (trial only, as in model.trial.ts); the crew is drawn with the seed.
  const [drawn] = shuffle(CHARACTERS.map((c) => c.id), seed);
  const seats: Seat[] = drawn.slice(0, opts.crew).map((character, i) => ({
    id: `p${i}`,
    // i18n-ignore: a player name in a dev harness; no player sees it
    name: `Bot ${i} (AI)`,
    isBot: true,
    character,
  }));
  const game = createGame(seats, resolveConfig({ mushCount: 0, manualCycles: true, instantExpeditions: true }), seed);
  if (!opts.noIncidents) return game;
  // A zero budget: the pool gets nothing at cycle changes, so the chance of an incident stays 0 (incidents.ts).
  const never = 1_000_000;
  return { ...game, config: { ...game.config, incidents: { ...game.config.incidents, budget: { base: [0], tier1: { fromDay: never, bonus: 0 }, tier2: { fromDay: never, bonus: 0 } } } } };
}

const dayOfCycle = (game: GameState, cycle: number): number => Math.floor((cycle - 1) / game.config.cyclesPerDay) + 1;
const dayOf = (game: GameState): number => dayOfCycle(game, game.cycle);

function snapshot(game: GameState): DaySnapshot {
  return {
    day: dayOf(game),
    hull: game.ship.hull,
    oxygen: game.ship.oxygen,
    fuel: game.ship.fuel,
    alive: game.players.filter((p) => p.alive).length,
    broken: Object.values(game.equipment).flat().filter((e) => e.broken).length,
    fires: game.fires.length,
    hunters: game.hunters.list.length,
  };
}

export async function runSurvival(seed: number, opts: SurvivalOptions): Promise<SurvivalResult> {
  let game = survivalGame(seed, opts);
  const trace = opts.trace ?? (() => {});
  const bots = new Map<PlayerId, GoalBot>(game.players.map((p, i) => [p.id, new GoalBot(seed * 1_000 + i)]));
  const result: SurvivalResult = { seed, crew: game.players.map((p) => p.character), end: "survived", cyclesPerDay: game.config.cyclesPerDay, day: 1, cycle: 1, deaths: [], days: [], goals: {}, social: {}, jumps: 0, decisions: 0, refused: 0 };
  const lastGoal = new Map<PlayerId, string | null>();
  let now = 0;
  let logSeen = game.nextLogId;

  const apply = (input: Input): boolean => {
    const r = applyInput(game, input);
    if (r.ok) game = r.state;
    return r.ok;
  };
  const idle = (id: PlayerId): boolean => {
    const p = game.players.find((q) => q.id === id)!;
    return p.alive && p.current === null && p.queue.length === 0 && legalActions(game, id).length > 0;
  };
  /** Deaths since the last look, with the cause from the room's `died` line (#177), and the ship's jumps. */
  const noteDeaths = (): void => {
    for (const e of game.log) {
      if (e.id < logSeen) continue;
      if (e.key === "shipTraveled") {
        result.jumps!++;
        trace("  the ship traveled");
      }
      if (e.key !== "died") continue;
      const p = game.players.find((q) => q.character === e.params?.name);
      const cause = (e.params?.cause as DeathCause | undefined) ?? "unknown";
      result.deaths.push({ day: dayOf(game), cycle: game.cycle, character: String(e.params?.name), cause });
      trace(`  died: ${p?.id ?? "?"} (${String(e.params?.name)}), ${cause}`);
    }
    logSeen = game.nextLogId;
  };

  const lastCycle = opts.days * game.config.cyclesPerDay;
  while (game.phase === "playing" && game.cycle <= lastCycle) {
    const cycle = game.cycle;
    let rounds = 0;
    while (game.cycle === cycle && game.phase === "playing") {
      if (++rounds > ROUNDS_PER_CYCLE) {
        result.end = "stalled";
        break;
      }
      // Each idle bot decides on the state as it stands then, in seat order, as the room's bot timers fire one by one.
      let acted = false;
      for (const [id, bot] of bots) {
        if (game.cycle !== cycle || game.phase !== "playing") break;
        if (!idle(id)) continue;
        result.decisions++;
        const action = await bot.decideAction(viewFor(game, id));
        const goal = bot.current;
        if (goal !== null && goal !== lastGoal.get(id)) {
          const kind = goal.split(":")[0]!;
          result.goals[kind] = (result.goals[kind] ?? 0) + 1;
        }
        lastGoal.set(id, goal);
        // A message that isn't an action (sharing a planet, #417), as the room sends it; that turn has no action.
        const social = bot.takeSocial();
        if (social) {
          if (apply({ ...social, by: id })) {
            acted = true;
            result.social![social.type] = (result.social![social.type] ?? 0) + 1;
          } else {
            result.refused++;
            bot.refused();
          }
        }
        if (!action) continue;
        if (game.players.find((p) => p.id === id)!.ready && action.type === "ready") continue;
        if (apply({ type: "action", action, by: id, at: now })) acted = true;
        else {
          result.refused++;
          bot.refused();
        }
        now += 50;
      }
      noteDeaths();
      if (acted) continue;
      // Nobody could act: let the clock run to the next timed action, as the room's alarm does.
      const due = nextDue(game);
      if (due === null) {
        result.end = "stalled";
        break;
      }
      now = Math.max(now, due);
      apply({ type: "tick", at: now });
      noteDeaths();
    }
    if (result.end === "stalled") break;
    // The ship at the end of each day, and where the game ended.
    const day = dayOfCycle(game, cycle);
    if (game.phase !== "playing" || dayOf(game) !== day) result.days.push({ ...snapshot(game), day });
    const s = snapshot(game);
    trace(`cycle ${cycle}: hull ${s.hull}, oxygen ${s.oxygen}, fuel ${s.fuel}, alive ${s.alive}, broken ${s.broken}, fires ${s.fires}, hunters ${s.hunters}`);
  }
  if (game.phase === "ended") result.end = game.ending ?? "stalled";
  const last = Math.min(game.cycle, lastCycle);
  result.cycle = last;
  result.day = dayOfCycle(game, last);
  if (result.end === "stalled") {
    if (result.days.at(-1)?.day !== result.day) result.days.push(snapshot(game));
    for (const p of game.players) {
      trace(`  ${p.id} ${p.alive ? "" : "dead "}ready ${p.ready} current ${p.current?.action.type ?? "-"} queue ${p.queue.length} ap ${p.ap} room ${p.room} goal ${bots.get(p.id)!.current ?? "-"}`);
    }
  }
  return result;
}
