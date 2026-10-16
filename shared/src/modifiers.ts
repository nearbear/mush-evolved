// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), put a file in
// modifiers/ exporting a Modifier, register it below, and put its id in the
// player's `modifiers`. A skill is a modifier too: its id goes in the player's
// `skills` instead. A new numeric hook is one line in `FoldHooks` plus a one-line
// accessor below; `fold` does the looping.

import { carriesHeavy } from "./items.ts";
import { creative } from "./modifiers/creative.ts";
import { first_aid } from "./modifiers/first_aid.ts";
import { lying_down } from "./modifiers/lying_down.ts";
import { medic } from "./modifiers/medic.ts";
import { sturdy } from "./modifiers/sturdy.ts";
import type { GameState, MovementRules, PlayerState } from "./types.ts";

/** A numeric hook: takes the running value and returns the adjusted one. Must be pure. */
type FoldHook = (value: number, player: Readonly<PlayerState>, state: Readonly<GameState>) => number;

/** The numeric hooks `fold` can run, each documented by the accessor that folds it. */
type FoldHooks = Record<
  | "apPerCycle"
  | "inventorySlots"
  | "channelLimit"
  | "contaminationCapacity"
  | "sporesPerDay"
  | "healAmount"
  | "satietyPerCycle"
  | "punchDamage"
  | "carePointsPerDay"
  | "heavyMpPenalty",
  FoldHook
>;

export interface Modifier extends Partial<FoldHooks> {
  /** Adjusts how a player's moves are paid for. Must be pure. */
  movement?: (rules: MovementRules, player: Readonly<PlayerState>) => MovementRules;
  /**
   * Runs after one of the player's actions fails its success roll, with the AP it cost. Unlike the folds above,
   * it mutates a state the caller already cloned; randomness goes through `next.rng`.
   */
  onActionFailed?: (next: GameState, player: PlayerState, apSpent: number) => void;
  /** Runs once when the player picks this skill (not for other modifiers). Mutates a state the caller already cloned. */
  onPick?: (next: GameState, player: PlayerState) => void;
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** Items and skills will register here too. When a skill gains rules, update its entry in SKILL_STATUS (skills.ts). */
export const MODIFIERS: Record<string, Modifier> = { lying_down, medic, first_aid, sturdy, creative };

/** The ids every hook folds over: the player's skills, then their other modifiers. */
export function modifierIds(player: Readonly<PlayerState>): string[] {
  return [...player.skills, ...player.modifiers];
}

/** Folds `base` through the named hook of each of the player's modifiers, in list order. */
function fold(
  hook: keyof FoldHooks,
  base: number,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry,
): number {
  let value = base;
  for (const id of modifierIds(player)) {
    const fn = registry[id]?.[hook];
    if (fn) value = fn(value, player, state);
  }
  return value;
}

/** Runs every onActionFailed hook the player has. Mutates a state the caller already cloned. */
export function actionFailed(next: GameState, player: PlayerState, apSpent: number, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onActionFailed?.(next, player, apSpent);
}

/** Base movement rules folded through the player's modifiers, in list order, plus the heavy-item penalty. */
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
  if (carriesHeavy(state, player)) rules.mpPerMove += fold("heavyMpPenalty", state.config.heavy.mpPenalty, state, player, registry);
  return rules;
}

/** AP gained at the start of a cycle: the base gain folded through the player's modifiers. */
export const apGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("apPerCycle", state.config.apPerCycle, state, player, registry);

/** Inventory slots: the configured count folded through the player's modifiers. */
export const inventorySlots = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("inventorySlots", state.config.inventorySlots, state, player, registry);

/** Private channels a player may belong to: the configured count folded through the player's modifiers. */
export const channelLimit = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("channelLimit", state.config.channelLimit, state, player, registry);

/** Contamination a player can take before converting: the configured capacity folded through their modifiers. */
export const contaminationCapacity = (
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
) => fold("contaminationCapacity", state.config.infection.capacity, state, player, registry);

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
export const sporesPerDay = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("sporesPerDay", state.config.spores.perDay, state, player, registry);

/** HP a heal restores: the configured amount folded through the healer's modifiers. */
export const healAmount = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("healAmount", state.config.heal.effect.hp, state, player, registry);

/** Satiety a human loses each cycle: the configured loss folded through the player's modifiers. */
export const satietyLoss = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("satietyPerCycle", state.config.hunger.satietyPerCycle, state, player, registry);

/** Care points a player gains at the start of a day: nothing by default, plus whatever their skills grant. */
export const carePointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("carePointsPerDay", 0, state, player, registry);

/** HP a punch removes: the configured damage folded through the puncher's modifiers. */
export const punchDamage = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("punchDamage", state.config.punch.effect.damage, state, player, registry);

/** Runs the picked skill's onPick hook. Mutates a state the caller already cloned. */
export function skillPicked(next: GameState, player: PlayerState, skill: string, registry: ModifierRegistry = MODIFIERS): void {
  registry[skill]?.onPick?.(next, player);
}
