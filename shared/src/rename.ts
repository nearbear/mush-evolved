// Renaming owned items (owner, 2026-11-25): friendly NPCs (drones), plants, and customized blasters. Types with
// `canRename: false` (items.ts) are never renamed, even by their owner (owner, 2026-11-26: Schrödinger).
// Free, instant, unlimited, silent (no room log). Free-form text, so it is a direct input moderated by the server
// before reaching the rules (like chat/threads), not an enumerable Action.

import { cloneState, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { ITEM_TYPES } from "./itemTypes.ts";
import { canReachItem } from "./items.ts";
import { isComatose } from "./statuses.ts";
import type { GameState, ItemId, ItemState, PlayerId, PlayerState } from "./types.ts";

/** Maximum length of a custom item name (matches MAX_NAME_LENGTH in protocol.ts). */
export const MAX_ITEM_NAME_LENGTH = 24;

/** Whether items of this type can ever be renamed (`ItemType.canRename`). */
export function isRenameableType(type: string): boolean {
  return ITEM_TYPES[type]?.canRename !== false;
}

/** Whether `player` can currently rename `item`: a renameable type, living, non-comatose owner with the item in reach during play. */
export function canRenameItem(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return (
    state.phase === "playing" &&
    player.alive &&
    !isComatose(state, player) &&
    isRenameableType(item.type) &&
    item.owner === player.id &&
    canReachItem(state, player, item)
  );
}

/**
 * Sets or clears an owned item's custom name. Expects text already moderated by the server (`GameRoom.ts`); an empty
 * string clears the custom name so the item reverts to its default name. Silent (no room log).
 */
export function renameItem(state: GameState, playerId: PlayerId, itemId: ItemId, rawName: string): ActionResult {
  if (state.phase !== "playing") return fail("game_ended");
  const player = findPlayer(state, playerId);
  if (!player) return fail("unknown_player");
  if (!player.alive) return fail("dead");
  if (isComatose(state, player)) return fail("comatose");
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return fail("no_such_item");
  if (!isRenameableType(item.type)) return fail("cant_rename");
  if (item.owner !== player.id) return fail("not_owner");
  if (!canReachItem(state, player, item)) return fail("cant_rename");
  const name = rawName.replace(/\s+/g, " ").trim();
  if (name.length > MAX_ITEM_NAME_LENGTH) return fail("item_name_invalid");
  const next = cloneState(state);
  const target = next.items.find((i) => i.id === itemId)!;
  if (name) target.customName = name;
  else delete target.customName;
  return { ok: true, state: next };
}
