import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { onExpedition } from "../expeditions.ts";
import { logPrivate } from "../log.ts";
import { hasSkill } from "../skills.ts";
import { addStatus, removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type BecomeNinjaActionData = { type: "become_ninja" };
export type BecomeNormalActionData = { type: "become_normal" };

export const NINJA = "ninja";

/** Whether `p` is acting as a ninja (a Mush with the Ninja skill and the `ninja` status). */
export const isNinja = (p: Readonly<PlayerState>): boolean => p.role === "mush" && hasSkill(p, "ninja") && p.statuses.includes(NINJA);

/**
 * Ninja: become a ninja (owner, 2026-11-22, as in eMush). 0 AP, instant, private, and not recorded, so Chitchat and
 * torture never reveal it. Untimed, so it doesn't get you out of bed. Not while on an expedition. While a ninja, your
 * name in the room lines your actions write reads "Someone" (`withNinjaActor` in log.ts).
 */
export class BecomeNinjaAction extends Action<BecomeNinjaActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;
  override recorded = false;

  constructor() {
    super("become_ninja");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BecomeNinjaActionData[] {
    return player.role === "mush" && hasSkill(player, "ninja") && !player.statuses.includes(NINJA) && !onExpedition(state, player)
      ? [{ type: "become_ninja" }]
      : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "ninja")) return "no_skill";
    if (onExpedition(state, player)) return "on_expedition";
    return player.statuses.includes(NINJA) ? "already_ninja" : null;
  }

  override apply(state: GameState, player: PlayerState): void {
    addStatus(player, NINJA);
    logPrivate(state, player.id, "becameNinja");
  }
}

/** Become normal again (owner, 2026-11-22). 0 AP, instant, private, not recorded; allowed anywhere. */
export class BecomeNormalAction extends Action<BecomeNormalActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;
  override recorded = false;

  constructor() {
    super("become_normal");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): BecomeNormalActionData[] {
    return player.statuses.includes(NINJA) ? [{ type: "become_normal" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return player.statuses.includes(NINJA) ? null : "not_ninja";
  }

  override apply(state: GameState, player: PlayerState): void {
    removeStatus(player, NINJA);
    logPrivate(state, player.id, "becameNormal");
  }
}
