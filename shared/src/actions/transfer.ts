import { Action, isString } from "./action.ts";
import { onExpedition } from "../expeditions.ts";
import { ITEM_TYPES, canTransfer } from "../items.ts";
import { isLostPlace } from "../patrol.ts";
import { logPublic } from "../log.ts";
import type { Container, GameState, ItemState, PlayerState } from "../types.ts";

export type TransferActionData = { type: "take"; item: string } | { type: "drop"; item: string };

export class TransferAction<T extends "take" | "drop" = "take" | "drop"> extends Action<{ type: T; item: string }> {
  // Taking and dropping are left out of the action history, as in eMush (owner, 2026-10-24).
  override recorded = false;
  override onBrokenItem = true;

  constructor(type: T) {
    super(type, { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): { type: T; item: string }[] {
    const kind = this.type === "take" ? "room" : "player";
    const id = this.type === "take" ? player.room : player.id;
    return state.items
      .filter((item) => item.at.kind === kind && item.at.id === id)
      .map((item) => ({ type: this.type as T, item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: { type: T; item: string }): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (this.type === "drop" && ITEM_TYPES[item.type]?.canDrop === false) return "cant_transfer";
    // Nothing can be dropped on an expedition (owner, 2026-11-08 and 2026-11-09, #359): aboard its craft or lost on the planet.
    if (this.type === "drop" && (onExpedition(state, player) || isLostPlace(player.room))) return "on_expedition";
    const destination: Container = this.type === "take" ? { kind: "player", id: player.id } : { kind: "room", id: player.room };
    return canTransfer(state, player, item, destination) ? null : "cant_transfer";
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.transfer.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: { type: T; item: string }): void {
    const index = state.items.findIndex((i) => i.id === target.item);
    const [item] = state.items.splice(index, 1) as [ItemState];
    delete item.hiddenBy;
    item.at = this.type === "take" ? { kind: "player", id: player.id } : { kind: "room", id: player.room };
    state.items.push(item);
    logPublic(state, player.room, this.type === "take" ? "pickedUp" : "dropped", { name: player.character, item: item.type });
  }
}
