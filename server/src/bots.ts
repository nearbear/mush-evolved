// Bots live server-side: model-backed ones need network calls, secrets, and a
// spend cap, none of which belong in the pure rules package.

import { nextInt, type Action, type PlayerView, type RngState } from "@mush2/shared";

/**
 * Every bot (scripted or model-backed) implements this. A bot only ever
 * receives the view its own seat would legitimately have.
 */
export interface Bot {
  decideAction(view: PlayerView): Promise<Action>;
}

/** Most moves a WanderBot makes in one cycle, so it doesn't burn all its AP and keep dodging clicks. */
export const WANDER_MOVES_PER_CYCLE = 3;

/** Scripted placeholder: wanders randomly up to WANDER_MOVES_PER_CYCLE moves a cycle, then readies up. */
export class WanderBot implements Bot {
  private cycle = -1;
  private moved = 0;

  constructor(private rng: RngState) {}

  async decideAction(view: PlayerView): Promise<Action> {
    if (view.cycle !== this.cycle) {
      this.cycle = view.cycle;
      this.moved = 0;
    }
    const moves = view.legalActions.filter((a) => a.type === "move");
    if (moves.length === 0 || this.moved >= WANDER_MOVES_PER_CYCLE) return { type: "ready" };
    let i: number;
    [i, this.rng] = nextInt(this.rng, moves.length);
    this.moved++;
    return moves[i]!;
  }
}
