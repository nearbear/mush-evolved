import { Action, type ActionCost, type ActionVisibility, COOLDOWN, isString } from "./action.ts";
import { addDisease } from "../diseases.ts";
import { damage } from "../death.ts";
import { removeContamination } from "../infection.ts";
import { canReachItem, isWorking } from "../items.ts";
import { SPORE_SUCKER_ITEM } from "../itemIds.ts";
import { logPrivate } from "../log.ts";
import { hasImmunityTrait } from "../statuses.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type RemoveSporeActionData = { type: "remove_spore"; item: string };

const STIFF_NECK = "stiff_neck_injury";
/** Refusal for a player with the Immunity trait (Chun): shown disabled with the reason (owner, 2026-11-27). */
export const IMMUNE = "immune";

/**
 * Remove a spore with the Spore Sucker (owner, 2026-11-20): with a working one you can reach (carried or on the floor),
 * spend `sporeSucker.cost.ap` AP on yourself. A human loses 1 contamination if they have any; a Mush's spores are
 * untouched. Either way you take `sporeSucker.effect.damage` damage (it can kill: cause `injury`) and get Stiff Neck,
 * which also blocks this action until it wears off (shown disabled, with the wait). Reusable. Private: the log line is
 * the same whether or not a spore came out, so it never tells you whether you were contaminated. Not for a player with
 * the Immunity trait (owner, 2026-11-27): shown disabled with the reason. The trait is public, so this tells nobody anything.
 */
export class RemoveSporeAction extends Action<RemoveSporeActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("remove_spore", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RemoveSporeActionData[] {
    return suckersFor(state, player).map((i) => ({ type: "remove_spore", item: i.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RemoveSporeActionData): string | null {
    if (!suckersFor(state, player).some((i) => i.id === target.item)) return "cant_reach";
    if (hasImmunityTrait(player)) return IMMUNE;
    if (this.cooldownLeft(state, player, target) > 0) return COOLDOWN;
    return null;
  }

  /** Stiff Neck's cycles left: the action waits for it to wear off. */
  override cooldownLeft(_state: Readonly<GameState>, player: Readonly<PlayerState>, _target: RemoveSporeActionData): number {
    if (!player.modifiers.includes(STIFF_NECK)) return 0;
    return Math.max(1, player.diseaseTrackers.find((t) => t.name === STIFF_NECK)?.duration ?? 1);
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.sporeSucker.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.sporeSucker.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, _target: RemoveSporeActionData): void {
    removeContamination(state, player); // humans only; a no-op without contamination
    logPrivate(state, player.id, "sporeSuckerUsed", { name: player.character });
    addDisease(state, player, STIFF_NECK);
    damage(state, player, state.config.sporeSucker.effect.damage, "injury");
  }
}

const suckersFor = (state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] =>
  state.items.filter((i) => i.type === SPORE_SUCKER_ITEM && isWorking(i) && canReachItem(state, player, i));
