import { Action, IN_PRESELECTION } from "./action.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import { addStatus, removeStatus } from "../statuses.ts";
import type { ActionTag } from "./action.ts";
import type { GameState, PlayerState } from "../types.ts";

export type GuardActionData = { type: "guard" };
export type StopGuardingActionData = { type: "stop_guarding" };

export const GUARDIAN = "guardian";

/** Whether the player has the guardian status. */
export const isGuardian = (p: Readonly<PlayerState>): boolean => p.statuses.includes(GUARDIAN);

/**
 * Guard (owner, 2026-11-06): 1 AP, anyone, aggressive. Grants the `guardian` status, public to the room. While anyone
 * living in a room is a guardian, everyone else there can only leave by the door they came in through (`enteredFrom`);
 * someone who came in some other way (landing, waking from cryo, the start) can't leave by any door. The guardian is
 * never blocked: leaving, being moved or dying ends the status (`arrive`, `board`, `killPlayer`).
 */
export class GuardAction extends Action<GuardActionData> {
  override tags: readonly ActionTag[] = ["aggressive"];

  constructor() {
    super("guard");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): GuardActionData[] {
    return isGuardian(player) ? [] : [{ type: "guard" }];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    return isGuardian(player) ? "already_guarding" : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.guard.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    addStatus(player, GUARDIAN);
    logPublic(state, player.room, "guarded", { name: player.character });
  }
}

/** Stops guarding (owner, 2026-11-06): free, and only for a guardian. */
export class StopGuardingAction extends Action<StopGuardingActionData> {
  constructor() {
    super("stop_guarding");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): StopGuardingActionData[] {
    return isGuardian(player) ? [{ type: "stop_guarding" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return isGuardian(player) ? null : "not_guarding";
  }

  override apply(state: GameState, player: PlayerState): void {
    removeStatus(player, GUARDIAN);
    logPublic(state, player.room, "stoppedGuarding", { name: player.character });
  }
}

/**
 * Whether a living guardian other than `player` is in their room, so `player` may only leave by the door they came in by.
 * A guardian is never blocked, nor is someone with the Escape (Sneak) skill (owner, 2026-11-06).
 */
export function isBlocked(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return !isGuardian(player) && !hasSkill(player, "escape") && state.players.some((o) => o.alive && o.id !== player.id && o.room === player.room && isGuardian(o));
}
