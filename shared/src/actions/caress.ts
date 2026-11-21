import { Action, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { CAT_ITEM, canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

/** Reason code: a Germaphobe actor can't caress Schrödinger. Shown disabled rather than hidden (`isUnaffordableReason`). */
export const GERMAPHOBE = "germaphobe";

export type CaressActionData = { type: "caress"; item: string };

/**
 * Caress Schrödinger (owner, 2026-11-21; eMush PetCat): 1 AP, 10% injury chance, public room log,
 * works on floor or in inventory. Grants +3 morale once per player per game (still repeatable after
 * for 0 morale). Blocked for Germaphobe (Finola).
 */
export class CaressAction extends Action<CaressActionData> {
  constructor() {
    super("caress", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.schrodinger.caress.cost.ap, mp: 0 };
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.schrodinger.caress.injuryChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CaressActionData[] {
    return state.items
      .filter((item) => item.type === CAT_ITEM && canReachItem(state, player, item))
      .map((item) => ({ type: "caress", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CaressActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== CAT_ITEM || !canReachItem(state, player, item)) return "no_such_item";
    if (player.modifiers.includes("germaphobe")) return GERMAPHOBE;
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: CaressActionData): void {
    logPublic(state, player.room, "caressedCat", { name: player.character });
    if (!player.caressedCat) {
      player.caressedCat = true;
      gainMorale(state, player, state.config.schrodinger.caress.morale);
    }
  }
}
