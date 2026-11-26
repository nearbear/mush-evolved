import { Action, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { contaminate } from "../infection.ts";
import { CAT_ITEM } from "../itemIds.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

/** Reason code: a Germaphobe actor can't caress Schrödinger. Shown disabled rather than hidden (`isUnaffordableReason`). */
export const GERMAPHOBE = "germaphobe";

export type CaressActionData = { type: "caress"; item: string };

/**
 * Caress Schrödinger (owner, 2026-11-21; eMush PetCat): 1 AP, 10% injury chance, public room log,
 * must be carried in inventory. Grants +3 morale once per player per game (still repeatable after
 * for 0 morale). Blocked for Germaphobe (Finola). If Schrödinger is Mush and scratches, contaminates by 1.
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
      .filter((item) => item.type === CAT_ITEM && item.at.kind === "player" && item.at.id === player.id)
      .map((item) => ({ type: "caress", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CaressActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== CAT_ITEM || item.at.kind !== "player" || item.at.id !== player.id) return "no_such_item";
    if (player.modifiers.includes("germaphobe")) return GERMAPHOBE;
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: CaressActionData): void {
    const item = state.items.find((i) => i.id === target.item);
    logPublic(state, player.room, "caressedCat", { name: player.character, ...(item?.customName && { cat: item.customName }) });
    if (!player.caressedCat) {
      player.caressedCat = true;
      gainMorale(state, player, state.config.schrodinger.caress.morale);
    }
  }

  override onInjury(state: GameState, player: PlayerState, target: CaressActionData): void {
    const item = state.items.find((i) => i.id === target.item);
    if (item?.type === CAT_ITEM && item.mush) contaminate(state, player);
  }
}
