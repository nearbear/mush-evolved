import { Action, type ActionCost, peopleHere, isString } from "./action.ts";
import { heal as healHp } from "../death.ts";
import { itemsIn, removeItem, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { bandageHealAmount, healed } from "../modifiers.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { BANDAGE_ITEM } from "../itemIds.ts";

export type UseBandageActionData = { type: "use_bandage"; target: string };

/**
 * Use bandage (owner, 2026-11-07, #397): carrying a bandage, spend `bandage.cost.ap` AP on yourself or any living
 * person in your room. Restores `bandage.effect.hp` HP through the `healAmount` modifier hook (so the medic's bonus
 * applies), capped at max HP, and uses the bandage up. Offered even at full HP; Mush and humans use it the same way.
 * Public room history.
 */
export class UseBandageAction extends Action<UseBandageActionData> {
  constructor() {
    super("use_bandage", { target: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UseBandageActionData[] {
    return bandageOf(state, player) ? [player, ...peopleHere(state, player)].map((o) => ({ type: "use_bandage", target: o.id })) : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UseBandageActionData): string | null {
    if (!bandageOf(state, player)) return "no_bandage";
    if (target.target !== player.id && !peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.bandage.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.bandage.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: UseBandageActionData): void {
    const patient = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    removeItem(state, bandageOf(state, player)!.id);
    healHp(state, patient, bandageHealAmount(state, player));
    healed(state, player, patient);
    logPublic(state, player.room, patient.id === player.id ? "bandagedSelf" : "bandaged", { name: player.character, target: patient.character });
  }
}

const bandageOf = (state: Readonly<GameState>, p: Readonly<PlayerState>): ItemState | undefined =>
  itemsIn(state, { kind: "player", id: p.id }).find((i) => i.type === BANDAGE_ITEM && isWorking(i));
