// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { legalIn, nextInt, type Action, type PlayerView, type RngState } from "@mush2/shared";
import { END_CYCLE, SOLO_GOALS, type BotMemory, type Goal, type GoalDef } from "./bots/goals/index.ts";
import { buildPrompt, choices, describeLogEntry, parseChoice } from "./prompt.ts";
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
}

/** Most moves a WanderBot makes in one cycle, so it doesn't burn all its AP and keep dodging clicks. */
export const WANDER_MOVES_PER_CYCLE = 3;

/** Ends its cycle where End cycle is on (testing); otherwise it waits for the clock. */
const endCycle = (view: PlayerView): Action | null => (legalIn(view).some((a) => a.type === "ready") ? { type: "ready" } : null);

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

/** AP a bot keeps for emergencies: work goals stop rather than spend it (owner, 2026-10-25). */
export const BOT_AP_RESERVE = 2;

/** Most actions one goal may take before it is given up as stuck. */
export const GOAL_MAX_ACTIONS = 40;

const sameAction = (a: Action, b: Action): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Plays the solo goals (docs/plans/bot-goals.md) by their priority: picks a goal, follows it turn after turn, and
 * chooses again only when it finishes, fails, or an interrupt fires (a new cycle, unless resting; losing HP). What it
 * remembers is in this object only, and lost on a restart. A bot without a model key plays this.
 */
export class GoalBot implements Bot {
  private goal: Goal | null = null;
  private actions = 0;
  private cycle = -1;
  private hp: number | null = null;
  private readonly memory: BotMemory;

  constructor(
    private rng: RngState,
    reserve = BOT_AP_RESERVE,
    private goals: readonly GoalDef[] = SOLO_GOALS,
  ) {
    this.memory = {
      reserve,
      ended: new Set(),
      visited: new Set(),
      roll: (n) => {
        let i: number;
        [i, this.rng] = nextInt(this.rng, n);
        return i;
      },
    };
  }

  /** The key of the goal it is following, if any (tests). */
  get current(): string | null {
    return this.goal?.key ?? null;
  }

  async decideAction(view: PlayerView): Promise<Action | null> {
    this.observe(view);
    const legal = legalIn(view);
    if (legal.length === 0) return null;
    // A goal that ends at once makes way for the next; each one that ends is left out until the next cycle, so this
    // runs out of goals rather than looping.
    for (let i = 0; i <= this.goals.length; i++) {
      this.goal ??= this.choose(view);
      const step = this.goal.step(view, this.memory);
      if (step.kind === "wait") {
        // Ending the cycle isn't a goal to keep: while it waits for the clock, something may open up (hunger, AP).
        if (this.goal === END_CYCLE) this.goal = null;
        return endCycle(view);
      }
      if (step.kind === "act") {
        // A stale or wrong step is the goal's failure, never an illegal input.
        if (++this.actions <= GOAL_MAX_ACTIONS && legal.some((a) => sameAction(a, step.action))) return step.action;
        this.end(true);
      } else this.end(!(step.kind === "done" && step.again));
    }
    return endCycle(view);
  }

  refused(): void {
    this.end(true);
  }

  /** Cycle bookkeeping and the interrupts. */
  private observe(view: PlayerView): void {
    if (view.cycle !== this.cycle) {
      const first = this.cycle === -1;
      this.cycle = view.cycle;
      this.memory.ended.clear();
      this.memory.visited.clear();
      // Resting carries on across cycles; anything else is chosen afresh.
      if (!first && this.goal?.id !== "rest") this.end(false);
    }
    // Attacked, or hurt any other way: think again.
    if (this.hp !== null && view.you.hp < this.hp) this.end(false);
    this.hp = view.you.hp;
    this.memory.visited.add(view.you.room);
  }

  /** The highest-priority option not ended this cycle, ties by the seeded roll; ending the cycle when there is none. */
  private choose(view: PlayerView): Goal {
    const options = this.goals.flatMap((def) =>
      def
        .options(view, this.memory)
        .filter((goal) => !this.memory.ended.has(goal.key))
        .map((goal) => ({ goal, priority: def.priority })),
    );
    if (options.length === 0) return END_CYCLE;
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
 * Model calls a bot may spend on free actions (no AP or MP) in one cycle. Points already limit paid actions, so free
 * ones are the only way a confused model can loop; past this, the scripted fallback plays the rest of the cycle.
 */
export const MODEL_FREE_ACTIONS_PER_CYCLE = 8;

/**
 * Asks a model to choose from its own view's affordable actions. Its reply is untrusted: anything but a valid choice
 * and the scripted fallback (the solo goals, `GoalBot`) decides instead. With no key at all it plays scripted. With a key but no reply (the call
 * failed, the key was refused, the budget is spent) it waits instead, returning null, and the cycle waits with it
 * (owner, 2026-10-24, #114): the room asks again later (`ModelGate.pause`).
 */
export class ModelBot implements Bot {
  private cycle = -1;
  private free = 0;
  /** Whether the last action came from the fallback, which is then the one to hear of a refusal. */
  private fromFallback = false;

  constructor(
    private gate: ModelGate,
    private fallback: Bot,
  ) {}

  async decideAction(view: PlayerView): Promise<Action | null> {
    if (view.cycle !== this.cycle) {
      this.cycle = view.cycle;
      this.free = 0;
    }
    this.fromFallback = false;
    const options = choices(view);
    if (options.length === 0) return null;
    // Nothing to choose between: don't spend a call on it.
    if (options.length === 1) return options[0]!.action;
    if (this.gate.credentials === null || this.free >= MODEL_FREE_ACTIONS_PER_CYCLE) return this.fallBack(view);
    const reply = await this.gate.ask(buildPrompt(view));
    if (reply === null) return null;
    const i = parseChoice(reply, options.length);
    if (i === null) return this.fallBack(view);
    const chosen = options[i]!;
    if (chosen.cost.ap === 0 && chosen.cost.mp === 0 && chosen.action.type !== "ready") this.free++;
    return chosen.action;
  }

  refused(action: Action, error: string): void {
    if (this.fromFallback) this.fallback.refused?.(action, error);
  }

  private fallBack(view: PlayerView): Promise<Action | null> {
    this.fromFallback = true;
    return this.fallback.decideAction(view);
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
