// Getting dirty: an action's dirt chance (rules.ts) and coming back from an expedition (expeditions.ts) both land here.

import { itemsIn } from "./items.ts";
import { logPrivate } from "./log.ts";
import { hasSkill } from "./skills.ts";
import { addStatus } from "./statuses.ts";
import type { GameState, PlayerState } from "./types.ts";

/**
 * The player gets dirty, unless they already are, carry an apron, or are a Stickler (each told privately). The caller
 * rolled the chance. Mutates a cloned state.
 */
export function soil(state: GameState, player: PlayerState): void {
  if (player.statuses.includes("dirty")) return;
  if (itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === "apron")) {
    logPrivate(state, player.id, "apronBlockedDirty", { name: player.character });
  } else if (hasSkill(player, "stickler")) {
    logPrivate(state, player.id, "sticklerBlockedDirty", { name: player.character });
  } else {
    addStatus(player, "dirty");
    logPrivate(state, player.id, "becomeDirty", { name: player.character });
  }
}
