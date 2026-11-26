import { Action, peopleHere, isString } from "./action.ts";
import { endPushToLeave } from "./accommodate.ts";
import { cure } from "../infection.ts";
import { markSeen } from "../inactivity.ts";
import { itemsIn, removeItem, isWorking } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { emptyQueue } from "../queueCore.ts";
import { leaveTerminal } from "../spot.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { ANTI_MUSH_SERUM_ITEM } from "../itemIds.ts";

export type VaccinateActionData = { type: "vaccinate"; target: string };

/**
 * Vaccinate (owner, 2026-10-25, from the wiki): carrying an anti-Mush serum, spend `vaccine.cost.ap` AP on a living
 * person in your room (never yourself). A Mush becomes human, and a human with some contamination loses it (`cure`).
 * The serum is used up whatever the target was. The room sees only that a serum was used; the result is private to the
 * user, and the cured person is told privately.
 */
export class VaccinateAction extends Action<VaccinateActionData> {
  constructor() {
    super("vaccinate", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.vaccine.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): VaccinateActionData[] {
    return serumOf(state, player) ? peopleHere(state, player).map((o) => ({ type: "vaccinate", target: o.id })) : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: VaccinateActionData): string | null {
    if (!serumOf(state, player)) return "no_serum";
    if (!peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: VaccinateActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    removeItem(state, serumOf(state, player)!.id);
    logPublic(state, player.room, "vaccinated", { name: player.character, target: patient.character });
    logPrivate(state, player.id, cure(state, patient) ? "vaccineWorked" : "vaccineNothing", { target: patient.character });
    // Put the patient into a coma after logging `vaccinated` / `cured` so they see those lines upon waking (#489).
    patient.comaUntil = state.cycle + state.config.vaccine.comaCycles;
    emptyQueue(state, patient, false);
    patient.current = null;
    removeStatus(patient, "guardian");
    for (const other of state.players) if (other.protectedBy === patient.id) delete other.protectedBy;
    endPushToLeave(state, patient);
    delete patient.boardedIcarus;
    leaveTerminal(patient);
    if (state.now > 0) markSeen(state, [patient.id], state.now);
  }
}

const serumOf = (state: Readonly<GameState>, p: Readonly<PlayerState>): ItemState | undefined =>
  itemsIn(state, { kind: "player", id: p.id }).find((i) => i.type === ANTI_MUSH_SERUM_ITEM && isWorking(i));
