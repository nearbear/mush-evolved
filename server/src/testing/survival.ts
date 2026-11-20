// Development only (bot-goals.md, "Direction", point 1): plays one ship headless with a scripted GoalBot on every seat
// and no Mush, until the ship is lost, the crew is dead, or a day cap, and reports how long it lasted and what killed
// it. The benchmark for the bots: a change is good if ships last longer on the same seeds. Never a mode players can
// start (owner, 2026-11-10): a setup can't ask for zero Mush, only this helper does. No model, no network, no clock: the
// rules run here as GameRoom runs them, and timed actions finish on a simulated clock, so a seed always plays the same.

import { applyInput, CHARACTERS, ITEM_TYPES, createGame, dailyMoraleLoss, legalActions, nextDue, resolveConfig, shuffle, viewFor, type DeathCause, type Ending, type GameState, type Input, type PlayerId, type Seat } from "@mush2/shared";
import { GoalBot } from "../bots.ts";
import { BOT_DUTIES } from "../bots/duties.ts";
import { expeditionsOver, parseExpeditionLine } from "../bots/expeditionShare.ts";
import { readyToLeaveOrbit } from "../bots/goals/travel.ts";
import type { BotMemory } from "../bots/goals/types.ts";
import { HOLD_JUMP_LINE } from "../bots/planetShare.ts";

export interface SurvivalOptions {
  /** Stop counting after this many days (owner, 2026-11-11: 30 by default). */
  days: number;
  /** Seats, all bots (16 by default, a full ship). */
  crew: number;
  /** No incidents (breakage, fires, tremors): the incident budget is zero. */
  noIncidents?: boolean;
  /** Oxygen never burns: takes asphyxia out of a run, to study another killer alone. */
  noOxygen?: boolean;
  /** No hunter waves: the pool never grows. */
  noHunters?: boolean;
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

/**
 * One cycle of a run, for the loss report (`--report`): what threatened the ship and what the crew did about it. The
 * state fields are as the cycle ended, before the change; `hullLost` and `arrived` are what that change then did.
 */
export interface CycleReport {
  cycle: number;
  hull: number;
  oxygen: number;
  alive: number;
  /** Hunters outside as the cycle ended. */
  hunters: number;
  /** Rooms on fire as the cycle ended: each may cost the hull at the change (`config.fire`), like a hunter. */
  fires: number;
  /** Hunters destroyed during the cycle, and hunters left behind by a jump. */
  killed: number;
  shed: number;
  /** Turret and patrol ship shots fired. */
  shots: number;
  repairTries: number;
  repairs: number;
  /** AP left over the living crew as the cycle ended, and how many of them stood at their AP cap (AP wasted). */
  apLeft: number;
  atCap: number;
  /** Metal scraps aboard (in rooms or carried), and how many of them are carried. */
  scraps: number;
  scrapsCarried: number;
  /** AP spent by action type while hunters were outside: by bots holding a hunter-fighting skill, and by the rest. */
  apShooters: Record<string, number>;
  apOthers: Record<string, number>;
  /** Hull lost at the cycle change that ended this cycle, and hunters that arrived in it. */
  hullLost: number;
  arrived: number;
  /** Rooms that caught fire (in the cycle and at the change that ended it), and fires put out in it (#429). Missing in older runs. */
  firesStarted?: number;
  firesOut?: number;
  extinguishTries?: number;
  /** Broken oxygen tanks as the cycle ended (each leaks `config.repair.oxygenLeak` at the change), and tank repairs tried and done in it (#443). Missing in older runs. */
  brokenTanks?: number;
  tankRepairTries?: number;
  tankRepairs?: number;
  /** Living humans' mean morale as the cycle ended, how many stood at 0 (Hopeless) and at 3 or less (#452). Missing in older runs. */
  moraleMean?: number;
  hopeless?: number;
  moraleLow?: number;
  /**
   * Morale the living crew gained and lost in the cycle and at the change that ended it, by source (#452): an action's
   * type (the actor's and anyone else's change from it), `tick` (timed actions finishing), and at a cycle change
   * `panicAttack`, `hopelessDeath`, `dayEnd` and `changeOther` (diseases and the rest), split in that order and each
   * capped by what was actually lost (morale stops at 0). Missing in older runs.
   */
  moraleUp?: Record<string, number>;
  moraleDown?: Record<string, number>;
  /**
   * Oxygen that came in during the cycle and at the change that ended it, by source: `plants` (day start), `expedition`
   * (an Oxygen sector), `capsule` (returned to a tank), `other`. Missing in older runs.
   */
  oxygenIn?: Record<string, number>;
  /**
   * The oxygen pipeline as the cycle ended: planets found by anyone, of them with an Oxygen sector not yet explored,
   * and whether the ship orbits one of those (`orbitOxygen`) or any planet (`orbit`). `expeditions`: expeditions that
   * landed in the cycle (the Icarus or a patrol ship). Missing in older runs.
   */
  planets?: number;
  oxygenPlanets?: number;
  orbit?: boolean;
  orbitOxygen?: boolean;
  expeditions?: number;
  /** Planets shared in the bots' format (the Astrophysicist naming a destination), and jumps, in the cycle. Missing in older runs. */
  shares?: number;
  jumps?: number;
  /**
   * The coffee relay (bots/goals/coffee.ts), in the cycle: coffees pulled from the machine, drunk by a Caffeine Junkie
   * and by anyone else, and meals other than coffee a Caffeine Junkie ate. Missing in older runs.
   */
  coffeePulled?: number;
  coffeeJunkie?: number;
  coffeeOthers?: number;
  junkieMeals?: number;
  /**
   * Beds (oxygen plan Run A2): AP bots spent on moves while following `rest` (walking to a bed, or from a full bedroom to
   * the next) in the cycle, and how many of the living crew lay in a bed as the cycle ended. Missing in older runs.
   */
  restWalkAp?: number;
  lying?: number;
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
  /**
   * Every jump: the cycle; whether it heads for a planet (else an escape jump into empty space); hunters attacking and
   * oxygen just before it; cycles since `"Jump: hold"` first went up (null if none did); planets anyone held; free
   * planet slots of the living Astrophysicists; and the destination's unexplored Oxygen sectors. Absent in runs saved before.
   */
  jumpLog?: { cycle: number; toPlanet: boolean; hunters: number; oxygen: number; heldFor: number | null; planets: number; astroFree: number; oxygenSectors: number }[];
  /** Every orbit: the cycle it began and ended (null: the run ended in orbit), the planet's Oxygen sectors, expeditions launched and oxygen they brought, and the cycle every sector was first explored (`allExplored`, from the state, not the bots' reports). Absent in runs saved before. */
  orbitLog?: { from: number; to: number | null; oxygenSectors: number; expeditions: number; oxygen: number; allExplored?: number }[];
  /** Steps a bot returned that the rules refused (should be 0: goals step only from `legalIn`). */
  refused: number;
  /** Cycle by cycle, for the loss report. Absent in runs saved before. */
  cycles?: CycleReport[];
}

/** Rounds in one cycle before the run counts as stalled: far above what 16 bots spending their AP need. */
const ROUNDS_PER_CYCLE = 2_000;

/** The skills whose duty is fighting hunters (`BOT_DUTIES`): the report splits AP between their holders and the rest. */
const HUNTER_SKILLS: ReadonlySet<string> = new Set(BOT_DUTIES.flatMap((d) => (d.when === "hunters" && d.skill ? [d.skill] : [])));

export function survivalGame(seed: number, opts: Pick<SurvivalOptions, "crew" | "noIncidents" | "noOxygen" | "noHunters">): GameState {
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
  // Each switch takes one killer out of the run, so another can be studied alone (the game is created first: the
  // crew and the seed's draws stay the same).
  let config = game.config;
  // A zero budget: the pool gets nothing at cycle changes, so the chance of an incident stays 0 (incidents.ts).
  const never = 1_000_000;
  if (opts.noIncidents) config = { ...config, incidents: { ...config.incidents, budget: { base: [0], tier1: { fromDay: never, bonus: 0 }, tier2: { fromDay: never, bonus: 0 } } } };
  if (opts.noOxygen) config = { ...config, ship: { ...config.ship, oxygen: { ...config.ship.oxygen, perCycle: 0 } } };
  if (opts.noHunters) config = { ...config, hunters: { ...config.hunters, waveChance: 0 } };
  return config === game.config ? game : { ...game, config };
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

const addInto = (into: Record<string, number>, from: Record<string, number>): void => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};

/**
 * Morale gained and lost by the players alive after one input, by source (#452). Within a cycle the source is the
 * input (an action's type, or `tick:` and the timed action the player had going). At a cycle change each player's loss is split in the order the rules apply it:
 * a panic attack (their private `panicAttack` line), the crew's charge for depression deaths, the day's end, and the
 * rest (diseases and the like); a gain at the change is `changeGain`.
 */
function moraleDeltas(before: GameState, after: GameState, fresh: GameState["log"], changed: boolean, source: string): { up: Record<string, number>; down: Record<string, number> } {
  const up: Record<string, number> = {};
  const down: Record<string, number> = {};
  const depression = fresh.filter((e) => e.key === "died" && e.params?.cause === "depression").length;
  const dayEnded = changed && dayOfCycle(after, after.cycle) !== dayOfCycle(before, before.cycle);
  const dayLoss = dayEnded ? dailyMoraleLoss(before) : 0;
  for (const p of after.players) {
    if (!p.alive) continue;
    const was = before.players.find((q) => q.id === p.id)?.morale ?? p.morale;
    const delta = p.morale - was;
    if (delta === 0) continue;
    if (!changed) {
      // A tick finishes timed actions: name the one this player had going.
      const from = source === "tick" ? `tick:${before.players.find((q) => q.id === p.id)?.current?.action.type ?? "-"}` : source;
      (delta > 0 ? up : down)[from] = ((delta > 0 ? up : down)[from] ?? 0) + Math.abs(delta);
      continue;
    }
    if (delta > 0) {
      up.changeGain = (up.changeGain ?? 0) + delta;
      continue;
    }
    let left = -delta;
    const take = (key: string, amount: number): void => {
      const t = Math.min(left, amount);
      if (t <= 0) return;
      down[key] = (down[key] ?? 0) + t;
      left -= t;
    };
    const panics = fresh.filter((e) => e.key === "panicAttack" && Array.isArray(e.visibleTo) && e.visibleTo.includes(p.id)).length;
    take("panicAttack", panics * after.config.incidents.panicAttack.morale);
    take("hopelessDeath", depression * after.config.hopeless.deathMorale);
    take("dayEnd", dayLoss);
    take("changeOther", left);
  }
  return { up, down };
}

export async function runSurvival(seed: number, opts: SurvivalOptions): Promise<SurvivalResult> {
  let game = survivalGame(seed, opts);
  const trace = opts.trace ?? (() => {});
  const bots = new Map<PlayerId, GoalBot>(game.players.map((p, i) => [p.id, new GoalBot(seed * 1_000 + i)]));
  const result: SurvivalResult = { seed, crew: game.players.map((p) => p.character), end: "survived", cyclesPerDay: game.config.cyclesPerDay, day: 1, cycle: 1, deaths: [], days: [], goals: {}, social: {}, jumps: 0, decisions: 0, refused: 0, cycles: [], jumpLog: [], orbitLog: [] };
  /** The cycle `"Jump: hold"` first went up since the last jump. */
  let holdPosted: number | null = null;
  const lastGoal = new Map<PlayerId, string | null>();
  let now = 0;
  let logSeen = game.nextLogId;

  const newRow = (cycle: number): CycleReport => ({ cycle, hull: 0, oxygen: 0, alive: 0, hunters: 0, fires: 0, killed: 0, shed: 0, shots: 0, repairTries: 0, repairs: 0, apLeft: 0, atCap: 0, scraps: 0, scrapsCarried: 0, apShooters: {}, apOthers: {}, hullLost: 0, arrived: 0, firesStarted: 0, firesOut: 0, extinguishTries: 0, brokenTanks: 0, tankRepairTries: 0, tankRepairs: 0, moraleUp: {}, moraleDown: {}, oxygenIn: {}, expeditions: 0, shares: 0, jumps: 0, coffeePulled: 0, coffeeJunkie: 0, coffeeOthers: 0, junkieMeals: 0, restWalkAp: 0, lying: 0 });
  let row = newRow(game.cycle);
  /** Fills the row's end-of-cycle fields from `g`, the state just before the change (or where the game ended). */
  const closeRow = (g: GameState): void => {
    const living = g.players.filter((p) => p.alive);
    const scraps = g.items.filter((i) => i.type === "metal_scraps");
    Object.assign(row, { hull: g.ship.hull, oxygen: g.ship.oxygen, alive: living.length, hunters: g.hunters.list.length, fires: g.fires.length, apLeft: living.reduce((a, p) => a + p.ap, 0), atCap: living.filter((p) => p.ap >= p.maxAp).length, scraps: scraps.length, scrapsCarried: scraps.filter((i) => i.at.kind === "player").length, brokenTanks: Object.values(g.equipment).flat().filter((e) => e.type === "OXYGEN_TANK" && e.broken).length, lying: living.filter((p) => p.lyingIn !== undefined).length });
    const planets = Object.values(g.planets).flat();
    const hasOxygen = (pl: (typeof planets)[number]): boolean => pl.sectors.some((s) => s.tag === "OXYGEN" && !s.explored);
    const orbiting = planets.find((pl) => pl.id === g.navigation.orbit);
    Object.assign(row, { planets: planets.length, oxygenPlanets: planets.filter(hasOxygen).length, orbit: g.navigation.orbit !== null, orbitOxygen: orbiting !== undefined && hasOxygen(orbiting) });
    const humans = living.filter((p) => p.role === "human");
    Object.assign(row, { moraleMean: humans.length === 0 ? 0 : humans.reduce((a, p) => a + p.morale, 0) / humans.length, hopeless: humans.filter((p) => p.morale === 0).length, moraleLow: humans.filter((p) => p.morale <= 3).length });
    const orbit = result.orbitLog!.at(-1);
    if (orbiting && orbit?.to === null && orbit.allExplored === undefined && orbiting.sectors.every((x) => x.explored)) orbit.allExplored = row.cycle;
    result.cycles!.push(row);
  };
  /** `apCost`: what the action's option said it costs, for the report (timed actions are paid for when they finish). */
  const apply = (input: Input, apCost = 0): boolean => {
    const before = game;
    const r = applyInput(game, input);
    if (!r.ok) return false;
    game = r.state;
    const fresh = game.log.filter((e) => e.id >= before.nextLogId);
    const lit = game.fires.filter((r) => !before.fires.includes(r)).length;
    const out = before.fires.filter((r) => !game.fires.includes(r)).length;
    // A change that ends the game (hull 0, the last death) ends it before the cycle counter moves.
    const ended = before.phase === "playing" && game.phase !== "playing";
    if (before.navigation.orbit === null && game.navigation.orbit !== null) {
      const pl = Object.values(game.planets).flat().find((x) => x.id === game.navigation.orbit);
      result.orbitLog!.push({ from: game.cycle, to: null, oxygenSectors: pl?.sectors.filter((x) => x.tag === "OXYGEN").length ?? 0, expeditions: 0, oxygen: 0 });
    }
    if (before.navigation.orbit !== null && game.navigation.orbit === null && result.orbitLog!.at(-1)?.to === null) result.orbitLog!.at(-1)!.to = game.cycle;
    const changed = game.cycle !== before.cycle || ended;
    const morale = moraleDeltas(before, game, fresh, changed, input.type === "action" ? input.action.type : "tick");
    const oxygenIn = (source: string, amount: number): void => {
      if (amount > 0) row.oxygenIn![source] = (row.oxygenIn![source] ?? 0) + amount;
    };
    if (changed) {
      closeRow(before);
      oxygenIn("plants", fresh.filter((e) => e.key === "plantProduced").length * game.config.botany.oxygenPerPlant);
      addInto(row.moraleUp!, morale.up);
      addInto(row.moraleDown!, morale.down);
      row.hullLost = Math.max(0, before.ship.hull - game.ship.hull);
      row.firesStarted! += lit;
      row.firesOut! += out;
      row.arrived = fresh.reduce((a, e) => a + (e.key === "hunterWave" ? Number(e.params?.count ?? 0) : 0), 0);
      if (!ended) row = newRow(game.cycle);
      return true;
    }
    addInto(row.moraleUp!, morale.up);
    addInto(row.moraleDown!, morale.down);
    const action = input.type === "action" ? input.action.type : "tick";
    // An expedition resolves as it lands or steps on (expeditions.ts), so its oxygen comes with one of these lines.
    const landed = fresh.filter((e) => e.key === "icarusTakeoff" || e.key === "patrolPlanetLanding").length;
    row.expeditions! += landed;
    const expedition = landed > 0 || before.expedition !== null || game.expedition !== null || fresh.some((e) => e.key === "expeditionReturned");
    oxygenIn(action === "return_oxygen" ? "capsule" : expedition ? "expedition" : `other:${action}`, game.ship.oxygen - before.ship.oxygen);
    if (fresh.some((e) => e.key === "shipTraveled")) {
      const dest = game.navigation.arriving?.planet ?? null;
      const planet = dest === null ? undefined : Object.values(game.planets).flat().find((pl) => pl.id === dest);
      const astros = before.players.filter((p) => p.alive && p.skills.includes("astrophysician"));
      result.jumpLog!.push({
        cycle: before.cycle,
        toPlanet: dest !== null,
        hunters: before.hunters.list.length,
        oxygen: before.ship.oxygen,
        heldFor: holdPosted === null ? null : before.cycle - holdPosted,
        planets: Object.values(before.planets).flat().length,
        astroFree: astros.reduce((a, p) => a + Math.max(0, before.config.astro.maxPlanets - (before.planets[p.id]?.length ?? 0)), 0),
        oxygenSectors: planet?.sectors.filter((x) => x.tag === "OXYGEN").length ?? 0,
      });
      holdPosted = null;
    }
    const orbits = result.orbitLog!;
    if (landed > 0 && orbits.at(-1)?.to === null) orbits.at(-1)!.expeditions += landed;
    if (expedition && orbits.at(-1)?.to === null) orbits.at(-1)!.oxygen += Math.max(0, game.ship.oxygen - before.ship.oxygen);
    const gone = before.hunters.list.length - game.hunters.list.length;
    if (gone > 0) row[fresh.some((e) => e.key === "shipTraveled") ? "shed" : "killed"] += gone;
    row.repairs += fresh.filter((e) => e.key === "hullRepaired").length;
    row.tankRepairs! += fresh.filter((e) => e.key === "repaired" && e.params?.equipment === "OXYGEN_TANK").length;
    row.firesStarted! += lit;
    row.firesOut! += out;
    if (input.type === "action") {
      const type = input.action.type;
      if (type === "turret_attack" || type === "patrol_attack") row.shots++;
      if (type === "repair_hull") row.repairTries++;
      if (type === "extinguish" || type === "extinguish_manually") row.extinguishTries!++;
      const action = input.action;
      if (action.type === "dispense") row.coffeePulled!++;
      if (action.type === "consume") {
        const eater = before.players.find((p) => p.id === input.by)!;
        const food = before.items.find((i) => i.id === action.item)?.type;
        const junkie = eater.skills.includes("caffeinomaniac");
        if (food === "coffee") row[junkie ? "coffeeJunkie" : "coffeeOthers"]!++;
        else if (junkie && (ITEM_TYPES[food ?? ""]?.consume?.satiety ?? 0) > 0) row.junkieMeals!++;
      }
      if (action.type === "repair" && "equipment" in action && Object.values(before.equipment).flat().some((e) => e.id === action.equipment && e.type === "OXYGEN_TANK")) row.tankRepairTries!++;
      if (before.hunters.list.length > 0 && apCost > 0) {
        const by = before.players.find((p) => p.id === input.by)!;
        const ap = by.skills.some((s) => HUNTER_SKILLS.has(s)) ? row.apShooters : row.apOthers;
        ap[type] = (ap[type] ?? 0) + apCost;
      }
    }
    return true;
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
        row.jumps!++;
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
        const view = viewFor(game, id);
        const action = await bot.decideAction(view);
        const goal = bot.current;
        if (goal !== null && goal !== lastGoal.get(id)) {
          const kind = goal.split(":")[0]!;
          result.goals[kind] = (result.goals[kind] ?? 0) + 1;
        }
        lastGoal.set(id, goal);
        // A message that isn't an action (sharing a planet or report, chat signal, channel, plan), as the room sends it; that turn has no action.
        const social = bot.takeSocial();
        if (social) {
          if (apply({ ...social, by: id })) {
            acted = true;
            result.social![social.type] = (result.social![social.type] ?? 0) + 1;
            if (social.type === "sharePlanet") row.shares!++;
            if (social.type === "chat" && social.text === HOLD_JUMP_LINE) holdPosted ??= game.cycle;
            if (social.type === "chat" && parseExpeditionLine(social.text)) trace(`  ${game.players.find((p) => p.id === id)!.character} says "${social.text}"`);
          } else {
            result.refused++;
            bot.refused();
          }
        }
        if (!action) continue;
        if (game.players.find((p) => p.id === id)!.ready && action.type === "ready") continue;
        const cost = view.actions.find((o) => JSON.stringify(o.action) === JSON.stringify(action))?.cost.ap ?? 0;
        if (apply({ type: "action", action, by: id, at: now }, cost)) {
          acted = true;
          if (action.type === "move" && goal?.startsWith("rest:")) row.restWalkAp! += cost;
        }
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
    if (game.navigation.orbit !== null) {
      const pl = Object.values(game.planets).flat().find((x) => x.id === game.navigation.orbit);
      const pilots = game.players.filter((p) => p.alive && p.skills.includes("pilot"));
      // Dev-only: the trace reads the bot's protected memory to show which Pilots gave up launching for this orbit.
      const gaveUp = pilots.filter((p) => [...(bots.get(p.id) as unknown as { memory: { once: Set<string> } }).memory.once].some((k) => k.startsWith("noTakeoff:")));
      trace(`  orbit ${pl?.name}: sectors ${pl?.sectors.map((x) => `${x.tag}${x.explored ? "*" : ""}`).join(" ")}; expedition ${game.expedition ? "out" : "none"}; pilots alive ${pilots.map((p) => p.character).join(",") || "none"}; gave up ${gaveUp.map((p) => p.character).join(",") || "none"}`);
      // The Commander's reasons to stay (`readyToLeaveOrbit`), with the same dev-only read of its memory.
      const cmd = game.players.find((p) => p.id === game.titles.commander && p.alive);
      const cmdBot = cmd && (bots.get(cmd.id) as unknown as { memory: BotMemory; current: string | null } | undefined);
      if (cmd && cmdBot) {
        const v = viewFor(game, cmd.id);
        trace(`  commander ${cmd.character} in ${cmd.room}, ${cmd.ap} AP, goal ${cmdBot.current ?? "none"}: expeditions over ${expeditionsOver(v, cmdBot.memory)}, ready to leave ${readyToLeaveOrbit(v, cmdBot.memory)}`);
      }
    }
    trace(`cycle ${cycle}: hull ${s.hull}, oxygen ${s.oxygen}, fuel ${s.fuel}, alive ${s.alive}, broken ${s.broken}, fires ${s.fires}, hunters ${s.hunters}, morale ${game.players.filter((p) => p.alive).map((p) => `${p.character} ${p.morale}`).join(" ")}`);
  }
  if (game.phase === "ended") result.end = game.ending ?? "stalled";
  // The cycle the run stopped in (a game that ends at a cycle change ends inside `applyInput`, before the row closes).
  if (result.cycles!.at(-1)?.cycle !== row.cycle) closeRow(game);
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
