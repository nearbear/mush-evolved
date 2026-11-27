import { Action, type ActionVisibility } from "./action.ts";
import { isOnFire } from "../fire.ts";
import { logSecret } from "../log.ts";
import { offShip } from "../patrol.ts";
import { compelledToBurn } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type IgniteActionData = { type: "ignite" };

/**
 * The Pyromaniac's secret action (owner, 2026-11-24): 4 AP to set the fire that catches in your room at the next
 * cycle change (`GameState.pendingFires`, lit by `ignitePending` in fire.ts), refused in a room already burning or
 * with a fire pending. Secret, so only roommates ever see it happen. A player compelled by Pyromania may use it too, for
 * `pyromania.igniteAp` AP, which ends the compulsion (owner, 2026-11-27).
 */
export class IgniteAction extends Action<IgniteActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("ignite");
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: compelledToBurn(player) ? state.config.pyromania.igniteAp : state.config.ignite.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): IgniteActionData[] {
    return this.validate(state, player) === null ? [{ type: "ignite" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "pyromane") && !compelledToBurn(player)) return "no_skill";
    if (offShip(player.room)) return "cant_burn";
    if (isOnFire(state, player.room) || state.pendingFires.includes(player.room)) return "already_burning";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    state.pendingFires.push(player.room);
    // A Pyromania compulsion is satisfied: it ends, and the hidden grace starts (modifiers/pyromania_disorder.ts).
    if (compelledToBurn(player)) {
      delete player.compelledCycles;
      player.compulsionGrace = state.config.pyromania.graceCycles;
    }
    logSecret(state, player.id, "ignited", { name: player.character });
  }
}
