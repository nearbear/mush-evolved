// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), register it:
//   MODIFIERS["sprinter"] = { movement: (r) => ({ ...r, mpPerConversion: 4 }) };
// and put "sprinter" in the player's `modifiers`.

import type { GameState, MovementRules, PlayerState } from "./types.ts";

export interface Modifier {
  /** Adjusts how a player's moves are paid for. Must be pure. */
  movement?: (rules: MovementRules, player: Readonly<PlayerState>) => MovementRules;
  /** Adjusts the AP a player gains at the start of a cycle. Must be pure. */
  apPerCycle?: (gain: number, player: Readonly<PlayerState>) => number;
  /** Adjusts how many inventory slots a player has. Must be pure. */
  inventorySlots?: (slots: number, player: Readonly<PlayerState>) => number;
  /** Adjusts how many private channels a player may belong to. Must be pure. */
  channelLimit?: (limit: number, player: Readonly<PlayerState>) => number;
  /** Adjusts how much contamination a player can take before converting. Must be pure. */
  contaminationCapacity?: (capacity: number, player: Readonly<PlayerState>) => number;
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** Items and skills will register here too. */
export const MODIFIERS: Record<string, Modifier> = {
  // Confirmed 2026-10-11: +1 AP per cycle while in a bed. Nothing applies it
  // yet; a lie-down action will add and remove it.
  lying_down: { apPerCycle: (gain) => gain + 1 },
};

/** Base movement rules folded through the player's modifiers, in list order. */
export function movementRules(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): MovementRules {
  let rules = { ...state.config.movement };
  for (const id of player.modifiers) {
    const hook = registry[id]?.movement;
    if (hook) rules = hook(rules, player);
  }
  return rules;
}

/** AP gained at the start of a cycle: the base gain folded through the player's modifiers. */
export function apGain(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let gain = state.config.apPerCycle;
  for (const id of player.modifiers) {
    const hook = registry[id]?.apPerCycle;
    if (hook) gain = hook(gain, player);
  }
  return gain;
}

/** Inventory slots: the configured count folded through the player's modifiers. */
export function inventorySlots(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let slots = state.config.inventorySlots;
  for (const id of player.modifiers) {
    const hook = registry[id]?.inventorySlots;
    if (hook) slots = hook(slots, player);
  }
  return slots;
}

/** Private channels a player may belong to: the configured count folded through the player's modifiers. */
export function channelLimit(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let limit = state.config.channelLimit;
  for (const id of player.modifiers) {
    const hook = registry[id]?.channelLimit;
    if (hook) limit = hook(limit, player);
  }
  return limit;
}

/** Contamination a player can take before converting: the configured capacity folded through their modifiers. */
export function contaminationCapacity(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let capacity = state.config.contaminationCapacity;
  for (const id of player.modifiers) {
    const hook = registry[id]?.contaminationCapacity;
    if (hook) capacity = hook(capacity, player);
  }
  return capacity;
}

/**
 * What a move would cost: AP spent and MP afterwards, or null if the player
 * can't afford it. If MP is short, converts AP once (1 AP -> 3 MP by default),
 * then spends MP. Conversion never pushes MP past the cap.
 */
export function moveCost(
  rules: MovementRules,
  player: Readonly<Pick<PlayerState, "ap" | "mp">>,
): { ap: number; mpAfter: number } | null {
  if (player.mp >= rules.mpPerMove) return { ap: 0, mpAfter: player.mp - rules.mpPerMove };
  if (player.ap < rules.apPerConversion) return null;
  const converted = Math.min(rules.mpCap, player.mp + rules.mpPerConversion);
  if (converted < rules.mpPerMove) return null;
  return { ap: rules.apPerConversion, mpAfter: converted - rules.mpPerMove };
}
