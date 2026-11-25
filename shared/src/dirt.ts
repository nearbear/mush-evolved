// Getting dirty: an action's dirt chance (rules.ts), disease symptoms (modifiers/*_disease.ts, diseases.ts) and coming
// back from an expedition (expeditions.ts) all land here.

import { itemsIn } from "./items.ts";
import { logPrivate } from "./log.ts";
import { becameDirty } from "./modifiers.ts";
import { hasSkill } from "./skills.ts";
import { addStatus } from "./statuses.ts";
import type { GameState, PlayerState } from "./types.ts";

/** How dirt arrives. `superDirty` dirt (a disease symptom, coming back from an expedition) gets past an apron and Stickler. */
export type SoilOptions = { superDirty?: boolean };

/**
 * The player gets dirty, unless they already are, carry an apron, or are a Stickler (each told privately). The caller
 * rolled the chance. With `superDirty` (owner, 2026-11-25, as eMush's super-dirty dirt), the apron and Stickler don't
 * help. Mutates a cloned state.
 */
export function soil(state: GameState, player: PlayerState, options: SoilOptions = {}): void {
  if (player.statuses.includes("dirty")) return;
  if (!options.superDirty && itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === "apron")) {
    logPrivate(state, player.id, "apronBlockedDirty", { name: player.character });
  } else if (!options.superDirty && hasSkill(player, "stickler")) {
    logPrivate(state, player.id, "sticklerBlockedDirty", { name: player.character });
  } else {
    addStatus(player, "dirty");
    logPrivate(state, player.id, "becomeDirty", { name: player.character });
    becameDirty(state, player);
  }
}
