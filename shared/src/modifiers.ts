// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), put a file in
// modifiers/ exporting a Modifier, register it below, and put its id in the
// player's `modifiers`. A skill is a modifier too: its id goes in the player's
// `skills` instead. A new numeric hook is one line in `FoldHooks` plus a one-line
// accessor below; `fold` does the looping.

import { isBrokenIn } from "./equipment.ts";
import { carriesHeavy, isWorking } from "./items.ts";
import { projectDone } from "./projects.ts";
import { RESEARCH_COMPLETE } from "./research.ts";
import { skillsOf } from "./skills.ts";
import { antic_perfume } from "./modifiers/antic_perfume.ts";
import { astrophysician } from "./modifiers/astrophysician.ts";
import { bodyguard } from "./modifiers/bodyguard.ts";
import { botanic } from "./modifiers/botanic.ts";
import { caffeinomaniac } from "./modifiers/caffeinomaniac.ts";
import { computer } from "./modifiers/computer.ts";
import { cook } from "./modifiers/cook.ts";
import { creative } from "./modifiers/creative.ts";
import { designer } from "./modifiers/designer.ts";
import { engineer } from "./modifiers/engineer.ts";
import { escape } from "./modifiers/escape.ts";
import { expert } from "./modifiers/expert.ts";
import { first_aid } from "./modifiers/first_aid.ts";
import { frugivore } from "./modifiers/frugivore.ts";
import { green_thumb } from "./modifiers/green_thumb.ts";
import { gunman } from "./modifiers/gunman.ts";
import { gunner } from "./modifiers/gunner.ts";
import { lethargy } from "./modifiers/lethargy.ts";
import { logistics } from "./modifiers/logistics.ts";
import { maintenance_agent } from "./modifiers/maintenance_agent.ts";
import { medic } from "./modifiers/medic.ts";
import { mycologist } from "./modifiers/mycologist.ts";
import { observant } from "./modifiers/observant.ts";
import { paranoid } from "./modifiers/paranoid.ts";
import { persistent } from "./modifiers/persistent.ts";
import { physicist } from "./modifiers/physicist.ts";
import { pilot } from "./modifiers/pilot.ts";
import { polymath } from "./modifiers/polymath.ts";
import { robotics } from "./modifiers/robotics.ts";
import { sapper } from "./modifiers/sapper.ts";
import { space_tactics } from "./modifiers/space_tactics.ts";
import { sprint } from "./modifiers/sprint.ts";
import { sturdy } from "./modifiers/sturdy.ts";
import { hyperactive } from "./modifiers/hyperactive.ts";
import { immunity } from "./modifiers/immunity.ts";
import { mankind_only_hope } from "./modifiers/mankind_only_hope.ts";
import { pacifist } from "./modifiers/pacifist.ts";
import { wheelchair } from "./modifiers/wheelchair.ts";
import { lying_down } from "./modifiers/lying_down.ts";
import { cold_disease } from "./modifiers/cold_disease.ts";
import { extreme_tinnitus_disease } from "./modifiers/extreme_tinnitus_disease.ts";
import { fungal_infection_disease } from "./modifiers/fungal_infection_disease.ts";
import { space_rabies_disease } from "./modifiers/space_rabies_disease.ts";
import { skin_inflammation_disease } from "./modifiers/skin_inflammation_disease.ts";
import { smallpox_disease } from "./modifiers/smallpox_disease.ts";
import { rejuvenation_disease } from "./modifiers/rejuvenation_disease.ts";
import { mush_allergy_disease } from "./modifiers/mush_allergy_disease.ts";
import { gastroenteritis_disease } from "./modifiers/gastroenteritis_disease.ts";
import { broken_nose_injury } from "./modifiers/broken_nose_injury.ts";
import type { ActionCost } from "./actions.ts";
import type { ActionTag } from "./actions/action.ts";
import type { TitleId } from "./titles.ts";
import type { Action, GameState, ItemState, MovementRules, PlayerState } from "./types.ts";

/** A numeric hook: takes the running value and returns the adjusted one. Must be pure. */
type FoldHook = (value: number, player: Readonly<PlayerState>, state: Readonly<GameState>) => number;

/** The numeric hooks `fold` can run, each documented by the accessor that folds it. */
type FoldHooks = Record<
  | "apPerCycle"
  | "mpPerCycle"
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
  | "engineerPointsPerDay"
  | "shootPointsPerDay"
  | "computerPointsCap"
  | "failureStreakMultiplier"
  | "analysisSectors"
  | "pilgredPointsPerDay"
  | "gardenPointsPerDay"
  | "cookPointsPerDay"
  | "heavyMpPenalty"
  | "cleanManoeuvreChance"
  | "maxAp"
  | "maxMp"
  | "maxMorale"
  | "maxHp"
  | "damageTaken",
  FoldHook
>;

/** The actions a broken Stellar antenna makes dearer: contacting Sol, decoding a rebel base, contacting Xyloph and updating NERON. */
const COMMS_ACTIONS: readonly string[] = ["contact_sol", "decode_rebel", "contact_xyloph", "update_neron"];

/** What is being priced, for cost hooks. */
export interface CostContext {
  state: Readonly<GameState>;
  actor: Readonly<PlayerState>;
  action: Action;
  tags: readonly ActionTag[];
}

/**
 * What an onEnterRoom hook may call from the actions layer. The move action passes them in, because a modifier cannot
 * import an action (the actions import the modifiers, and a cycle breaks their classes).
 */
export interface EnterRoomTools {
  /** The player strikes a random other player in the room with a weapon they carry, at no AP cost (actions/attack.ts). */
  attackWithHeldWeapon: (state: GameState, player: PlayerState) => void;
}

const NO_TOOLS: EnterRoomTools = { attackWithHeldWeapon: () => {} };

export interface Modifier extends Partial<FoldHooks> {
  /** Adjusts what one of the holder's own actions costs. Must be pure. */
  actionCost?: (cost: ActionCost, ctx: CostContext) => ActionCost;
  /** Adjusts what one of the holder's own actions success rates. Must be pure. */
  actionSucessRate?: (successRate: number, ctx: CostContext) => number;
  /**
   * Adjusts the success rate of an action aimed at the holder (Escape), after the actor's own hooks. `ctx.actor` is the
   * one acting; the hook sees only actions whose `target` names the holder. Must be pure.
   */
  targetedSuccessRate?: (successRate: number, ctx: CostContext & { holder: Readonly<PlayerState> }) => number;
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
  /**
   * Adjusts the chance that a hunter wave comes smaller, while the holder is alive (Space Tactics). Must be pure.
   * The wave size is public, so it hints that some living player has the skill (as in the original), but not who.
   */
  crewWaveShrinkChance?: (chance: number, holder: Readonly<PlayerState>, state: Readonly<GameState>) => number;
  /** Adjusts how a player's moves are paid for. Must be pure. */
  movement?: (rules: MovementRules, player: Readonly<PlayerState>, state: Readonly<GameState>) => MovementRules;
  /**
   * Runs after one of the player's actions fails its success roll, with the AP it cost. Unlike the folds above,
   * it mutates a state the caller already cloned; randomness goes through `next.rng`.
   */
  onActionFailed?: (next: GameState, player: PlayerState, apSpent: number) => void;
  /**
   * Adjusts the AP a player is about to gain at a cycle change's refill (`gain`, already folded through apPerCycle).
   * Unlike the folds it runs once, at the refill, so it may roll (`next.rng`). Never reaches a Mush's diseases.
   */
  onApRefill?: (gain: number, next: GameState, player: PlayerState) => number;
  /** Runs for each living player at a cycle change, after the AP refill. Mutates a state the caller already cloned. */
  /** (A disease hook also reaches a Mush: it guards its own stat effects with `diseaseAffects`, diseases.ts.) */
  onCycle?: (next: GameState, player: PlayerState) => void;
  /** Runs after the player showers. Mutates a state the caller already cloned. */
  onShower?: (next: GameState, player: PlayerState) => void;
  /** Runs after the player consumes an item, once its own AP and satiety are applied. Mutates a state the caller already cloned. */
  onConsume?: (next: GameState, player: PlayerState, item: ItemState) => void;
  /** Runs after the player heals someone (heal or use_bandage), once HP is restored. Mutates a state the caller already cloned. */
  onHeal?: (next: GameState, player: PlayerState, patient: PlayerState) => void;
  /**
   * Runs at the end of `contaminate` (infection.ts), once the player's contamination rose by `amount` or converted them
   * (then they are already Mush). Not when the contamination was refused (immune, not a living human). Mutates a state
   * the caller already cloned.
   */
  onContaminate?: (next: GameState, player: PlayerState, amount: number) => void;
  /** Runs once when the player picks this skill (not for other modifiers). Mutates a state the caller already cloned. */
  onPick?: (next: GameState, player: PlayerState) => void;
  /** Runs whenever the ship moves */
  onShipMovement?: (next: GameState, player: PlayerState) => void;
  /** Runs after the holder moves into a room, whoever is there (a move action). Mutates a state the caller already cloned. */
  onEnterRoom?: (next: GameState, player: PlayerState, tools: EnterRoomTools) => void;
  /** Runs when a player enters a room with another player */
  onEncounter?: (next: GameState, player: PlayerState, other: PlayerState) => void;
  /** Runs when the player gains a ship title (initial assignment, succession, or coup). Mutates a state the caller already cloned. */
  onTitleGained?: (next: GameState, player: PlayerState, title: TitleId) => void;
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** Items and skills will register here too. When a skill gains rules, update its entry in SKILL_STATUS (skills.ts). */
export const MODIFIERS: Record<string, Modifier> = {
  // Skills
  antic_perfume,
  astrophysician,
  botanic,
  caffeinomaniac,
  computer,
  cook,
  creative,
  designer,
  engineer,
  escape,
  expert,
  first_aid,
  frugivore,
  green_thumb,
  gunman,
  gunner,
  lethargy,
  logistics,
  maintenance_agent,
  medic,
  mycologist,
  observant,
  paranoid,
  persistent,
  physicist,
  pilot,
  polymath,
  robotics,
  sapper,
  space_tactics,
  sprint,
  sturdy,
  bodyguard,
  // Character traits
  hyperactive,
  immunity,
  mankind_only_hope,
  pacifist,
  wheelchair,
  // Statuses
  lying_down,
  // Diseases
  cold_disease,
  extreme_tinnitus_disease,
  fungal_infection_disease,
  gastroenteritis_disease,
  skin_inflammation_disease,
  space_rabies_disease,
  smallpox_disease,
  rejuvenation_disease,
  mush_allergy_disease,
  // Injuries
  broken_nose_injury,
};

/**
 * The ids every numeric (fold) and cost hook runs over: the player's skills (book slot last), then their other
 * modifiers. A Mush's diseases are left out, so they never change a Mush's numbers (diseases.ts).
 */
export function modifierIds(player: Readonly<PlayerState>): string[] {
  const ids = [...skillsOf(player), ...player.modifiers];
  return player.role === "mush" ? ids.filter((id) => !isDiseaseId(id)) : ids;
}

const isDiseaseId = (id: string): boolean => id.endsWith("_disease");

/** The diseases a Mush has, which `modifierIds` leaves out. Empty for anyone else. */
function mushDiseaseIds(player: Readonly<PlayerState>): string[] {
  return player.role === "mush" ? player.modifiers.filter(isDiseaseId) : [];
}

/**
 * The ids the event hooks (onCycle, onShipMovement, onEnterRoom, onEncounter) run over: `modifierIds` plus a Mush's
 * diseases. A disease's event hook can do three things at once, so it decides for itself: stat effects only when
 * `diseaseAffects(player)` (diseases.ts), special logs only when `canHaveSpecialLogs(player)`, spreading always.
 * Fold and cost hooks never reach a Mush's diseases.
 */
function eventIds(player: Readonly<PlayerState>): string[] {
  return [...modifierIds(player), ...mushDiseaseIds(player)];
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
  if (ctx.action.type === "scan_planet" && projectDone(ctx.state, "CHIPSET_ACCELERATION")) {
    cost.ap -= ctx.state.config.project.chipsetAcceleration.scanApDiscount;
  }
  // Takeoff thruster (owner, 2026-11-14): patrol ship, Pasiphae, and Icarus takeoff cost 1 AP less.
  if ((ctx.action.type === "takeoff" || ctx.action.type === "icarus_takeoff") && projectDone(ctx.state, "PATROL_SHIP_LAUNCHER")) {
    cost.ap -= ctx.state.config.project.patrolShipLauncher.takeoffApDiscount;
  }
  // A broken Stellar antenna makes the four Comms terminal actions cost more (owner, 2026-11-08); other actions at the terminal don't.
  if (COMMS_ACTIONS.includes(ctx.action.type) && isBrokenIn(ctx.state, "MOTOR_ROOM", "MOTOR_ROOM:STELLAR_ANTENNA")) {
    cost.ap += ctx.state.config.antenna.brokenApSurcharge;
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  return { ap: Math.max(Math.min(0, base.ap), cost.ap), mp: Math.max(Math.min(0, base.mp), cost.mp), ...(base.paidBy && { paidBy: base.paidBy }) };
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
  // Whoever the action is aimed at gets a say too (Escape).
  const aimed = (ctx.action as { target?: unknown }).target;
  const holder = typeof aimed === "string" ? ctx.state.players.find((o) => o.id === aimed) : undefined;
  if (holder) {
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.targetedSuccessRate;
      if (hook) chance = hook(chance, { ...ctx, holder });
    }
  }
  // Carrying the oscilloscope multiplies the odds of the repairing actions (owner, 2026-10-28). Once however many are carried.
  if ((ctx.action.type === "repair_hull" || ctx.action.type === "renovate") && ctx.state.items.some((i) => i.type === "oscilloscope" && isWorking(i) && i.at.kind === "player" && i.at.id === ctx.actor.id)) {
    chance *= ctx.state.config.oscilloscope.repairFactor;
  }
  // Heuristic targeting (owner, 2026-11-14): x1.25 aim on turret and patrol ship shots for everyone on the crew.
  if ((ctx.action.type === "turret_attack" || ctx.action.type === "patrol_attack") && projectDone(ctx.state, "NERON_TARGETING_ASSIST")) {
    chance *= ctx.state.config.project.neronTargetingAssist.accuracyFactor;
  }
  // Hooks can't make a price negative. A move's MP is a net change and can already be negative (a conversion
  // gives more than the move spends), so the floor is 0 or the base, whichever is lower.
  // An Outcast (anathema.ts) loses a fifth of their chance on every action that rolls one (owner, 2026-10-24).
  if (ctx.actor.outcastBy !== undefined) chance *= ctx.state.config.anathema.successFactor;
  if (ctx.actor.perceptionUntil !== undefined && ctx.state.cycle < ctx.actor.perceptionUntil) {
    chance *= ctx.state.config.botany.fruits.buffs.perception.factor;
  }
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

/** The share of hunters that follow a jump: `base` through every living player's `crewFollowingHunters` hooks, in seat order, then halved by Trail Reducer (`TRAIL_REDUCER`); between 0 and 1. */
export function followingHuntersShare(base: number, state: Readonly<GameState>, registry: ModifierRegistry = MODIFIERS): number {
  let share = base;
  for (const holder of state.players) {
    if (!holder.alive) continue;
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.crewFollowingHunters;
      if (hook) share = hook(share, holder, state);
    }
  }
  if (projectDone(state, "TRAIL_REDUCER")) share *= state.config.project.trailReducer.followMultiplier;
  return Math.min(1, Math.max(0, share));
}

/** Runs every onActionFailed hook the player has. Mutates a state the caller already cloned. */
export function actionFailed(next: GameState, player: PlayerState, apSpent: number, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onActionFailed?.(next, player, apSpent);
}

/** The AP a player gains at this cycle change's refill: `apGain`, then each modifier's onApRefill. Mutates `next.rng`. */
export function apRefill(next: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): number {
  let gain = apGain(next, player, registry);
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.onApRefill;
    if (hook) gain = hook(gain, next, player);
  }
  return gain;
}

/** Base movement rules folded through the player's modifiers, in list order, plus the heavy-item penalty. */
export function movementRules(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): MovementRules {
  let rules = { ...state.config.movement, mpCap: player.maxMp };
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.movement;
    if (hook) rules = hook(rules, player, state);
  }
  if (player.energizeUntil !== undefined && state.cycle < player.energizeUntil) {
    rules.mpPerConversion += state.config.botany.fruits.buffs.energize.extraMpPerConversion;
  }
  if (gravityBroken(state)) rules.mpPerConversion = Math.max(0, rules.mpPerConversion - state.config.gravitySimulator.brokenMpPenalty);
  if (carriesHeavy(state, player)) rules.mpPerMove += fold("heavyMpPenalty", state.config.heavy.mpPenalty, state, player, registry);
  return rules;
}

/** AP gained at the start of a cycle: the base gain folded through the player's modifiers. */
export const apGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("apPerCycle", state.config.apPerCycle, state, player, registry);

/** Whether any Gravity Simulator is broken (owner, 2026-11-08): it costs everyone MP, see `mpGain` and `movementRules`. */
export const gravityBroken = (state: Readonly<GameState>): boolean =>
  Object.values(state.equipment).some((list) => list.some((e) => e.type === "GRAVITY_SIMULATOR" && e.broken));

/** MP gained at the start of a cycle: the base gain folded through the player's modifiers, less the broken-gravity penalty; never below 0. */
export const mpGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  Math.max(0, fold("mpPerCycle", state.config.mpPerCycle, state, player, registry) - (gravityBroken(state) ? state.config.gravitySimulator.brokenMpPenalty : 0));

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
  player: Readonly<Pick<PlayerState, "ap" | "mp" >>,
): { ap: number; mpAfter: number } | null {
  if (player.mp >= rules.mpPerMove) return { ap: 0, mpAfter: player.mp - rules.mpPerMove };
  if (player.ap < rules.apPerConversion) return null;
  const converted = Math.min(rules.mpCap, player.mp + rules.mpPerConversion);
  if (converted < rules.mpPerMove) return null;
  return { ap: rules.apPerConversion, mpAfter: converted - rules.mpPerMove };
}

/** Spores the Mush faction may extract per day: the configured count (less ANTISPORE_GAZ) folded through the extracting player's modifiers. */
export const sporesPerDay = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) => {
  const reduction = (state.research.ANTISPORE_GAZ ?? 0) >= RESEARCH_COMPLETE ? state.config.spores.antisporeReduction : 0;
  return Math.max(0, fold("sporesPerDay", state.config.spores.perDay - reduction, state, player, registry));
};

/** Extra HP heal and bandage restore once the Ultra-healing ointment research completes (owner, 2026-11-14). */
const ointmentHealBonus = (state: Readonly<GameState>): number =>
  (state.research.HEALING_OINTMANT ?? 0) >= RESEARCH_COMPLETE ? state.config.heal.effect.ointmentBonusHp : 0;

/** HP a heal restores: the configured amount folded through the healer's modifiers, plus HEALING_OINTMANT if complete. */
export const healAmount = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("healAmount", state.config.heal.effect.hp, state, player, registry) + ointmentHealBonus(state);

/** HP a bandage restores (owner, 2026-11-07, #397): the configured amount folded through the same `healAmount` hook, plus HEALING_OINTMANT if complete. */
export const bandageHealAmount = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("healAmount", state.config.bandage.effect.hp, state, player, registry) + ointmentHealBonus(state);

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

/** Engineer points a player gains at the start of a day: nothing by default, plus what the engineer skill grants. */
export const engineerPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("engineerPointsPerDay", 0, state, player, registry);

/** PILGRED points a player gains at the start of a day: nothing by default, plus what the physicist skill grants. */
export const pilgredPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("pilgredPointsPerDay", 0, state, player, registry);

/** Shoot points a player gains at the start of a day: nothing by default, plus what the gunman skill grants. */
export const shootPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("shootPointsPerDay", 0, state, player, registry);

/** Most Computer points a player can hold: the configured cap folded through their modifiers (for Polymath). */
export const computerPointsCap = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("computerPointsCap", state.config.computer.capPoints, state, player, registry);

/** The per-miss multiplier of a failure streak (turret shots, astro scans): `base` folded through the player's modifiers (for Persistent). */
export const failureStreakMultiplier = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("failureStreakMultiplier", base, state, player, registry);

/** Sectors one remote planet analysis reveals: one, plus what the astrophysician skill brings and Quantum Sensors. */
export const analysisSectors = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("analysisSectors", 1, state, player, registry) +
  (projectDone(state, "QUANTUM_SENSORS") ? state.config.project.quantumSensors.extraSectors : 0);

/** The chance a hunter wave comes smaller: nothing by default, plus what each living holder of Space Tactics brings (they don't stack). */
export function waveShrinkChance(state: Readonly<GameState>, registry: ModifierRegistry = MODIFIERS): number {
  let chance = 0;
  for (const holder of state.players) {
    if (!holder.alive) continue;
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.crewWaveShrinkChance;
      if (hook) chance = hook(chance, holder, state);
    }
  }
  return Math.min(1, Math.max(0, chance));
}

/** Garden points a player gains at the start of a day: nothing by default, plus what the botanist skill grants. */
export const gardenPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("gardenPointsPerDay", 0, state, player, registry);

/** Cook points a player gains at the start of a day: nothing by default, plus what skills grant. */
export const cookPointsGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("cookPointsPerDay", 0, state, player, registry);

/** HP a punch removes: the rolled base damage folded through the puncher's modifiers. */
export const punchDamage = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("punchDamage", base, state, player, registry);

/**
 * Max AP: `base` folded through the player's modifiers, then the Noise Reducer's bonus once that project is done. The bonus
 * comes after the fold so Lethargy doubles only the base (owner, 2026-11-01: 12 + 2 = 14, or 24 + 2 = 26 with Lethargy).
 */
export const maxAp = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxAp", base, state, player, registry) + (projectDone(state, "NOISE_REDUCER") ? state.config.project.noiseReducer.maxAp : 0);

/** Max MP */
export const maxMp = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxMp", base, state, player, registry);

/** Max Morale */
export const maxMorale = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxMorale", base, state, player, registry);

/** HP damage the player is about to take (Space Rabies adds 1); `damage` (death.ts) applies it to every loss. */
export const damageTaken = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("damageTaken", base, state, player, registry);

/** Max Hp */
export const maxHp = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxHp", base, state, player, registry);

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

/**
 * A Mush's meal has no effects (consume.ts), so only their diseases' onConsume hooks run, and each of those must keep
 * to special logs (`canHaveSpecialLogs`), never stats. The Mush's skills' onConsume hooks do not run.
 */
export function consumedByMush(next: GameState, player: PlayerState, item: ItemState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of mushDiseaseIds(player)) registry[id]?.onConsume?.(next, player, item);
}

/** Runs every onConsume hook of the player's modifiers. Mutates a state the caller already cloned. */
export function consumed(next: GameState, player: PlayerState, item: ItemState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onConsume?.(next, player, item);
}

/** Runs every onHeal hook of the healer's modifiers. Mutates a state the caller already cloned. */
export function healed(next: GameState, healer: PlayerState, patient: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(healer)) registry[id]?.onHeal?.(next, healer, patient);
}

/** Runs the picked skill's onPick hook. Mutates a state the caller already cloned. */
export function skillPicked(next: GameState, player: PlayerState, skill: string, registry: ModifierRegistry = MODIFIERS): void {
  registry[skill]?.onPick?.(next, player);
}

/** Runs every onTitleGained hook of the player's modifiers. Mutates a state the caller already cloned. */
export function titleGained(next: GameState, player: PlayerState, title: TitleId, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of eventIds(player)) registry[id]?.onTitleGained?.(next, player, title);
}

/** Runs every onCycle hook of each living player, in seat order. Mutates a state the caller already cloned. */
export function cycleChanged(next: GameState, registry: ModifierRegistry = MODIFIERS): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    for (const id of eventIds(player)) registry[id]?.onCycle?.(next, player);
  }
}

/** Runs every onContaminate hook of the player's modifiers. Mutates a state the caller already cloned. */
export function contaminated(next: GameState, player: PlayerState, amount: number, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of eventIds(player)) registry[id]?.onContaminate?.(next, player, amount);
}

export function shipMoved(next: GameState, registry: ModifierRegistry = MODIFIERS): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    for (const id of eventIds(player)) registry[id]?.onShipMovement?.(next, player);
  }
}
/** Runs every onEnterRoom hook of the player's modifiers, once they are in the new room. Mutates a state the caller already cloned. */
export function enteredRoom(next: GameState, player: PlayerState, tools: EnterRoomTools = NO_TOOLS, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of eventIds(player)) registry[id]?.onEnterRoom?.(next, player, tools);
}

/**
 * A player has just moved into a room: each modifier of theirs and of everyone already there gets its onEncounter
 * hook, carrier first, with the other as the one it may reach (a cold spreads both ways). A Mush's diseases still spread.
 */
export function enterRoom(state: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const other of roomHolders(state, player.room)) {
    if (other.id === player.id) continue;
    for (const id of eventIds(other)) registry[id]?.onEncounter?.(state, other, player);
    for (const id of eventIds(player)) registry[id]?.onEncounter?.(state, player, other);
  }
}

/** Chance a patrol ship's takeoff or landing is clean (patrol.ts): the configured chance folded through the pilot's modifiers. */
export const cleanManoeuvreChance = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("cleanManoeuvreChance", state.config.patrol.cleanChance, state, player, registry);
