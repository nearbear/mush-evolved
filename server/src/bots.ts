// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { legalIn, nextInt, type Action, type PlayerView, type RngState } from "@mush2/shared";
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

/**
 * Model calls a bot may spend on free actions (no AP or MP) in one cycle. Points already limit paid actions, so free
 * ones are the only way a confused model can loop; past this, the scripted fallback plays the rest of the cycle.
 */
export const MODEL_FREE_ACTIONS_PER_CYCLE = 8;

/**
 * Asks a model to choose from its own view's affordable actions. Its reply is untrusted: anything but a valid choice
 * and the scripted fallback decides instead. With no key at all it plays scripted. With a key but no reply (the call
 * failed, the key was refused, the budget is spent) it waits instead, returning null, and the cycle waits with it
 * (owner, 2026-10-24, #114): the room asks again later (`ModelGate.pause`).
 */
export class ModelBot implements Bot {
  private cycle = -1;
  private free = 0;

  constructor(
    private gate: ModelGate,
    private fallback: Bot,
  ) {}

  async decideAction(view: PlayerView): Promise<Action | null> {
    if (view.cycle !== this.cycle) {
      this.cycle = view.cycle;
      this.free = 0;
    }
    const options = choices(view);
    if (options.length === 0) return null;
    // Nothing to choose between: don't spend a call on it.
    if (options.length === 1) return options[0]!.action;
    if (this.gate.credentials === null || this.free >= MODEL_FREE_ACTIONS_PER_CYCLE) return this.fallback.decideAction(view);
    const reply = await this.gate.ask(buildPrompt(view));
    if (reply === null) return null;
    const i = parseChoice(reply, options.length);
    if (i === null) return this.fallback.decideAction(view);
    const chosen = options[i]!;
    if (chosen.cost.ap === 0 && chosen.cost.mp === 0 && chosen.action.type !== "ready") this.free++;
    return chosen.action;
  }
}

/** Test tool: never moves, and repeats every private log entry it receives in global chat. */
export class LogParrotBot implements Bot {
  /** The log only grows, so the count of private entries already repeated is enough. */
  private repeated = 0;

  async decideAction(view: PlayerView): Promise<Action | null> {
    return endCycle(view);
  }

  chatLines(view: PlayerView): string[] {
    const priv = view.log.filter((e) => e.visibleTo !== "all");
    if (!view.chatChannels.includes("global")) return [];
    const fresh = priv.slice(this.repeated);
    this.repeated = priv.length;
    return fresh.map(describeLogEntry);
  }
}
