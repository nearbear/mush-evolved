// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { characterName, legalIn, nextInt, type Action, type LobbyLanguage, type PlayerView, type RngState } from "@mush2/shared";
import { hasBotSkill, holdsTrigger } from "./bots/duties.ts";
import { canReachBridgeWithTravelAp } from "./bots/goals/blocks.ts";
import { END_CYCLE, helpGoal, helpTasks, SOLO_GOALS, type BotMemory, type BotSocial, type Goal, type GoalDef } from "./bots/goals/index.ts";
import { coffeeReflex, coffeeRun, deliverCoffee } from "./bots/goals/coffee.ts";
import { extinguish } from "./bots/goals/extinguish.ts";
import { repairOxygen } from "./bots/goals/repairOxygen.ts";
import { observeBeds } from "./bots/goals/rest.ts";
import { newFireMemory, observeFires } from "./bots/fireShare.ts";
import { newTankMemory, observeTanks } from "./bots/tankShare.ts";
import { newMoraleMemory, observeMorale } from "./bots/moraleShare.ts";
import { newExpeditionEndMemory, observeExpeditionEnd } from "./bots/expeditionShare.ts";
import { newFuelMemory, observeFuel } from "./bots/fuelShare.ts";
import { newBedMemory, observeBedAsks } from "./bots/bedShare.ts";
import { newItemMemory, observeItems } from "./bots/itemShare.ts";
import { holdStartCycle, isHoldingJump, newJumpMemory } from "./bots/planetShare.ts";
import { newReportMemory, observeReports } from "./bots/reportShare.ts";
import { readSnapshot, BOT_MEMORY_VERSION, type BotMemorySnapshot } from "./bots/memoryStore.ts";
import { buildPrompt, describeLogEntry, observeShrinks, parseReply, type BotMessage } from "./prompt.ts";
import type { ModelGate } from "./model.ts";

/**
 * Every bot (scripted or model-backed) implements this. A bot only ever
 * receives the view its own seat would legitimately have. Null is "nothing
 * to do now": the bot is asked again after the next change.
 */
export interface Bot {
  decideAction(view: PlayerView): Promise<Action | null>;
  /** Optional: global-chat lines to post now. The room posts them as this bot, and the rules still check it may. */
  chatLines?(view: PlayerView): string[];
  /** Optional: the room refused the action (or the `takeSocial` message) this bot last returned (the rules said no). */
  refused?(action: Action | BotSocial, error: string): void;
  /**
   * Optional: a chat message someone else wrote reached a channel this bot reads (bot-goals.md, "Waking"). Returns
   * whether it listens (a model bot with a key); one that does gets a turn to reply, act, or do nothing, even mid-goal.
   */
  wake?(): boolean;
  /** Optional: whether `wake` would take a wake now, without waking it (the chat router's candidates, #341). */
  readonly listens?: boolean;
  /** Optional: whether a wake is still waiting for its turn. */
  readonly woken?: boolean;
  /** Optional: the message its last turn wants posted (at most one), taken once. The room posts it like a player's. */
  takeMessage?(): BotMessage | null;
  /**
   * Optional: a message that isn't an action or chat (sharing a planet or report, creating a channel, posting a plan)
   * its last turn wants sent, taken once. The room sends it like a player's (`GameRoom.social`); a refusal comes back
   * through `refused`. The turn returns no action.
   */
  takeSocial?(): BotSocial | null;
  /**
   * Optional: what the bot remembers, as plain data for room storage (#440). The room saves it with the game and never
   * looks inside; it is never in game state, the record or a view.
   */
  snapshot?(): unknown;
  /** Optional: takes back a `snapshot` after a restart, before the first turn. False (and fresh memory) if it was dropped. */
  restore?(stored: unknown): boolean;
}

/**
 * How deep a chain of bot replies may go (bot-goals.md, "Talking in chat"). A message a person writes, or a bot writes
 * on its own turn, has depth 0; a bot's reply to a message of depth d has depth d + 1; a message at this depth wakes
 * nobody (bots still read it on their next turn). Below it, the chat router (`router.ts`, #341) picks at most
 * `ROUTER_MAX_WAKES` bots per message: each message costs one router call and at most that many woken calls, and wakes
 * still merge into rounds (one call per bot per round).
 */
export const BOT_CHAT_CHAIN_DEPTH = 3;

/** Most moves a WanderBot makes in one cycle, so it doesn't burn all its AP and keep dodging clicks. */
export const WANDER_MOVES_PER_CYCLE = 3;

/** Ends its cycle where End cycle is on (testing); otherwise it waits for the clock. */
const endCycle = (view: PlayerView): Action | null => (legalIn(view).some((a) => a.type === "ready") ? { type: "ready" } : null);

/**
 * Goal bots wait to send `ready` until a living human has pressed End cycle (which waits on bots only, never on the
 * other humans), so they stay open to chat wakes, interrupts and `help` while the human is still playing their turn.
 * With no living human, they ready at once.
 */
const waitForCycle = (view: PlayerView): Action | null => {
  if (!legalIn(view).some((a) => a.type === "ready")) return null;
  const humans = view.players.filter((p) => !p.isBot && p.alive);
  return humans.length === 0 || humans.some((p) => p.ready) ? { type: "ready" } : null;
};

/** Scripted placeholder: wanders randomly up to WANDER_MOVES_PER_CYCLE moves a cycle, then ends its cycle or waits. */
export class WanderBot implements Bot {
  private cycle = -1;
  private moved = 0;

  constructor(private rng: RngState) {}

  async decideAction(view: PlayerView): Promise<Action | null> {
    if (view.statuses.includes("coma")) return endCycle(view);
    if (view.cycle !== this.cycle) {
      this.cycle = view.cycle;
      this.moved = 0;
    }
    const moves = legalIn(view).filter((a) => a.type === "move");
    if (moves.length === 0 || this.moved >= WANDER_MOVES_PER_CYCLE) return endCycle(view);
    let i: number;
    [i, this.rng] = nextInt(this.rng, moves.length);
    this.moved++;
    return moves[i]!;
  }
}

/** A goal open to a bot, with its definition's priority. */
export interface Ranked {
  goal: Goal;
  priority: number;
}

/** AP a bot keeps for emergencies: work goals stop rather than spend it (owner, 2026-10-25). */
export const BOT_AP_RESERVE = 2;

/** Most actions one goal may take before it is given up as stuck. */
export const GOAL_MAX_ACTIONS = 40;

const sameAction = (a: Action, b: Action): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Plays the solo goals (docs/plans/bot-goals.md) by their priority: picks a goal, follows it turn after turn, and
 * chooses again only when it finishes, fails, or an interrupt fires (a new cycle, unless resting and no hunter needs
 * shooting; losing HP). What it
 * remembers is saved in room storage by `snapshot` and read back by `restore` (#440); the goal it was following is not,
 * so after a restart it chooses again. A bot without a model key plays this.
 */
export class GoalBot implements Bot {
  private goal: Goal | null = null;
  private social: BotSocial | null = null;
  private wokenByChat = false;
  private actions = 0;
  private cycle = -1;
  private day = -1;
  private hp: number | null = null;
  protected readonly memory: BotMemory;

  constructor(
    private rng: RngState,
    reserve = BOT_AP_RESERVE,
    private goals: readonly GoalDef[] = SOLO_GOALS,
  ) {
    const scripted = (): boolean => this.scripted;
    const language = (): LobbyLanguage => this.language;
    this.memory = {
      reserve,
      get scripted() {
        return scripted();
      },
      get language() {
        return language();
      },
      ended: new Set(),
      today: new Set(),
      once: new Set(),
      visited: new Set(),
      shrinks: new Set(),
      fullBeds: new Map(),
      beds: newBedMemory(),
      lastExpedition: null,
      asteroidsOnly: null,
      items: newItemMemory(),
      fires: newFireMemory(),
      tanks: newTankMemory(),
      morale: newMoraleMemory(),
      expeditionEnd: newExpeditionEndMemory(),
      fuel: newFuelMemory(),
      combustion: null,
      holdSince: null,
      jump: newJumpMemory(),
      reports: newReportMemory(),
      heading: null,
      cancelHold: false,
      justJumped: false,
      failedReason: null,
      expeditionPrep: null,
      roll: (n) => {
        let i: number;
        [i, this.rng] = nextInt(this.rng, n);
        return i;
      },
    };
  }

  snapshot(): BotMemorySnapshot {
    const m = this.memory;
    const map = <K, V>(x: Map<K, Set<V>>): [K, V[]][] => [...x].map(([k, v]) => [k, [...v]]);
    return {
      version: BOT_MEMORY_VERSION,
      rng: this.rng,
      day: this.day,
      cycle: this.cycle,
      hp: this.hp,
      ended: [...m.ended],
      today: [...m.today],
      once: [...m.once],
      visited: [...m.visited],
      shrinks: [...m.shrinks],
      fullBeds: [...m.fullBeds].map(([k, v]) => [k, [...v]]),
      beds: { asks: [...m.beds.asks], skills: [...m.beds.skills], asked: m.beds.asked, unanswered: [...m.beds.unanswered], shrinkRooms: [...m.beds.shrinkRooms], shrinkSaid: m.beds.shrinkSaid, seq: m.beds.seq },
      lastExpedition: m.lastExpedition,
      asteroidsOnly: m.asteroidsOnly,
      items: { rooms: map(m.items.rooms), said: map(m.items.said), seq: m.items.seq },
      fires: { active: m.fires.active, burning: [...m.fires.burning], checked: [...m.fires.checked], seq: m.fires.seq },
      tanks: { broken: [...m.tanks.broken], suspect: [...m.tanks.suspect], claims: [...m.tanks.claims], seq: m.tanks.seq },
      morale: { said: m.morale.said, requests: [...m.morale.requests], seq: m.morale.seq },
      expeditionEnd: { done: [...m.expeditionEnd.done], noIcarus: m.expeditionEnd.noIcarus, said: [...m.expeditionEnd.said], seq: m.expeditionEnd.seq },
      fuel: { ...m.fuel },
      combustion: m.combustion,
      holdSince: m.holdSince,
      jump: { ...m.jump },
      reports: { explored: [...m.reports.explored].map(([k, v]) => [k, [...v]]), seen: [...m.reports.seen], shared: [...m.reports.shared] },
      heading: m.heading,
      cancelHold: m.cancelHold,
      justJumped: m.justJumped,
      failedReason: m.failedReason,
      expeditionPrep: m.expeditionPrep ? { ...m.expeditionPrep } : null,
    };
  }

  /** Call on a fresh bot only: its own snapshot is the default for any field the stored one lacks. */
  restore(stored: unknown): boolean {
    const s = readSnapshot(stored, this.snapshot());
    if (!s) return false;
    const m = this.memory;
    const refill = <T>(set: Set<T>, from: readonly T[]): void => {
      set.clear();
      for (const x of from) set.add(x);
    };
    const map = <K, V>(from: readonly [K, V[]][]): Map<K, Set<V>> => new Map(from.map(([k, v]) => [k, new Set(v)]));
    this.rng = s.rng;
    this.day = s.day;
    this.cycle = s.cycle;
    this.hp = s.hp;
    refill(m.ended, s.ended);
    refill(m.today, s.today);
    refill(m.once, s.once);
    refill(m.visited, s.visited);
    refill(m.shrinks, s.shrinks);
    m.fullBeds.clear();
    for (const [room, sleepers] of s.fullBeds) m.fullBeds.set(room, new Set(sleepers));
    Object.assign(m.beds, { asks: new Map(s.beds.asks), skills: new Map(s.beds.skills), asked: s.beds.asked, unanswered: new Set(s.beds.unanswered), shrinkRooms: new Map(s.beds.shrinkRooms ?? []), shrinkSaid: s.beds.shrinkSaid ?? null, seq: s.beds.seq });
    m.lastExpedition = s.lastExpedition;
    m.asteroidsOnly = s.asteroidsOnly;
    Object.assign(m.items, { rooms: map(s.items.rooms), said: map(s.items.said), seq: s.items.seq });
    Object.assign(m.fires, { active: s.fires.active, burning: new Set(s.fires.burning), checked: new Set(s.fires.checked), seq: s.fires.seq });
    Object.assign(m.tanks, { broken: new Set(s.tanks.broken), suspect: new Set(s.tanks.suspect), claims: new Map(s.tanks.claims), seq: s.tanks.seq });
    Object.assign(m.morale, { said: s.morale.said, requests: new Map(s.morale.requests), seq: s.morale.seq });
    Object.assign(m.expeditionEnd, { done: new Set(s.expeditionEnd.done), noIcarus: s.expeditionEnd.noIcarus, said: new Set(s.expeditionEnd.said), seq: s.expeditionEnd.seq });
    Object.assign(m.fuel, s.fuel);
    m.combustion = s.combustion;
    m.holdSince = s.holdSince;
    Object.assign(m.jump, s.jump);
    Object.assign(m.reports, {
      explored: new Map(s.reports.explored.map(([k, v]) => [k, [...v]])),
      seen: new Set(s.reports.seen),
      shared: new Set(s.reports.shared),
    });
    m.heading = s.heading;
    m.cancelHold = s.cancelHold;
    m.justJumped = s.justJumped;
    m.failedReason = s.failedReason;
    m.expeditionPrep = s.expeditionPrep ? { ...s.expeditionPrep } : null;
    return true;
  }

  /** The ship's language (`BotMemory.language`). A scripted bot writes nothing, so English. */
  protected get language(): LobbyLanguage {
    return "en";
  }

  /** Whether goals go by priority (`BotMemory.scripted`): always, for a bot without a model. */
  protected get scripted(): boolean {
    return true;
  }

  /** Whether chat wakes it: only a bot whose model can be asked (bot-goals.md: a bot without a key ignores chat). */
  get listens(): boolean {
    return false;
  }

  wake(): boolean {
    if (!this.listens) return false;
    this.wokenByChat = true;
    return true;
  }

  get woken(): boolean {
    return this.listens && this.wokenByChat;
  }

  /** The key of the goal it is following, if any (tests). */
  get current(): string | null {
    return this.goal?.key ?? null;
  }

  async decideAction(view: PlayerView): Promise<Action | null> {
    // Comatose (#489): view is blinded (ship is null, cycle/day are 0), so skip observe/goals and auto-ready.
    if (view.statuses.includes("coma")) {
      this.goal = null;
      return endCycle(view);
    }
    this.observe(view);
    const legal = legalIn(view);
    if (legal.length === 0) return null;
    // Fires (fireShare.ts, #429): news of one drops a goal ranked under fighting it, if the bot can do something about
    // it; what it sees here that chat doesn't say yet is this turn's one message.
    const fires = observeFires(view, this.memory);
    if (fires.news && this.goal !== null && this.goal.id !== extinguish.id && this.goals.includes(extinguish) && extinguish.options(view, this.memory).length > 0) {
      this.goal.onInterrupt?.(this.memory);
      this.end(false);
    }
    // Oxygen tanks (tankShare.ts, #443): the same, for a newly broken or suspected tank.
    const tanks = observeTanks(view, this.memory);
    if (tanks.news && this.goal !== null && this.goal.id !== extinguish.id && this.goal.id !== repairOxygen.id && this.goals.includes(repairOxygen) && repairOxygen.options(view, this.memory).length > 0) {
      this.goal.onInterrupt?.(this.memory);
      this.end(false);
    }
    // Expedition reports (reportShare.ts) and shared items (itemShare.ts): likewise, one message a turn.
    const sharedReport = observeReports(view, this.memory, !fires.post && !tanks.post);
    // A request for comfort (moraleShare.ts, #452), when the bot's own morale just dropped low.
    const askComfort = observeMorale(view, this.memory);
    // Expeditions over (expeditionShare.ts, owner 2026-11-19): a disabled Board or Take off seen in the bay, for the Commander.
    const expeditionEnd = observeExpeditionEnd(view, this.memory, !fires.post && !tanks.post && !askComfort && !sharedReport);
    const report = fires.post ?? tanks.post ?? askComfort ?? sharedReport ?? expeditionEnd ?? observeItems(view, this.memory);
    if (report) {
      this.social = report;
      return null;
    }
    // Reports (#444): a fire or broken equipment the bot sees and nobody reported, it reports at once. It is free and
    // instant, so it's a reflex rather than a goal, and it doesn't drop the goal being followed.
    const reportNow = legal.find((a) => a.type === "report_fire" || a.type === "report_equipment" || a.type === "report_door");
    if (reportNow) return reportNow;
    // The coffee relay (owner, 2026-11-18; goals/coffee.ts): pulling Gioele's coffee in the refectory, or his drinking
    // it in passing, is likewise free and doesn't drop the goal.
    const coffee = this.goals.includes(deliverCoffee) && this.goals.includes(coffeeRun) ? coffeeReflex(view, this.memory) : null;
    if (coffee) return coffee;
    if (!this.listens) this.wokenByChat = false;
    // Woken by chat: the model is asked even mid-goal or with one option, since it may want to talk; it may carry on.
    if (this.wokenByChat) {
      this.wokenByChat = false;
      const chosen = await this.choose(view, this.options(view), this.goal, true);
      if (chosen === null) {
        // No reply (the call failed): still woken, asked again later.
        this.wokenByChat = true;
        return null;
      }
      if (chosen !== this.goal) {
        this.goal?.onInterrupt?.(this.memory);
        this.end(false);
        this.goal = chosen;
      }
    }
    // A goal that ends at once makes way for the next; each one that ends is left out until the next cycle, so this
    // runs out of goals rather than looping.
    for (let i = 0; i <= this.goals.length; i++) {
      if (!this.goal) {
        const options = this.options(view);
        // One option (ending the cycle, when nothing else is open) needs no choosing.
        const chosen = options.length === 1 ? options[0]!.goal : await this.choose(view, options, null, false);
        // No choice yet (a model bot whose call failed): ask again later.
        if (chosen === null) return null;
        this.goal = chosen;
      }
      const step = this.goal.step(view, this.memory);
      if (step.kind === "social") {
        // One thing a turn: the message instead of an action. The goal carries on next turn.
        if (++this.actions <= GOAL_MAX_ACTIONS) {
          this.social = step.message;
          return null;
        }
        this.end(true);
        continue;
      }
      if (step.kind === "hold") return null;
      if (step.kind === "wait") {
        // Ending the cycle isn't a goal to keep: while it waits for the clock, something may open up (hunger, AP).
        if (this.goal === END_CYCLE) this.goal = null;
        return waitForCycle(view);
      }
      if (step.kind === "act") {
        // A stale or wrong step is the goal's failure, never an illegal input.
        if (++this.actions <= GOAL_MAX_ACTIONS && legal.some((a) => sameAction(a, step.action))) {
          if (!this.keepsHeldJump(view, step.action)) {
            this.end(true);
            continue;
          }
          return step.action;
        }
        this.end(true);
      } else this.end(!(step.kind === "done" && step.again));
    }
    return waitForCycle(view);
  }

  refused(): void {
    this.end(true);
  }

  takeSocial(): BotSocial | null {
    const social = this.social;
    this.social = null;
    return social;
  }

  /** Cycle bookkeeping and the interrupts. */
  private observe(view: PlayerView): void {
    const newDay = view.day !== this.day;
    if (newDay) {
      this.day = view.day;
      this.memory.today.clear();
    }
    if (view.cycle !== this.cycle) {
      const first = this.cycle === -1;
      this.cycle = view.cycle;
      this.memory.ended.clear();
      this.memory.visited.clear();
      if (!first && !this.goal?.keepAcrossCycle?.(view, this.memory, newDay, this.goals)) this.end(false);
    }
    // Attacked, or hurt any other way: think again.
    if (this.hp !== null && view.you.hp < this.hp) {
      this.goal?.onInterrupt?.(this.memory);
      this.end(false);
    }
    this.hp = view.you.hp;
    this.memory.visited.add(view.you.room);
    observeShrinks(view, this.memory.shrinks);
    observeBeds(view, this.memory.fullBeds);
    observeBedAsks(view, this.memory);
    observeFuel(view, this.memory);
    if (view.navigation.traveling || view.navigation.orbiting) this.memory.combustion = null;
    if (view.navigation.heading !== null) this.memory.heading = view.navigation.heading;
    const chatHold = holdStartCycle(view, this.memory);
    if (chatHold !== null && this.memory.holdSince === null) this.memory.holdSince = chatHold;
  }

  /**
   * When the Commander is holding a jump (#421), any non-travel goal must still leave enough AP/MP to walk back to the
   * bridge and pay 1 AP to `travel`.
   */
  private keepsHeldJump(view: PlayerView, action: Action): boolean {
    if (
      this.goal?.id === "travel" ||
      this.goal?.id === "returnToSol" ||
      !holdsTrigger(view, "destination") ||
      view.navigation.traveling ||
      view.navigation.orbiting ||
      (this.memory.holdSince === null && !isHoldingJump(view, this.memory))
    ) {
      return true;
    }
    const opt = view.actions.find((a) => sameAction(a.action, action));
    const nextRoom = action.type === "move" ? action.to : view.you.room;
    const nextAp = view.you.ap - (opt?.cost.ap ?? 0);
    const nextMp = view.you.mp - (opt?.cost.mp ?? 0);
    return canReachBridgeWithTravelAp(view, nextRoom, nextAp, nextMp);
  }

  /**
   * Every goal open now and not ended this cycle, in registry order; only ending the cycle when there is none. Aboard a
   * patrol ship only the flight's own goal: a ship has no doors, so nothing else could be reached.
   */
  private options(view: PlayerView): Ranked[] {
    const defs = view.patrolShip !== null ? this.goals.filter((def) => def.id === "patrolShootHunters") : this.goals;
    const options = defs.flatMap((def) =>
      def
        .options(view, this.memory)
        .filter((goal) => !this.memory.ended.has(goal.key))
        .map((goal) => ({ goal, priority: def.priority })),
    );
    return options.length > 0 ? options : [{ goal: END_CYCLE, priority: 0 }];
  }

  /**
   * Which option to follow, or null to wait and be asked again; returning `current` carries on with it. A bot without
   * a key goes by priority. `woken`: chat woke it, and `current` is the goal it was following (or null).
   */
  protected async choose(_view: PlayerView, options: readonly Ranked[], current: Goal | null, _woken: boolean): Promise<Goal | null> {
    return current ?? this.byPriority(options);
  }

  /** The highest-priority option, ties by the seeded roll. */
  protected byPriority(options: readonly Ranked[]): Goal {
    const top = Math.max(...options.map((o) => o.priority));
    const best = options.filter((o) => o.priority === top);
    return best[best.length === 1 ? 0 : this.memory.roll(best.length)]!.goal;
  }

  /** Drops the current goal; `remember` keeps it from being chosen again this cycle. */
  private end(remember: boolean): void {
    if (this.goal && remember && this.goal !== END_CYCLE) this.memory.ended.add(this.goal.key);
    this.goal = null;
    this.actions = 0;
  }
}

/**
 * Goals a model may choose for one bot in one cycle. Goals that ended this cycle aren't offered again, so the list
 * runs out by itself; this bounds the cost when goals keep ending at once (or a rest finishes and is chosen again).
 * Past it, the bot goes by priority for the rest of the cycle.
 */
export const MODEL_CHOICES_PER_CYCLE = 8;

/**
 * Malformed replies in a row before giving up on the model for the rest of the cycle and playing by priority.
 * Bounded so a model repeatedly returning empty content or garbage doesn't burn calls on every goal choice.
 */
export const MODEL_CONSECUTIVE_MALFORMED_LIMIT = 3;

/**
 * A goal bot whose model chooses the goal (docs/plans/bot-goals.md, step 2): one call picks from the goals open now, and
 * the goal then runs with no calls until it finishes, fails, or an interrupt fires. The reply is untrusted: anything
 * but a valid number is decided by priority instead, as a bot without a key always is. With a key but no reply (the
 * call failed, the key was refused, the budget is spent) it waits instead, returning null, and the cycle waits with it
 * (owner, 2026-10-24, #114): the room asks again later (`ModelGate.pause`).
 */
/** Loose form of a chat line, for spotting a repeat: case, spacing and trailing punctuation don't count. */
const chatKey = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").replace(/[\s.!?…]+$/u, "").trim();

/**
 * True when `text` is the bot's own last chat line again (#224: flash-lite posted the same line six turns running).
 * Read from the view, so it holds after a restart; only the last line, so asking again later after saying something
 * else still goes through.
 */
export function repeatsLastMessage(view: PlayerView, text: string): boolean {
  const last = [...view.chat].reverse().find((m) => !m.system && m.from === view.you.id);
  return last !== undefined && chatKey(last.text) === chatKey(text);
}

export class ModelBot extends GoalBot {
  private cycleSeen = -1;
  private choices = 0;
  private consecutiveMalformed = 0;
  private message: BotMessage | null = null;

  constructor(
    private gate: ModelGate,
    rng: RngState,
    reserve = BOT_AP_RESERVE,
    goals: readonly GoalDef[] = SOLO_GOALS,
    /** The ship's language (#95), which its chat is written in. */
    private shipLanguage: LobbyLanguage = "en",
  ) {
    super(rng, reserve, goals);
  }

  protected override get language(): LobbyLanguage {
    return this.shipLanguage;
  }

  /** A bot whose model can't be asked (no key) goes by priority, so it plays with the scripted thresholds. */
  protected override get scripted(): boolean {
    return this.gate.credentials === null;
  }

  override get listens(): boolean {
    return this.gate.credentials !== null;
  }

  takeMessage(): BotMessage | null {
    const message = this.message;
    this.message = null;
    return message;
  }

  /**
   * One structured reply (bot-goals.md, step 3): a goal from the list, `help` with its parameters, or carrying on, and
   * at most one message. A woken call doesn't count against the choice cap (the room's chain depth limit bounds those);
   * a malformed reply posts nothing and goes by priority, or carries on when there was a goal. Consecutive malformed
   * replies drop to priority for the rest of the cycle.
   */
  protected override async choose(view: PlayerView, options: readonly Ranked[], current: Goal | null, woken: boolean): Promise<Goal | null> {
    if (view.cycle !== this.cycleSeen) {
      this.cycleSeen = view.cycle;
      this.choices = 0;
      this.consecutiveMalformed = 0;
    }
    const fallback = (): Goal => current ?? this.byPriority(options);
    if (
      this.gate.credentials === null ||
      (!woken && (this.choices >= MODEL_CHOICES_PER_CYCLE || this.consecutiveMalformed >= MODEL_CONSECUTIVE_MALFORMED_LIMIT))
    ) return fallback();
    const offered = options.filter((o) => o.goal.key !== current?.key);
    const goals = offered.map((o) => o.goal);
    const tasks = helpTasks(view);
    const prompt = buildPrompt(view, {
      goals,
      current,
      woken,
      tasks,
      reserve: this.memory.reserve,
      language: this.language,
      shrinks: this.memory.shrinks,
    });
    const reply = await this.gate.ask(prompt);
    if (reply === null) return null;
    if (!woken) this.choices++;
    const parsed = parseReply(reply, view, { goals: goals.length, keep: current !== null, tasks, ended: this.memory.ended, language: this.language });
    if (parsed === null) {
      this.consecutiveMalformed++;
      return fallback();
    }
    this.consecutiveMalformed = 0;
    // One message a turn: a second choice in the same turn (the first goal ended at once) doesn't replace it.
    if (parsed.say && !this.message && !repeatsLastMessage(view, parsed.say.text)) {
      this.message = parsed.say;
      if ("channel" in parsed.say && parsed.say.channel === "global" && hasBotSkill(view, "shrink")) {
        this.memory.shrinks.add(view.you.id);
      }
    }
    if (parsed.help) {
      const name = (id: string): string => characterName(view.players.find((p) => p.id === id)?.character ?? id);
      return helpGoal(parsed.help, name);
    }
    if (parsed.goal === "keep") return current;
    if (parsed.goal !== undefined) return goals[parsed.goal]!;
    // Only a message: carry on, or go by priority.
    return current ?? (offered.length > 0 ? this.byPriority(offered) : this.byPriority(options));
  }
}

/** Test tool: never moves, and repeats every private log entry it receives in global chat. */
export class LogParrotBot implements Bot {
  /**
   * The log only grows, so the count of private entries already repeated is enough. Null until the first call, which
   * counts the lines this seat already posted: a room that wakes from eviction makes a new bot, which must not repeat
   * the whole log again.
   */
  private repeated: number | null = null;

  async decideAction(view: PlayerView): Promise<Action | null> {
    return endCycle(view);
  }

  chatLines(view: PlayerView): string[] {
    const priv = view.log.filter((e) => e.visibleTo !== "all");
    if (!view.chatChannels.includes("global")) return [];
    this.repeated ??= view.chat.filter((m) => m.channel === "global" && m.from === view.you.id && !m.system).length;
    const fresh = priv.slice(this.repeated);
    this.repeated = priv.length;
    return fresh.map((e) => describeLogEntry(e));
  }
}
