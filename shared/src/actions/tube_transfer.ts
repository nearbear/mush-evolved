import { Action, isString } from "./action.ts";
import { ITEM_TYPES } from "../itemTypes.ts";
import { canReachItem, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { rollInt } from "../rng.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { INPUT_TUBE_ITEM, OUTPUT_TUBE_ITEM } from "../itemIds.ts";

export type TubeTransferActionData = { type: "tube_transfer"; item: string };

/** Whether an input tube lies on the floor of this room. A carried tube does nothing. */
const hasInputTube = (state: Readonly<GameState>, room: string): boolean =>
  state.items.some((i) => i.type === INPUT_TUBE_ITEM && isWorking(i) && i.at.kind === "room" && i.at.id === room);

/** What the tube accepts: anything the player can reach (floor or own inventory) except the tubes, and except what can't be dropped or taken. */
function sendable(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  if (item.type === INPUT_TUBE_ITEM || item.type === OUTPUT_TUBE_ITEM) return false;
  const type = ITEM_TYPES[item.type];
  return type?.canDrop !== false && type?.canTake !== false && canReachItem(state, player, item);
}

/**
 * The pneumatic tube (owner, 2026-11-04; docs/plans/project-buffs.md, Fruit Mover). An item you can reach (on the floor
 * or carried) is sent from a room with an input tube to the floor of the room of an output tube, picked at random when
 * there are several. Output tubes that are carried don't count. With none, the item stays put and the action still
 * resolves, so nobody learns where output tubes are. Input and output tubes can't be sent. Free by default
 * (`tubeTransfer.cost.ap`). The sender's room sees the item go; the output room sees it arrive.
 */
export class TubeTransferAction extends Action<TubeTransferActionData> {
  constructor() {
    super("tube_transfer", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.tubeTransfer.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TubeTransferActionData[] {
    if (!hasInputTube(state, player.room)) return [];
    return state.items.filter((i) => sendable(state, player, i)).map((i) => ({ type: "tube_transfer", item: i.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TubeTransferActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!hasInputTube(state, player.room)) return "no_input_tube";
    return sendable(state, player, item) ? null : "cant_transfer";
  }

  override apply(state: GameState, player: PlayerState, target: TubeTransferActionData): void {
    const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    logPublic(state, player.room, "tubeSent", { name: player.character, item: item.type });
    const outputs = state.items.filter((i) => i.type === OUTPUT_TUBE_ITEM && i.at.kind === "room");
    if (outputs.length === 0) return;
    const room = outputs[outputs.length === 1 ? 0 : rollInt(state, outputs.length)]!.at.id;
    state.items.splice(state.items.indexOf(item), 1);
    delete item.hiddenBy;
    item.at = { kind: "room", id: room };
    state.items.push(item);
    logPublic(state, room, "tubeArrived", { item: item.type });
  }
}
