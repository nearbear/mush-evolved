import { Action, type ActionCost, peopleHere, isString } from "./action.ts";
import { addDisease, removeDisease } from "../diseases.ts";
import { equipmentHere } from "../equipment.ts";
import { itemsIn, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { rollInt } from "../rng.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SurgeryActionData = { type: "surgery"; target: string };

export const SURGERY_POD = "SURGERY_POD";
export const SEPSIS_DISEASE = "sepsis_disease";

/**
 * Surgery (owner, 2026-11-17): next to a working Surgery Pod (the Sick Bay's), or as a medic holding a working medikit,
 * operate on yourself or a living person in your room who has an injury. Costs `surgery.cost.apOther` on someone else,
 * `apSelf` on yourself, or nothing while you have a care point (`resources.heal`, like heal). Succeeds at
 * `surgery.successChance` (the medic and nurse modifiers multiply it) and removes one of the patient's injuries at
 * random; a failure gives the patient sepsis. 25% dirty. Public room history either way.
 *
 * Offered only on an injured patient, so a surgeon can tell who is injured although injuries are private statuses: the
 * owner accepted that leak (2026-11-17).
 */
export class SurgeryAction extends Action<SurgeryActionData> {
  constructor() {
    super("surgery", { target: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SurgeryActionData[] {
    if (!canOperate(state, player)) return [];
    return [player, ...peopleHere(state, player)].filter((o) => injuriesOf(state, o).length > 0).map((o) => ({ type: "surgery", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SurgeryActionData): string | null {
    if (!canOperate(state, player)) return "cant_operate";
    const patient = target.target === player.id ? player : peopleHere(state, player).find((o) => o.id === target.target);
    if (!patient) return "cant_see";
    return injuriesOf(state, patient).length > 0 ? null : "no_injury";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SurgeryActionData): ActionCost {
    if (player.resources.heal > 0) return { ap: 0, mp: 0, paidBy: "heal" };
    return { ap: target.target === player.id ? state.config.surgery.cost.apSelf : state.config.surgery.cost.apOther, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.surgery.successChance;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.surgery.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: SurgeryActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    const injuries = injuriesOf(state, patient);
    removeDisease(state, patient, injuries[rollInt(state, injuries.length)]!);
    logPublic(state, player.room, patient.id === player.id ? "operatedSelf" : "operated", { name: player.character, target: patient.character });
  }

  override fail(state: GameState, player: PlayerState, target: SurgeryActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    logPublic(state, player.room, patient.id === player.id ? "operationFailedSelf" : "operationFailed", { name: player.character, target: patient.character });
    addDisease(state, patient, SEPSIS_DISEASE);
  }
}

const canOperate = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean =>
  equipmentHere(state, p, SURGERY_POD).length > 0 ||
  (hasSkill(p, "medic") && itemsIn(state, { kind: "player", id: p.id }).some((i) => i.type === "medikit" && isWorking(i)));

const injuriesOf = (state: Readonly<GameState>, p: Readonly<PlayerState>): string[] =>
  p.modifiers.filter((m) => state.config.diseases.allInjuries.includes(m));
