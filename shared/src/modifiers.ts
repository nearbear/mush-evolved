// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), register it:
//   MODIFIERS["sprinter"] = { movement: (r) => ({ ...r, mpPerConversion: 4 }) };
// and put "sprinter" in the player's `modifiers`. A skill is a modifier too:
// its id goes in the player's `skills` instead.

import { logPrivate } from "./log.ts";
import { nextFloat } from "./rng.ts";
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
  /** Adjusts how many spores the Mush faction may extract per day, folded over the extracting player's modifiers. Must be pure. */
  sporesPerDay?: (cap: number, player: Readonly<PlayerState>) => number;
  /** Adjusts the HP a heal restores, folded over the healer's modifiers (skills, research). Must be pure. */
  healAmount?: (amount: number, player: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts the care points (free heals, `resources.heal`) a player gains at the start of each day. Must be pure. */
  carePointsPerDay?: (gain: number, player: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts the satiety a human loses each cycle. Must be pure. */
  satietyPerCycle?: (loss: number, player: Readonly<PlayerState>) => number;
  /**
   * Runs after one of the player's actions fails its success roll, with the AP it cost. Unlike the folds above,
   * it mutates a state the caller already cloned; randomness goes through `next.rng`.
   */
  onActionFailed?: (next: GameState, player: PlayerState, apSpent: number) => void;
  /** Runs once when the player picks this skill (not for other modifiers). Mutates a state the caller already cloned. */
  onPick?: (next: GameState, player: PlayerState) => void;
}

/**
 * A skill that grants care points: `config[key]` at the start of every day (the `carePointsPerDay` fold) and the
 * same amount once when it is picked. Skills that work like this are built from a factory, not a base class, so
 * a skill can combine several (hooks fold over the modifier registry).
 */
function careSkill(key: "nurseCarePointsPerDay"): Modifier {
  const gain = (state: Readonly<GameState>) => state.config[key];
  return {
    carePointsPerDay: (sum, _player, state) => sum + gain(state),
    onPick: (next, player) => {
      player.resources.heal += gain(next);
    },
  };
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** Items and skills will register here too. */
export const MODIFIERS: Record<string, Modifier> = {
  // Confirmed 2026-10-11: +1 AP per cycle while in a bed. Nothing applies it
  // yet; a lie-down action will add and remove it.
  lying_down: { apPerCycle: (gain) => gain + 1 },
  // Skill "medic" (Doctor), corrected 2026-10-15: heal actions restore 2 more HP. Its other perks are not built yet.
  medic: { healAmount: (amount, _player, state) => amount + state.config.medicHealBonus },
  // Skill "first_aid" (Nurse), per the owner 2026-10-15: 2 care points each day and 2 when picked.
  first_aid: careSkill("nurseCarePointsPerDay"),
  // Skill, confirmed 2026-10-15: a failed action that cost AP has a 50% chance
  // to give 1 AP back. It can't pass the AP cap, since the AP was just spent.
  creative: {
    onActionFailed(next, player, apSpent) {
      if (apSpent <= 0) return;
      const [roll, rng] = nextFloat(next.rng);
      next.rng = rng;
      if (roll >= next.config.creativeRefundOdds) return;
      player.ap += 1;
      logPrivate(next, player.id, "creativeRefund");
    },
  },
};

/** The ids every hook folds over: the player's skills, then their other modifiers. */
export function modifierIds(player: Readonly<PlayerState>): string[] {
  return [...player.skills, ...player.modifiers];
}

/** Runs every onActionFailed hook the player has. Mutates a state the caller already cloned. */
export function actionFailed(next: GameState, player: PlayerState, apSpent: number, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onActionFailed?.(next, player, apSpent);
}

/** Base movement rules folded through the player's modifiers, in list order. */
export function movementRules(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): MovementRules {
  let rules = { ...state.config.movement };
  for (const id of modifierIds(player)) {
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
  for (const id of modifierIds(player)) {
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
  for (const id of modifierIds(player)) {
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
  for (const id of modifierIds(player)) {
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
  for (const id of modifierIds(player)) {
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

/** Spores the Mush faction may extract per day: the configured count folded through the extracting player's modifiers. */
export function sporesPerDay(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let cap = state.config.sporesPerDay;
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.sporesPerDay;
    if (hook) cap = hook(cap, player);
  }
  return cap;
}

/** HP a heal restores: the configured amount folded through the healer's modifiers. */
export function healAmount(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let amount = state.config.healAmount;
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.healAmount;
    if (hook) amount = hook(amount, player, state);
  }
  return amount;
}

/** Satiety a human loses each cycle: the configured loss folded through the player's modifiers. */
export function satietyLoss(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let loss = state.config.satietyPerCycle;
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.satietyPerCycle;
    if (hook) loss = hook(loss, player);
  }
  return loss;
}

/** Care points a player gains at the start of a day: nothing by default, plus whatever their skills grant. */
export function carePointsGain(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let gain = 0;
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.carePointsPerDay;
    if (hook) gain = hook(gain, player, state);
  }
  return gain;
}

/** Runs the picked skill's onPick hook. Mutates a state the caller already cloned. */
export function skillPicked(next: GameState, player: PlayerState, skill: string, registry: ModifierRegistry = MODIFIERS): void {
  registry[skill]?.onPick?.(next, player);
}
