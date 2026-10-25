import { Action } from "./action.ts";
import { BOOK_ITEM, canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import { skillPicked } from "../modifiers.ts";
import { hasSkill, isSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReadBookActionData = { type: "read_book"; item: string };

/**
 * Read a skill book (owner, 2026-10-21): `readBook.cost.ap`, on a book you can reach (carried or on the floor).
 * Its skill fills your book slot (`PlayerState.bookSkill`) for good and the book is destroyed. One book per
 * player; refused for a skill you already have. Mush can read too. Public room log.
 */
export class ReadBookAction extends Action<ReadBookActionData> {
  constructor() {
    super("read_book");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.readBook.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReadBookActionData[] {
    if (player.bookSkill !== undefined) return [];
    return state.items
      .filter((item) => item.type === BOOK_ITEM && item.teaches !== undefined && !hasSkill(player, item.teaches) && canReachItem(state, player, item))
      .map((item) => ({ type: "read_book", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReadBookActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== BOOK_ITEM || !canReachItem(state, player, item)) return "no_such_item";
    if (!isSkill(item.teaches)) return "no_such_skill";
    if (player.bookSkill !== undefined) return "book_slot_full";
    if (hasSkill(player, item.teaches)) return "have_skill";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ReadBookActionData): void {
    const item = state.items.find((i) => i.id === target.item)!;
    const skill = item.teaches!;
    state.items = state.items.filter((i) => i.id !== item.id);
    player.bookSkill = skill;
    skillPicked(state, player, skill);
    logPublic(state, player.room, "bookRead", { name: player.character, skill });
  }
}
