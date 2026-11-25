import { Action, isString } from "./action.ts";
import { onExpedition } from "../expeditions.ts";
import { contaminate } from "../infection.ts";
import { CAT_ITEM, ITEM_TYPES, canTransfer } from "../items.ts";
import { preferSpikedInRoom } from "../itemView.ts";
import { isLostPlace, patrolShip } from "../patrol.ts";
import { logPrivate, logPublic } from "../log.ts";
import { cantCarryHeavy } from "../modifiers.ts";
import { heldCat } from "../modifiers/cat_allergy_disease.ts";
import type { Container, GameState, ItemState, PlayerState } from "../types.ts";

/** Why nothing can be dropped (or hidden) here: you are flying a patrol ship. */
export const IN_PATROL_SHIP = "in_patrol_ship";

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
      .filter((item) => item.at.kind === kind && item.at.id === id && (this.type !== "take" || ITEM_TYPES[item.type]?.canTake !== false))
      .map((item) => ({ type: this.type as T, item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: { type: T; item: string }): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (this.type === "drop" && ITEM_TYPES[item.type]?.canDrop === false) return "cant_transfer";
    if (this.type === "take" && ITEM_TYPES[item.type]?.canTake === false) return "cant_transfer";
  // Broken Shoulder: no heavy item (owner, 2026-11-18).
    if (this.type === "take" && ITEM_TYPES[item.type]?.heavy && cantCarryHeavy(player)) return "too_heavy";
    // Nothing can be dropped on an expedition (owner, 2026-11-08 and 2026-11-09, #359): aboard its craft or lost on the
    // planet. Aboard the docked Icarus you are in the bay and may drop there (owner, 2026-11-21, #469).
    if (this.type === "drop" && (onExpedition(state, player) || isLostPlace(player.room))) return "on_expedition";
    // Nothing can be dropped in a patrol ship either (owner, 2026-11-25), so a wreck never scatters anyone's iTrackie.
    if (this.type === "drop" && patrolShip(player.room) !== undefined) return IN_PATROL_SHIP;
    const destination: Container = this.type === "take" ? { kind: "player", id: player.id } : { kind: "room", id: player.room };
    return canTransfer(state, player, item, destination) ? null : "cant_transfer";
  }

  override injuryChance(state: Readonly<GameState>, _player: Readonly<PlayerState>, target: { type: T; item: string }): number {
    if (this.type === "take" && state.items.find((i) => i.id === target.item)?.type === CAT_ITEM) {
      return state.config.schrodinger.take.injuryChance;
    }
    return state.config.transfer.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: { type: T; item: string }): void {
    const requested = state.items.find((i) => i.id === target.item)!;
    const chosen = this.type === "take" ? preferSpikedInRoom(state, player, requested) : requested;
    const index = state.items.findIndex((i) => i.id === chosen.id);
    const [item] = state.items.splice(index, 1) as [ItemState];
    delete item.hiddenBy;
    item.at = this.type === "take" ? { kind: "player", id: player.id } : { kind: "room", id: player.room };
    state.items.push(item);
    const line = [this.type === "take" ? "pickedUp" : "dropped", { name: player.character, item: item.type }] as const;
    // Your own private item (the iTrackie, owner 2026-11-18): nobody else sees it, so nobody sees you take or drop it.
    if (item.privateTo !== undefined) logPrivate(state, player.id, ...line);
    else logPublic(state, player.room, ...line);
    // Cat Allergy (owner, 2026-11-21): picking Schrödinger up gives Quincke's Oedema, injured or not.
    if (this.type === "take" && item.type === CAT_ITEM) heldCat(state, player);
  }

  override onInjury(state: GameState, player: PlayerState, target: { type: T; item: string }): void {
    if (this.type !== "take") return;
    const item = state.items.find((i) => i.id === target.item);
    if (item?.type === CAT_ITEM && item.mush) contaminate(state, player);
  }
}
