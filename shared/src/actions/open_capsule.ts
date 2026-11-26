import { Action, isString } from "./action.ts";
import { SPACE_CAPSULE_ITEM } from "../itemIds.ts";
import { canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import { rollInt } from "../rng.ts";
import type { GameState, PlayerState } from "../types.ts";

export type OpenCapsuleActionData = { type: "open_capsule"; item: string };

/**
 * Open a space capsule, carried or in the room (owner, 2026-10-24, docs/plans/archive/patrol.md answer 6): 1 AP, and it becomes
 * metal scraps, plastic scraps, an oxygen capsule or a fuel capsule (25% each), where it was. Public, like eating.
 */
export class OpenCapsuleAction extends Action<OpenCapsuleActionData> {
  constructor() {
    super("open_capsule", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.spaceCapsule.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): OpenCapsuleActionData[] {
    return state.items.filter((item) => item.type === SPACE_CAPSULE_ITEM && canReachItem(state, player, item)).map((item) => ({ type: "open_capsule", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: OpenCapsuleActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    return item.type === SPACE_CAPSULE_ITEM && canReachItem(state, player, item) ? null : "cant_open";
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.spaceCapsule.injuryChance;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.spaceCapsule.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: OpenCapsuleActionData): void {
    const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    const { contents } = state.config.spaceCapsule;
    item.type = contents[rollInt(state, contents.length)]!;
    logPublic(state, player.room, "capsuleOpened", { name: player.character, item: item.type });
  }
}
