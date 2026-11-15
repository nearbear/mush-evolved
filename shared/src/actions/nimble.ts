import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { logPrivate } from "../log.ts";
import { hasSkill } from "../skills.ts";
import { addStatus, removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type EnterNimbleActionData = { type: "enter_nimble" };
export type ExitNimbleActionData = { type: "exit_nimble" };

export const NIMBLE = "nimble";

/** Whether `p` is actively in Nimble mode (Mush with Nimble Fingers and the `nimble` status). */
export const isNimble = (p: Readonly<PlayerState>): boolean =>
  p.role === "mush" && hasSkill(p, "nimble_fingers") && p.statuses.includes(NIMBLE);

/**
 * Nimble Fingers: enter Nimble mode (owner, 2026-11-14). 0 AP, instant, private.
 * While active, room-level public actions (including movement) are logged as secret instead.
 */
export class EnterNimbleAction extends Action<EnterNimbleActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;

  constructor() {
    super("enter_nimble");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): EnterNimbleActionData[] {
    return player.role === "mush" && hasSkill(player, "nimble_fingers") && !player.statuses.includes(NIMBLE)
      ? [{ type: "enter_nimble" }]
      : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "nimble_fingers")) return "no_skill";
    return player.statuses.includes(NIMBLE) ? "already_nimble" : null;
  }

  override apply(state: GameState, player: PlayerState): void {
    addStatus(player, NIMBLE);
    logPrivate(state, player.id, "enteredNimble", { name: player.character });
  }
}

/** Exit Nimble mode (owner, 2026-11-14). 0 AP, instant, private. */
export class ExitNimbleAction extends Action<ExitNimbleActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;

  constructor() {
    super("exit_nimble");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): ExitNimbleActionData[] {
    return player.statuses.includes(NIMBLE) ? [{ type: "exit_nimble" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return player.statuses.includes(NIMBLE) ? null : "not_nimble";
  }

  override apply(state: GameState, player: PlayerState): void {
    removeStatus(player, NIMBLE);
    logPrivate(state, player.id, "exitedNimble", { name: player.character });
  }
}
