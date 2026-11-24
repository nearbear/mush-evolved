// The intruder (owner, 2026-11-22): the first hostile kind, a PLACEHOLDER until its behaviour and numbers are decided.
// One action a turn (owner, 2026-11-23): it punches a random player in its room, or moves if nobody is there. Attacked in
// melee (Punch, a melee weapon), hit or miss, it tries to punch its attacker back at once if it survives and can pay the
// punch's price (owner, 2026-11-23): its AP, Pacifist and Bodyguard included; not through a Ceasefire.

import type { HostileOption } from "./actions/action.ts";
import { HOSTILE_PUNCH } from "./actions/punch.ts";
import { HostileNpc, type HostileState } from "./hostile.ts";
import type { GameState, PlayerState } from "../types.ts";

export const INTRUDER = "intruder";

export class Intruder extends HostileNpc {
  readonly kind = INTRUDER;

  override readonly actionsPerTurn = 1;

  /** A punch at a random player here if it can; otherwise a random move. */
  override choose(state: GameState, self: Readonly<HostileState>, options: readonly HostileOption[]): HostileOption | null {
    const punches = options.filter((o) => o.data.type === "punch");
    return super.choose(state, self, punches.length > 0 ? punches : options.filter((o) => o.data.type === "move"));
  }

  /** A melee attack on it, landed or not: it punches the attacker back, if it can now (`options` checks the room, the Ceasefire and the price). */
  override onAttacked(state: GameState, self: HostileState, attacker: Readonly<PlayerState>, melee: boolean): void {
    if (!melee) return;
    const counter = this.options(state, self).find((o) => o.action === HOSTILE_PUNCH && o.data.type === "punch" && o.data.target === attacker.id);
    if (counter) this.perform(state, self, counter);
  }
}
