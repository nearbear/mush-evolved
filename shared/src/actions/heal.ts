import { Action, type ActionCost, peopleHere, isString } from "./action.ts";
import { heal as healHp } from "../death.ts";
import { itemsIn, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { healAmount, healed } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type HealActionData = { type: "heal"; target: string };

/**
 * Healing (confirmed 2026-10-15): hold a medikit (reusable), or stand in a heal
 * room (the sick bay; no medikit needed), and heal yourself or a living person
 * in your room. Costs `healApOther` on someone else, `healApSelf` on yourself,
 * or nothing while you have a care point (`resources.heal`, spent automatically);
 * restores `healAmount` HP (modifiable), capped at max HP. Offered even at full
 * HP. Public room history.
 */
export class HealAction extends Action<HealActionData> {
  constructor() {
    super("heal", { target: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): HealActionData[] {
    return canHeal(state, player) ? [player, ...peopleHere(state, player)].map((o) => ({ type: "heal", target: o.id })) : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HealActionData): string | null {
    if (!canHeal(state, player)) return "no_medikit";
    if (target.target !== player.id && !peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HealActionData): ActionCost {
    if (player.resources.heal > 0) return { ap: 0, mp: 0, paidBy: "heal" };
    return { ap: target.target === player.id ? state.config.heal.cost.apSelf : state.config.heal.cost.apOther, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.heal.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: HealActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    healHp(state, patient, healAmount(state, player));
    healed(state, player, patient);
    logPublic(state, player.room, patient.id === player.id ? "healedSelf" : "healed", { name: player.character, target: patient.character });
  }
}

const canHeal = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean =>
  state.config.heal.rooms.includes(p.room) || itemsIn(state, { kind: "player", id: p.id }).some((i) => i.type === "medikit" && isWorking(i));
