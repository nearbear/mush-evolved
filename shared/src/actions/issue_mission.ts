import { Action, AT_CAPACITY, isString, type ActionVisibility } from "./action.ts";
import { changeAP } from "../adjustStats.ts";
import { findPlayer } from "../helpers.ts";
import { isInactive } from "../inactivity.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerId, PlayerState } from "../types.ts";

export type IssueMissionActionData = { type: "issue_mission"; subordinate: PlayerId };

/**
 * Commander's Issue mission (owner, 2026-11-18, #462): only the current Commander (Mush included; never via Hacker
 * Kit or `freeHacking`) may spend `commanderMission.cost.ap` (1) AP from any room, once per ship per day, to grant
 * any other living, active crewmate (in any room) `commanderMission.apGranted` (3) AP, capped at their max AP.
 * Private: one log line for the Commander, one for the target; nobody else sees anything. Once used, the Commander
 * still sees the button, disabled (`AT_CAPACITY`), as the owner prefers disabled buttons to hidden ones.
 *
 * The target field is deliberately named `subordinate`, not `target`: `actionTarget()` would treat `target` as
 * someone to walk up to in the room view, whereas the recipient may be in another room.
 */
export class IssueMissionAction extends Action<IssueMissionActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("issue_mission", { subordinate: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.commanderMission.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): IssueMissionActionData[] {
    if (state.titles.commander !== player.id) return [];
    return state.players
      .filter((o) => o.id !== player.id && o.alive && !isInactive(o))
      .map((o): IssueMissionActionData => ({ type: "issue_mission", subordinate: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, action: IssueMissionActionData): string | null {
    if (state.titles.commander !== player.id) return "not_commander";
    const subordinate = findPlayer(state, action.subordinate);
    if (!subordinate || subordinate.id === player.id || !subordinate.alive || isInactive(subordinate)) return "invalid_subordinate";
    if (state.missionIssuedToday) return AT_CAPACITY;
    return null;
  }

  override apply(state: GameState, player: PlayerState, action: IssueMissionActionData): void {
    const subordinate = findPlayer(state, action.subordinate);
    if (!subordinate) return;
    const amount = state.config.commanderMission.apGranted;
    changeAP(state, subordinate, amount);
    state.missionIssuedToday = true;
    logPrivate(state, player.id, "missionIssued", { target: subordinate.character });
    logPrivate(state, subordinate.id, "missionReceived", { amount });
  }
}
