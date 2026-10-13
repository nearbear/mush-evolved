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

/** Scripted placeholder: wanders randomly until out of AP, then readies up. */
export class WanderBot implements Bot {
  constructor(private rng: RngState) {}

  async decideAction(view: PlayerView): Promise<Action> {
    const moves = view.legalActions.filter((a) => a.type === "move");
    if (moves.length === 0) return { type: "ready" };
    let i: number;
    [i, this.rng] = nextInt(this.rng, moves.length);
    return moves[i]!;
  }
}
