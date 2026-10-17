// ---- Infection --------------------------------------------------------------
// Contamination and conversion (confirmed 2026-10-15). A human whose
// contamination reaches capacity converts to Mush at once. There is no cure yet.

import { pushChat } from "./chat.ts";
import { logPrivate } from "./log.ts";
import { contaminationCapacity } from "./modifiers.ts";
import { isImmune } from "./statuses.ts";
import { MUSH_CHANNEL, type GameState, type PlayerState } from "./types.ts";

/**
 * The one way contamination rises (spikes, DTT with a Mush). Reaching capacity
 * converts the human. Mutates a state that the caller already cloned.
 */
export function contaminate(state: GameState, human: PlayerState, amount = 1): void {
  if (human.role !== "human" || !human.alive || isImmune(state, human)) return;
  const level = (state.contamination[human.id] ?? 0) + amount;
  const capacity = contaminationCapacity(state, human);
  if (level >= capacity) {
    convert(state, human);
    tellMush(state, "mushConverted", { name: human.name });
  } else {
    state.contamination[human.id] = level;
    tellMush(state, "mushContaminated", { name: human.name, level, capacity });
  }
}

/** A system message in the Mush channel (decided 2026-10-16). Names the human and the level, never the Mush responsible. */
function tellMush(state: GameState, key: string, params: Record<string, string | number>): void {
  pushChat(state, MUSH_CHANNEL, { from: null, name: "", isBot: false, text: "", system: { key, params } });
}

/**
 * The contamination `viewer` sees on `target`: only a Mush looking at a living
 * human with some contamination (added 2026-10-15 to help debug infection). A
 * human never sees anyone's, their own included. Undefined means show nothing.
 */
export function contaminationSeenBy(state: Readonly<GameState>, viewer: Readonly<PlayerState>, target: Readonly<PlayerState>): number | undefined {
  if (viewer.role !== "mush" || target.role !== "human" || !target.alive) return undefined;
  const level = state.contamination[target.id] ?? 0;
  return level > 0 ? level : undefined;
}

/**
 * Turns a human into a (beta) Mush. Skills, HP, and morale stay; satiety and hunger
 * are human-only, so they go. Spore extraction is ready at once (no cooldown entry).
 * Only the convert is told, privately; nobody learns who caused it.
 */
function convert(state: GameState, player: PlayerState): void {
  player.role = "mush";
  player.alpha = false;
  player.satiety = 0;
  player.satietyZeroSince = null;
  delete state.contamination[player.id];
  logPrivate(state, player.id, "converted");
}
