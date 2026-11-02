// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { legalIn, nextInt, type Action, type LobbyLanguage, type PlayerView, type RngState } from "@mush2/shared";
import { hasBotSkill } from "./bots/duties.ts";
import { END_CYCLE, helpGoal, helpTasks, SOLO_GOALS, type BotMemory, type Goal, type GoalDef } from "./bots/goals/index.ts";
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
  /** Optional: the room refused the action this bot last returned (the rules said no). */
  refused?(action: Action, error: string): void;
  /**
   * Optional: a chat message someone else wrote reached a channel this bot reads (bot-goals.md, "Waking"). Returns
   * whether it listens (a model bot with a key); one that does gets a turn to reply, act, or do nothing, even mid-goal.
   */
  wake?(): boolean;
  /** Optional: whether a wake is still waiting for its turn. */
  readonly woken?: boolean;
  /** Optional: the message its last turn wants posted (at most one), taken once. The room posts it like a player's. */
  takeMessage?(): BotMessage | null;
}

/**
 * How deep a chain of bot replies may go (bot-goals.md, "Talking in chat"). A message a person writes, or a bot writes
 * on its own turn, has depth 0; a bot's reply to a message of depth d has depth d + 1; a message at this depth wakes
 * nobody (bots still read it on their next turn). Wakes merge into rounds, so a chain costs at most about
 * bots × (depth + 1) calls.
 */
export const BOT_CHAT_CHAIN_DEPTH = 3;

/** Most moves a WanderBot makes in one cycle, so it doesn't burn all its AP and keep dodging clicks. */
export const WANDER_MOVES_PER_CYCLE = 3;

/** Ends its cycle where End cycle is on (testing); otherwise it waits for the clock. */
const endCycle = (view: PlayerView): Action | null => (legalIn(view).some((a) => a.type === "ready") ? { type: "ready" } : null);

/**
 * Goal bots wait to send `ready` until every living human has, so they stay open to chat wakes, interrupts and `help`
 * while the human is still playing their turn.
 */
const waitForCycle = (view: PlayerView): Action | null =>
  legalIn(view).some((a) => a.type === "ready") && view.players.every((p) => p.isBot || !p.alive || p.ready) ? { type: "ready" } : null;

/** Scripted placeholder: wanders randomly up to WANDER_MOVES_PER_CYCLE moves a cycle, then ends its cycle or waits. */
export class WanderBot implements Bot {
  private cycle = -1;
  private moved = 0;

  constructor(private rng: RngState) {}

  async decideAction(view: PlayerView): Promise<Action | null> {
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
 * remembers is in this object only, and lost on a restart. A bot without a model key plays this.
 */
export class GoalBot implements Bot {
  private goal: Goal | null = null;
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
    this.memory = {
      reserve,
      get scripted() {
        return scripted();
      },
      ended: new Set(),
      today: new Set(),
      visited: new Set(),
      shrinks: new Set(),
      roll: (n) => {
        let i: number;
        [i, this.rng] = nextInt(this.rng, n);
        return i;
      },
    };
  }

  /** Whether goals go by priority (`BotMemory.scripted`): always, for a bot without a model. */
  protected get scripted(): boolean {
    return true;
  }

  /** Whether chat wakes it: only a bot whose model can be asked (bot-goals.md: a bot without a key ignores chat). */
  protected get listens(): boolean {
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
    this.observe(view);
    const legal = legalIn(view);
    if (legal.length === 0) return null;
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
      if (step.kind === "wait") {
        // Ending the cycle isn't a goal to keep: while it waits for the clock, something may open up (hunger, AP).
        if (this.goal === END_CYCLE) this.goal = null;
        return waitForCycle(view);
      }
      if (step.kind === "act") {
        // A stale or wrong step is the goal's failure, never an illegal input.
        if (++this.actions <= GOAL_MAX_ACTIONS && legal.some((a) => sameAction(a, step.action))) return step.action;
        this.end(true);
      } else this.end(!(step.kind === "done" && step.again));
    }
    return waitForCycle(view);
  }

  refused(): void {
    this.end(true);
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
    private language: LobbyLanguage = "en",
  ) {
    super(rng, reserve, goals);
  }

  /** A bot whose model can't be asked (no key) goes by priority, so it plays with the scripted thresholds. */
  protected override get scripted(): boolean {
    return this.gate.credentials === null;
  }

  protected override get listens(): boolean {
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
    const parsed = parseReply(reply, view, { goals: goals.length, keep: current !== null, tasks, ended: this.memory.ended });
    if (parsed === null) {
      this.consecutiveMalformed++;
      return fallback();
    }
    this.consecutiveMalformed = 0;
    // One message a turn: a second choice in the same turn (the first goal ended at once) doesn't replace it.
    if (parsed.say && !this.message) {
      this.message = parsed.say;
      if ("channel" in parsed.say && parsed.say.channel === "global" && hasBotSkill(view, "shrink")) {
        this.memory.shrinks.add(view.you.id);
      }
    }
    if (parsed.help) {
      const name = (id: string): string => view.players.find((p) => p.id === id)?.character ?? id;
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
    return fresh.map(describeLogEntry);
  }
}
