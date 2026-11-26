import { Action, isString } from "./action.ts";
import { canReachItem, produceItem } from "../items.ts";
import { DOCUMENT_ITEM, TABULATOR_ITEM } from "../itemIds.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import { rollList } from "../theList.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PrintListActionData = { type: "print_list"; item: string };

/** The `validate` code for Print THE List before the Mush are chosen: shown disabled, not hidden (owner, 2026-11-21). */
export const MUSH_NOT_SELECTED = "mush_not_selected";

/** The `validate` code for Print THE List once the game's one print is spent: shown disabled, not hidden (owner, 2026-11-21). */
export const LIST_PRINTED = "list_printed";

/**
 * Print THE List (#266, owner 2026-10-25 and 2026-11-21; docs/plans/archive/the-list.md): a Tracker (`hunt`, Stephen's too
 * through Apprentice) at the tabulator, for `theList.cost.ap`. Once per game, whoever prints first; a torn list can't be
 * printed again. The document (theList.ts `rollList`) goes into the printer's hands, or onto the floor if they're
 * full. Public room log. Disabled with a reason before selection, after the print, and on a broken tabulator.
 */
export class PrintListAction extends Action<PrintListActionData> {
  constructor() {
    super("print_list", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.theList.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PrintListActionData[] {
    if (!hasSkill(player, "hunt")) return [];
    return state.items.filter((item) => item.type === TABULATOR_ITEM && canReachItem(state, player, item)).map((item) => ({ type: "print_list", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PrintListActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item || item.type !== TABULATOR_ITEM || !canReachItem(state, player, item)) return "no_such_item";
    if (!hasSkill(player, "hunt")) return "no_skill";
    if (state.preselection || state.theList.selectedAt === null) return MUSH_NOT_SELECTED;
    if (state.theList.printed) return LIST_PRINTED;
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: PrintListActionData): void {
    const characters = rollList(state);
    state.theList.printed = true;
    produceItem(state, player, DOCUMENT_ITEM).item.document = { kind: "the_list", characters };
    logPublic(state, player.room, "theListPrinted", { name: player.character });
  }
}
