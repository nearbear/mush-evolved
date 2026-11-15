import { Action, IN_PRESELECTION, peopleHere, isString } from "./action.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ProtectActionData = { type: "protect"; target: string };

/**
 * Protect, the Bodyguard's (`bodyguard`) action (owner, 2026-11-14): `bodyguard.cost.ap` (1), on a living other
 * player in your room who is not already protected. Sets `victim.protectedBy` = you (clearing any previous VIP you
 * protected). While both are alive in the same room, every `aggressive` action targeting the VIP costs
 * `bodyguard.aggressiveApSurcharge` (2) extra AP, including by the Bodyguard themselves. Persists across movement;
 * ends when either dies or you protect someone else. Both get public statuses in the room (`protecting` /
 * `protected`), and activation logs publicly to the room.
 */
export class ProtectAction extends Action<ProtectActionData> {
  constructor() {
    super("protect", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.bodyguard.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ProtectActionData[] {
    if (!hasSkill(player, "bodyguard")) return [];
    return peopleHere(state, player)
      .filter((o) => o.protectedBy === undefined)
      .map((o) => ({ type: "protect", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ProtectActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!hasSkill(player, "bodyguard")) return "no_skill";
    const victim = peopleHere(state, player).find((o) => o.id === target.target);
    if (!victim) return "cant_see";
    if (victim.protectedBy !== undefined) return "already_protected";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ProtectActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    for (const o of state.players) if (o.protectedBy === player.id) delete o.protectedBy;
    victim.protectedBy = player.id;
    logPublic(state, player.room, "protected", { name: player.character, target: victim.character });
  }
}
