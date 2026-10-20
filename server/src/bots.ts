// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { legalIn, MAX_CHAT_LENGTH, nextInt, type Action, type LogEntry, type PlayerView, type RngState } from "@mush2/shared";

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

/** A log entry as plain text: the server has no locale catalogs, so this is the message id plus its data. */
export function describeLogEntry(e: LogEntry): string {
  const params = Object.entries(e.params ?? {}).map(([k, v]) => `${k}=${v}`);
  const text = `[cycle ${e.cycle}${e.room ? `, ${e.room}` : ""}] ${e.key}${params.length ? ` (${params.join(", ")})` : ""}`;
  return text.length > MAX_CHAT_LENGTH ? `${text.slice(0, MAX_CHAT_LENGTH - 1)}…` : text;
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
