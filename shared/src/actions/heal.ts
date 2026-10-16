import { Action, peopleHere } from "./action.ts";
import { itemsIn } from "../items.ts";
import { logPublic } from "../log.ts";
import { healAmount } from "../modifiers.ts";
import type { GameState, PlayerId, PlayerState } from "../types.ts";

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
    super("heal");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): HealActionData[] {
    return canHeal(state, player) ? [player, ...peopleHere(state, player)].map((o) => ({ type: "heal", target: o.id })) : [];
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HealActionData): string | null {
    if (!canHeal(state, player)) return "no_medikit";
    if (target.target !== player.id && !peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return this.canAfford(state, player, target);
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HealActionData): { ap: number; mp: number } {
    return { ap: healCost(state, player, target.target), mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: HealActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    if (player.resources.heal > 0) player.resources.heal -= 1;
    patient.hp = Math.min(state.config.maxHp, patient.hp + healAmount(state, player));
    logPublic(state, player.room, patient.id === player.id ? "healedSelf" : "healed", { name: player.name, target: patient.name });
  }
}

const canHeal = (state: Readonly<GameState>, p: Readonly<PlayerState>): boolean =>
  state.config.healRooms.includes(p.room) || itemsIn(state, { kind: "player", id: p.id }).some((i) => i.type === "medikit");

const healCost = (state: Readonly<GameState>, p: Readonly<PlayerState>, target: PlayerId): number =>
  p.resources.heal > 0 ? 0 : target === p.id ? state.config.healApSelf : state.config.healApOther;
