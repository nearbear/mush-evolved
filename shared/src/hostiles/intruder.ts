// The intruder (owner, 2026-11-22): the first hostile kind, a PLACEHOLDER until its behaviour and numbers are decided.
// One action a turn (owner, 2026-11-23): it punches a random player in its room, or moves if nobody is there.

import type { HostileOption } from "./actions/action.ts";
import { HostileNpc, type HostileState } from "./hostile.ts";
import type { GameState } from "../types.ts";

export const INTRUDER = "intruder";

export class Intruder extends HostileNpc {
  readonly kind = INTRUDER;

  override readonly actionsPerTurn = 1;

  /** A punch at a random player here if it can; otherwise a random move. */
  override choose(state: GameState, self: Readonly<HostileState>, options: readonly HostileOption[]): HostileOption | null {
    const punches = options.filter((o) => o.data.type === "punch");
    return super.choose(state, self, punches.length > 0 ? punches : options.filter((o) => o.data.type === "move"));
  }
}
