// Food spoilage (owner, 2026-11-18, following eMush). Perishable food (`ItemType.perishable`: coffee, cooked rations,
// bananas, alien fruits) goes one stage further at each day change, carried or on a floor: fresh, unstable, hazardous,
// decomposing, and stays decomposing. Nothing freezes food yet, and NERON never destroys it. Eating it rolls
// `config.spoilage.sickChance` for its stage (0, 50%, 90%) for Food Poisoning; a Mush rolls too and carries it
// (`diseaseAffects`), like a fruit's diseases. Only living Chefs see the stage (eMush's status visibility).

import { addDisease } from "./diseases.ts";
import { ITEM_TYPES } from "./items.ts";
import { rollFloat } from "./rng.ts";
import { hasSkill } from "./skills.ts";
import type { GameState, ItemState, PlayerState, SpoilStage } from "./types.ts";

/** The stages in order; a fresh item has none. */
export const SPOIL_STAGES: readonly SpoilStage[] = ["unstable", "hazardous", "decomposing"];

/** The stage after `stage` (undefined: fresh); decomposing is the last. */
export function nextSpoilStage(stage: SpoilStage | undefined): SpoilStage {
  return SPOIL_STAGES[Math.min(SPOIL_STAGES.length - 1, stage === undefined ? 0 : SPOIL_STAGES.indexOf(stage) + 1)]!;
}

/** Day change: every perishable item spoils one stage. No randomness. Mutates a state the caller already cloned. */
export function spoilFood(state: GameState): void {
  for (const item of state.items) {
    if (ITEM_TYPES[item.type]?.perishable) item.spoil = nextSpoilStage(item.spoil);
  }
}

/** Eating `item`: rolls its stage's sickness chance (no roll for fresh or harmless food). Mutates `state.rng`. */
export function eatSpoiled(state: GameState, player: PlayerState, item: Readonly<ItemState>): void {
  if (item.spoil === undefined) return;
  const chance = state.config.spoilage.sickChance[item.spoil];
  if (chance > 0 && rollFloat(state) < chance) addDisease(state, player, state.config.spoilage.disease);
}

/** Who sees how spoiled food is: living Chefs (the `cook` skill), as in eMush. */
export function seesSpoil(viewer: Readonly<PlayerState>): boolean {
  return viewer.alive && hasSkill(viewer, "cook");
}
