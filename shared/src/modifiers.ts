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
import { RESEARCH_COMPLETE } from "./research.ts";
import { skillsOf } from "./skills.ts";
import { antic_perfume } from "./modifiers/antic_perfume.ts";
import { caffeinomaniac } from "./modifiers/caffeinomaniac.ts";
import { cold_disease } from "./modifiers/cold_disease.ts";
import { creative } from "./modifiers/creative.ts";
import { expert } from "./modifiers/expert.ts";
import { computer } from "./modifiers/computer.ts";
import { designer } from "./modifiers/designer.ts";
import { sprint } from "./modifiers/sprint.ts";
import { physicist } from "./modifiers/physicist.ts";
import { botanic } from "./modifiers/botanic.ts";
import { first_aid } from "./modifiers/first_aid.ts";
import { logistics } from "./modifiers/logistics.ts";
import { immunity } from "./modifiers/immunity.ts";
import { lying_down } from "./modifiers/lying_down.ts";
import { mankind_only_hope } from "./modifiers/mankind_only_hope.ts";
import { medic } from "./modifiers/medic.ts";
import { pacifist } from "./modifiers/pacifist.ts";
import { wheelchair } from "./modifiers/wheelchair.ts";
import { sturdy } from "./modifiers/sturdy.ts";
import type { ActionCost } from "./actions.ts";
import type { ActionTag } from "./actions/action.ts";
import type { Action, GameState, ItemState, MovementRules, PlayerState } from "./types.ts";

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
  | "turretDamage"
  | "hullRepairAmount"
  | "carePointsPerDay"
  | "computerPointsPerDay"
  | "designerPointsPerDay"
  | "pilgredPointsPerDay"
  | "gardenPointsPerDay"
  | "heavyMpPenalty"
  | "maxMorale",
  FoldHook
>;

/** What is being priced, for cost hooks. */
export interface CostContext {
  state: Readonly<GameState>;
  actor: Readonly<PlayerState>;
  action: Action;
  tags: readonly ActionTag[];
}

export interface Modifier extends Partial<FoldHooks> {
  /** Adjusts what one of the holder's own actions costs. Must be pure. */
  actionCost?: (cost: ActionCost, ctx: CostContext) => ActionCost;
  /** Adjusts what one of the holder's own actions success rates. Must be pure. */
  actionSucessRate?: (successRate: number, ctx: CostContext) => number;
  /** Adjusts what one of the holder's own actions injury rates. Must be pure. */
  actionInjuryRate?: (cost: number, ctx: CostContext) => number;
  /** Adjusts what one of the holder's own actions dirtiness chance. Must be pure. */
  actionDirtRate?: (cost: number, ctx: CostContext) => number;
  /**
   * Adjusts what anyone's action costs in the room where the holder is, the holder's own included (Pacifist).
   * Read when a price is asked for, so nothing is stored when people come and go. Holders stack. Must be pure.
   * Only for a holder the actor can see, since the price itself tells them the effect is there.
   */
  roomActionCost?: (cost: ActionCost, ctx: CostContext & { holder: Readonly<PlayerState> }) => ActionCost;
  /** Adjusts the morale every living player loses when a day ends, while the holder is alive (Mankind's Only Hope). Must be pure. */
  crewMoraleLoss?: (loss: number, holder: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts the points the hunter pool gains each cycle change, while the holder is alive (for Space Tactics; none yet). Must be pure. */
  crewHunterPoints?: (points: number, holder: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts the share of hunters that follow the ship when it jumps, while the holder is alive (for Space Tactics; none yet). Must be pure. The hunter count after a jump is public, so only a public modifier may have it. */
  crewFollowingHunters?: (share: number, holder: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts how a player's moves are paid for. Must be pure. */
  movement?: (rules: MovementRules, player: Readonly<PlayerState>, state: Readonly<GameState>) => MovementRules;
  /**
   * Runs after one of the player's actions fails its success roll, with the AP it cost. Unlike the folds above,
   * it mutates a state the caller already cloned; randomness goes through `next.rng`.
   */
  onActionFailed?: (next: GameState, player: PlayerState, apSpent: number) => void;
  /** Runs for each living player at a cycle change, after the AP refill. Mutates a state the caller already cloned. */
  onCycle?: (next: GameState, player: PlayerState) => void;
  /** Runs after the player showers. Mutates a state the caller already cloned. */
  onShower?: (next: GameState, player: PlayerState) => void;
  /** Runs after the player consumes an item, once its own AP and satiety are applied. Mutates a state the caller already cloned. */
  onConsume?: (next: GameState, player: PlayerState, item: ItemState) => void;
  /** Runs once when the player picks this skill (not for other modifiers). Mutates a state the caller already cloned. */
  onPick?: (next: GameState, player: PlayerState) => void;
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** Items and skills will register here too. When a skill gains rules, update its entry in SKILL_STATUS (skills.ts). */
export const MODIFIERS: Record<string, Modifier> = { lying_down, medic, first_aid, sturdy, creative, expert, antic_perfume, logistics, caffeinomaniac, cold_disease, computer, designer, sprint, physicist, botanic, pacifist, immunity, mankind_only_hope, wheelchair };

/** The ids every hook folds over: the player's skills (book slot last), then their other modifiers. */
export function modifierIds(player: Readonly<PlayerState>): string[] {
  return [...skillsOf(player), ...player.modifiers];
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

/** Who brings room effects into `room`: every living player there, in seat order. */
function roomHolders(state: Readonly<GameState>, room: string): readonly Readonly<PlayerState>[] {
  return state.players.filter((p) => p.alive && p.room === room);
}

/**
 * What an action costs once modifiers have had their say: `base` (the action's own `getCost`) through the actor's
 * `actionCost` hooks in list order, then the `roomActionCost` hooks of everyone in the actor's room in seat order.
 * `Action.cost` is the only caller.
 */
export function actionCost(base: ActionCost, ctx: CostContext, registry: ModifierRegistry = MODIFIERS): ActionCost {
  let cost = { ...base };
  for (const id of modifierIds(ctx.actor)) {
    const hook = registry[id]?.actionCost;
    if (hook) cost = hook(cost, ctx);
  }
  for (const holder of roomHolders(ctx.state, ctx.actor.room)) {
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.roomActionCost;
      if (hook) cost = hook(cost, { ...ctx, holder });
    }
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  return { ap: Math.max(Math.min(0, base.ap), cost.ap), mp: Math.max(Math.min(0, base.mp), cost.mp) };
}

/**
 * What an action's success rate is once modifiers have had their say: `base` (the action's own `getSuccessChance`) through the actor's
 * `actionSuccessRate` hooks in list order.
 * `Action.cost` is the only caller.
 */
export function actionSuccessRate(base: number, ctx: CostContext, registry: ModifierRegistry = MODIFIERS): number {
  let chance = base;
  if(chance == 1){
    return 1;
  }
  for (const id of modifierIds(ctx.actor)) {
    const hook = registry[id]?.actionSucessRate;
    if (hook) chance = hook(chance, ctx);
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  // An Outcast (anathema.ts) loses a fifth of their chance on every action that rolls one (owner, 2026-10-24).
  if (ctx.actor.outcastBy !== undefined) chance *= ctx.state.config.anathema.successFactor;
  if(chance > 0.99){
    chance = 0.99;
  }
  return chance;
}

export function actionInjuryRate(base: number, ctx: CostContext, registry: ModifierRegistry = MODIFIERS): number {
  let chance = base;
  for (const id of modifierIds(ctx.actor)) {
    const hook = registry[id]?.actionInjuryRate;
    if (hook) chance = hook(chance, ctx);
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  return chance;
}

export function actionDirtRate(base: number, ctx: CostContext, registry: ModifierRegistry = MODIFIERS): number {
  let chance = base;
  for (const id of modifierIds(ctx.actor)) {
    const hook = registry[id]?.actionDirtRate;
    if (hook) chance = hook(chance, ctx);
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  return chance;
}

/** Morale each living player loses when a day ends: `moralePerDay` through every living player's `crewMoraleLoss` hooks, in seat order; never below 0. */
export function dailyMoraleLoss(state: Readonly<GameState>, registry: ModifierRegistry = MODIFIERS): number {
  let loss = state.config.moralePerDay;
  for (const holder of state.players) {
    if (!holder.alive) continue;
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.crewMoraleLoss;
      if (hook) loss = hook(loss, holder, state);
    }
  }
  return Math.max(0, loss);
}

/** Points the hunter pool gains at a cycle change: `base` through every living player's `crewHunterPoints` hooks, in seat order; never below 0. */
export function hunterPointsPerCycle(base: number, state: Readonly<GameState>, registry: ModifierRegistry = MODIFIERS): number {
  let points = base;
  for (const holder of state.players) {
    if (!holder.alive) continue;
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.crewHunterPoints;
      if (hook) points = hook(points, holder, state);
    }
  }
  return Math.max(0, points);
}

/** The share of hunters that follow a jump: `base` through every living player's `crewFollowingHunters` hooks, in seat order; between 0 and 1. */
export function followingHuntersShare(base: number, state: Readonly<GameState>, registry: ModifierRegistry = MODIFIERS): number {
  let share = base;
  for (const holder of state.players) {
    if (!holder.alive) continue;
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.crewFollowingHunters;
      if (hook) share = hook(share, holder, state);
    }
  }
  return Math.min(1, Math.max(0, share));
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
    if (hook) rules = hook(rules, player, state);
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
) => {
  const bonus = (state.research.MUSHOPHAGE_BACTERIA ?? 0) >= RESEARCH_COMPLETE ? state.config.infection.mushophageBonus : 0;
  return fold("contaminationCapacity", state.config.infection.capacity + bonus, state, player, registry);
};

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

/** Computer points a player gains at the start of a day: nothing by default, plus what the computer scientist skill grants. */
export const computerPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("computerPointsPerDay", 0, state, player, registry);

/** Designer points a player gains at the start of a day: nothing by default, plus what the designer skill grants. */
export const designerPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("designerPointsPerDay", 0, state, player, registry);

/** PILGRED points a player gains at the start of a day: nothing by default, plus what the physicist skill grants. */
export const pilgredPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("pilgredPointsPerDay", 0, state, player, registry);

/** Garden points a player gains at the start of a day: nothing by default, plus what the botanist skill grants. */
export const gardenPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("gardenPointsPerDay", 0, state, player, registry);

/** HP a punch removes: the rolled base damage folded through the puncher's modifiers. */
export const punchDamage = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("punchDamage", base, state, player, registry);

/** Max Morale */
export const maxMorale = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxMorale", base, state, player, registry);

/** Damage a turret shot does to a hunter: the rolled base folded through the shooter's modifiers (for Gunner; none yet). */
export const turretDamage = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("turretDamage", base, state, player, registry);

/** Hull a successful repair restores: the base folded through the repairer's modifiers (for the Vaguoscope; none yet). */
export const hullRepairAmount = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("hullRepairAmount", base, state, player, registry);

/** Runs every onShower hook of the player's modifiers. Mutates a state the caller already cloned. */
export function showered(next: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onShower?.(next, player);
}

/** Runs every onConsume hook of the player's modifiers. Mutates a state the caller already cloned. */
export function consumed(next: GameState, player: PlayerState, item: ItemState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onConsume?.(next, player, item);
}

/** Runs the picked skill's onPick hook. Mutates a state the caller already cloned. */
export function skillPicked(next: GameState, player: PlayerState, skill: string, registry: ModifierRegistry = MODIFIERS): void {
  registry[skill]?.onPick?.(next, player);
}

/** Runs every onCycle hook of each living player, in seat order. Mutates a state the caller already cloned. */
export function cycleChanged(next: GameState, registry: ModifierRegistry = MODIFIERS): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    for (const id of modifierIds(player)) registry[id]?.onCycle?.(next, player);
  }
}


