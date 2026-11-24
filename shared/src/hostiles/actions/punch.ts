// Punch, a hostile NPC's action (owner, 2026-11-23): the same as a player's Punch (actions/punch.ts) with the hostile
// as the puncher. `punch.cost.ap`, a living person in its room, lands at `punch.successChance`
// (`inactiveTargetSuccessChance` on an inactive target); a hit removes `punch.effect.damage` HP, or `punch.crit.damage`
// at `punch.crit.chance`, which goes through Plastenite Armor and Hard-boiled. Tagged aggressive and melee like a
// player's, so a Ceasefire stops it and Pacifist, Bodyguard and Elusive weigh on it (hostile.ts). Every outcome is
// public room history.

import { HostileAction } from "./action.ts";
import type { ActionTag } from "../../actions/action.ts";
import { damage } from "../../death.ts";
import { isInactive } from "../../inactivity.ts";
import { afterProtection } from "../../items.ts";
import { logPublic } from "../../log.ts";
import { roll, rollFloat } from "../../rng.ts";
import type { GameState, PlayerState } from "../../types.ts";
import type { HostileState } from "../hostile.ts";

export type PunchHostileData = { type: "punch"; target: string };

/** The living people in a hostile's room. */
const peopleNear = (state: Readonly<GameState>, self: Readonly<HostileState>): PlayerState[] =>
  state.players.filter((p) => p.alive && p.room === self.room);

class PunchAction extends HostileAction<PunchHostileData> {
  override readonly tags: readonly ActionTag[] = ["aggressive", "melee"];

  constructor() {
    super("punch");
  }

  override candidates(state: Readonly<GameState>, self: Readonly<HostileState>): PunchHostileData[] {
    return peopleNear(state, self).map((p) => ({ type: "punch", target: p.id }));
  }

  override cost(state: Readonly<GameState>) {
    return { ap: state.config.punch.cost.ap, mp: 0 };
  }

  override successChance(state: Readonly<GameState>, _self: Readonly<HostileState>, data: PunchHostileData): number {
    const victim = state.players.find((p) => p.id === data.target);
    return victim && isInactive(victim) ? state.config.punch.inactiveTargetSuccessChance : state.config.punch.successChance;
  }

  override apply(state: GameState, self: HostileState, data: PunchHostileData): void {
    const victim = state.players.find((p) => p.id === data.target)!; // a candidate, so it exists
    const crit = rollFloat(state) < state.config.punch.crit.chance;
    const hit = roll(state, crit ? state.config.punch.crit.damage : state.config.punch.effect.damage);
    const dealt = crit ? hit : afterProtection(state, victim, hit);
    const key = crit ? "hostilePunchCrit" : hit > 0 && dealt === 0 ? "hostilePunchArmor" : "hostilePunched";
    logPublic(state, self.room, key, { hostile: self.kind, target: victim.character });
    damage(state, victim, dealt, "assassinated");
  }

  override fail(state: GameState, self: HostileState, data: PunchHostileData): void {
    const victim = state.players.find((p) => p.id === data.target)!;
    logPublic(state, self.room, "hostilePunchMissed", { hostile: self.kind, target: victim.character });
  }
}

export const HOSTILE_PUNCH: HostileAction = new PunchAction() as HostileAction;
