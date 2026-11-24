// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), put a file in
// modifiers/ exporting a Modifier, register it below, and put its id in the
// player's `modifiers`. A skill is a modifier too: its id goes in the player's
// `skills` instead. A new numeric hook is one line in `FoldHooks` plus a one-line
// accessor below; `fold` does the looping.

import { spreadAtCycle, spreadOnEncounter } from "./diseases.ts";
import { isBrokenIn } from "./equipment.ts";
import { activeScooter, carriesHeavy, isWorking } from "./items.ts";
import { gravityBroken, noGravity } from "./gravity.ts";
import { projectDone } from "./projects.ts";
import { RESEARCH_COMPLETE } from "./research.ts";
import { hasSkill, skillsOf } from "./skills.ts";
import { antic_perfume } from "./modifiers/antic_perfume.ts";
import { astrophysician } from "./modifiers/astrophysician.ts";
import { bodyguard } from "./modifiers/bodyguard.ts";
import { botanic } from "./modifiers/botanic.ts";
import { caffeinomaniac } from "./modifiers/caffeinomaniac.ts";
import { computer } from "./modifiers/computer.ts";
import { cook } from "./modifiers/cook.ts";
import { creative } from "./modifiers/creative.ts";
import { designer } from "./modifiers/designer.ts";
import { devoted } from "./modifiers/devoted.ts";
import { engineer } from "./modifiers/engineer.ts";
import { escape } from "./modifiers/escape.ts";
import { expert } from "./modifiers/expert.ts";
import { first_aid } from "./modifiers/first_aid.ts";
import { frugivore } from "./modifiers/frugivore.ts";
import { green_thumb } from "./modifiers/green_thumb.ts";
import { gunman } from "./modifiers/gunman.ts";
import { gunner } from "./modifiers/gunner.ts";
import { infantryman } from "./modifiers/infantryman.ts";
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
import { antisocial } from "./modifiers/antisocial.ts";
import { germaphobe } from "./modifiers/germaphobe.ts";
import { chronic_vertigo } from "./modifiers/chronic_vertigo.ts";
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
import { acid_reflux_disease } from "./modifiers/acid_reflux_disease.ts";
import { tapeworm_disease } from "./modifiers/tapeworm_disease.ts";
import { pink_eye_disease } from "./modifiers/pink_eye_disease.ts";
import { gastroenteritis_disease } from "./modifiers/gastroenteritis_disease.ts";
import { sinus_storm_disease } from "./modifiers/sinus_storm_disease.ts";
import { migraine_disease } from "./modifiers/migraine_disease.ts";
import { slight_nausea_disease } from "./modifiers/slight_nausea_disease.ts";
import { food_poisoning_disease } from "./modifiers/food_poisoning_disease.ts";
import { vitamin_deficiency_disease } from "./modifiers/vitamin_deficiency_disease.ts";
import { flu_disease } from "./modifiers/flu_disease.ts";
import { rubella_disease } from "./modifiers/rubella_disease.ts";
import { syphilis_disease } from "./modifiers/syphilis_disease.ts";
import { sepsis_disease } from "./modifiers/sepsis_disease.ts";
import { bad_luck_curse } from "./modifiers/bad_luck_curse.ts";
import { isCurseId } from "./curses.ts";
import { broken_nose_injury } from "./modifiers/broken_nose_injury.ts";
import { broken_shoulder_injury, bruised_shoulder_injury, shattered_shoulder_injury } from "./modifiers/shoulder_injuries.ts";
import { mashed_foot_injury } from "./modifiers/mashed_foot_injury.ts";
import { torn_tongue_injury } from "./modifiers/torn_tongue_injury.ts";
import { open_air_brain_injury } from "./modifiers/open_air_brain_injury.ts";
import { head_trauma_injury } from "./modifiers/head_trauma_injury.ts";
import { critical_haemorrhage_injury, haemorrhage_injury } from "./modifiers/haemorrhage_injury.ts";
import { busted_arm_joint_injury } from "./modifiers/busted_arm_joint_injury.ts";
import { punctured_lung_injury } from "./modifiers/punctured_lung_injury.ts";
import { cat_allergy_disease, catCarriedIn } from "./modifiers/cat_allergy_disease.ts";
import { black_bite_disease } from "./modifiers/black_bite_disease.ts";
import { quincks_oedema_disease } from "./modifiers/quincks_oedema_disease.ts";
import { burned_arm_injury, burnt_hand_injury } from "./modifiers/burnt_hand_injury.ts";
import { third_degree_50_injury, third_degree_90_injury } from "./modifiers/third_degree_burn_injury.ts";
import { lodged_bullet_injury } from "./modifiers/lodged_bullet_injury.ts";
import { broken_foot_injury } from "./modifiers/broken_foot_injury.ts";
import { broken_leg_injury } from "./modifiers/broken_leg_injury.ts";
import { unusable_legs_injury } from "./modifiers/unusable_legs_injury.ts";
import { liver_disfunction_injury } from "./modifiers/liver_disfunction_injury.ts";
import { broken_ribs_injury } from "./modifiers/broken_ribs_injury.ts";
import { broken_finger_injury, missing_finger_injury } from "./modifiers/finger_injury.ts";
import { shattered_arm_injury, shredded_hand_injury } from "./modifiers/hand_arm_injuries.ts";
import { missing_teeth_injury } from "./modifiers/missing_teeth_injury.ts";
import { stiff_neck_injury } from "./modifiers/stiff_neck_injury.ts";
import { damaged_ears_injury } from "./modifiers/damaged_ears_injury.ts";
import { destroyed_ears_injury } from "./modifiers/destroyed_ears_injury.ts";
import type { ActionCost } from "./actions.ts";
import type { ActionTag } from "./actions/action.ts";
import type { DeepReadonly, WeaponStats } from "./types/config.ts";
import type { Action, GameState, ItemState, MovementRules, PlayerState, RoomId } from "./types.ts";

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
  | "mealAp"
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
  | "neronProgress"
  | "rebelGain"
  | "pilgredPointsPerDay"
  | "gardenPointsPerDay"
  | "cookPointsPerDay"
  | "heavyMpPenalty"
  | "cleanManoeuvreChance"
  | "maxAp"
  | "maxMp"
  | "maxMorale"
  | "maxHp"
  | "damageTaken"
  | "missionAp",
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
 * What the hooks of someone other than the actor see (the room's `roomActionCost`, the target's `targetedSuccessRate`):
 * the actor is a player, or null when a hostile NPC acts (hostiles.ts, owner 2026-11-23: Pacifist, Bodyguard, Elusive
 * and the like apply to them too). A hostile's actions share a player action's shape (`{ type: "punch", target }`).
 */
export interface OthersContext extends Omit<CostContext, "actor"> {
  actor: Readonly<PlayerState> | null;
  /** The room the action is done in: the actor's. */
  room: RoomId;
  holder: Readonly<PlayerState>;
}

/** What is being weighted, for weapon outcome hooks. */
export interface WeaponOutcomeContext {
  state: Readonly<GameState>;
  player: Readonly<PlayerState>;
  weapon: DeepReadonly<WeaponStats>;
  kind: "hit" | "miss";
  critical: boolean;
  fumble: boolean;
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
  targetedSuccessRate?: (successRate: number, ctx: OthersContext) => number;
  /** Adjusts what one of the holder's own actions injury rates. Must be pure. */
  actionInjuryRate?: (cost: number, ctx: CostContext) => number;
  /** Adjusts what one of the holder's own actions dirtiness chance. Must be pure. */
  actionDirtRate?: (cost: number, ctx: CostContext) => number;
  /** Adjusts the weight of a weapon hit or miss outcome entry. Must be pure. */
  weaponOutcomeWeight?: (weight: number, ctx: WeaponOutcomeContext) => number;
  /**
   * Adjusts what anyone's action costs in the room where the holder is, the holder's own included (Pacifist).
   * Read when a price is asked for, so nothing is stored when people come and go. Holders stack. Must be pure.
   * Only for a holder the actor can see, since the price itself tells them the effect is there.
   */
  roomActionCost?: (cost: ActionCost, ctx: OthersContext) => ActionCost;
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
   * Runs after each of the player's actions has resolved (success or failure, its dirt and injury rolls included).
   * Mutates a state the caller already cloned. The player may already be dead.
   */
  onActionDone?: (next: GameState, player: PlayerState) => void;
  /** Runs when the player becomes dirty (not when they already were). Mutates a state the caller already cloned. */
  onDirty?: (next: GameState, player: PlayerState) => void;
  /**
   * Adjusts the AP a player is about to gain at a cycle change's refill (`gain`, already folded through apPerCycle).
   * Unlike the folds it runs once, at the refill, so it may roll (`next.rng`). Never reaches a Mush's diseases.
   */
  onApRefill?: (gain: number, next: GameState, player: PlayerState) => number;
  /**
   * At a cycle change's refill spent lying down: whether this modifier spoils the rest, so the bed adds no AP (the bed's
   * +1 and Lethargy's bonus). May roll (`next.rng`). However many say so, the bonus is lost once (`apRefill`). Reaches
   * a Mush's diseases too, so a disease hook guards itself with `diseaseAffects`.
   */
  spoilsRest?: (next: GameState, player: PlayerState) => boolean;
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
  /** Damaged or Destroyed Ears: other players' chat posted meanwhile never reaches the holder (`pushChat`, `heardBy`). */
  deaf?: boolean;
  /** Torn Tongue, Punctured Lung: no `talking`-tagged action (Action.check), no chat post (`sendChat`), no new private channel (`createChannel`). */
  mute?: boolean;
  /** Missing Teeth: rewrites the text of every chat message the holder posts (`sendChat`). Must be pure. */
  speech?: (text: string) => string;
  /** Bad Luck: the Metal Plate and Tremor incidents always deal the top of their damage range (`incidentDamage`). */
  worstDamage?: boolean;
  /** Broken Shoulder: can't take a heavy item (TransferAction), and drops any held when it starts. */
  noHeavy?: boolean;
  /** Runs whenever the ship moves */
  onShipMovement?: (next: GameState, player: PlayerState) => void;
  /** Runs after the holder moves into a room, whoever is there (a move action). Mutates a state the caller already cloned. */
  onEnterRoom?: (next: GameState, player: PlayerState, tools: EnterRoomTools) => void;
  /** Runs when a player enters a room with another player */
  onEncounter?: (next: GameState, player: PlayerState, other: PlayerState) => void;
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
  devoted,
  engineer,
  escape,
  expert,
  first_aid,
  frugivore,
  green_thumb,
  gunman,
  gunner,
  infantryman,
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
  antisocial,
  germaphobe,
  chronic_vertigo,
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
  acid_reflux_disease,
  tapeworm_disease,
  pink_eye_disease,
  sinus_storm_disease,
  migraine_disease,
  slight_nausea_disease,
  food_poisoning_disease,
  vitamin_deficiency_disease,
  flu_disease,
  rubella_disease,
  syphilis_disease,
  sepsis_disease,
  // Curses (curses.ts)
  bad_luck_curse,
  // Injuries
  broken_nose_injury,
  damaged_ears_injury,
  destroyed_ears_injury,
  torn_tongue_injury,
  open_air_brain_injury,
  head_trauma_injury,
  haemorrhage_injury,
  critical_haemorrhage_injury,
  busted_arm_joint_injury,
  punctured_lung_injury,
  bruised_shoulder_injury,
  mashed_foot_injury,
  broken_shoulder_injury,
  shattered_shoulder_injury,
  burnt_hand_injury,
  burned_arm_injury,
  third_degree_50_injury,
  third_degree_90_injury,
  lodged_bullet_injury,
  broken_foot_injury,
  broken_leg_injury,
  unusable_legs_injury,
  liver_disfunction_injury,
  broken_ribs_injury,
  broken_finger_injury,
  missing_finger_injury,
  shredded_hand_injury,
  shattered_arm_injury,
  missing_teeth_injury,
  stiff_neck_injury,
  quincks_oedema_disease,
  black_bite_disease,
  cat_allergy_disease,
};

/**
 * The ids every numeric (fold) and cost hook runs over: the player's skills (book slot last), then their other
 * modifiers. A Mush's diseases are left out, so they never change a Mush's numbers (diseases.ts).
 */
export function modifierIds(player: Readonly<PlayerState>): string[] {
  const ids = [...skillsOf(player), ...player.modifiers];
  return player.role === "mush" ? ids.filter((id) => !isDiseaseId(id)) : ids;
}

// Curses count as diseases here: like a disease, a curse does nothing to a Mush (owner, 2026-11-22).
const isDiseaseId = (id: string): boolean => id.endsWith("_disease") || isCurseId(id);

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

/**
 * Folds `base` through the named hook of each of the player's modifiers, in list order. With `trace`, it also records
 * each modifier that changed the value and by how much (its real change at that step, so a clamped step shows less).
 */
function fold(
  hook: keyof FoldHooks,
  base: number,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry,
  trace?: CapSource[],
): number {
  let value = base;
  for (const id of modifierIds(player)) {
    const fn = registry[id]?.[hook];
    if (!fn) continue;
    const before = value;
    value = fn(value, player, state);
    if (trace && value !== before) trace.push({ kind: "modifier", id, delta: value - before });
  }
  return value;
}

/**
 * `cost` through the `roomActionCost` hooks of everyone living in `ctx.room`, in seat order (Pacifist, Bodyguard, Black
 * Bite). Players' actions (`actionCost`) and hostile NPCs' (hostiles/hostile.ts) both go through it.
 */
export function roomActionCost(cost: ActionCost, ctx: Omit<OthersContext, "holder">, registry: ModifierRegistry = MODIFIERS): ActionCost {
  let result = { ...cost };
  for (const holder of roomHolders(ctx.state, ctx.room)) {
    for (const id of modifierIds(holder)) {
      const hook = registry[id]?.roomActionCost;
      if (hook) result = hook(result, { ...ctx, holder });
    }
  }
  return result;
}

/** `chance` through the `targetedSuccessRate` hooks of the player the action is aimed at, if any (Elusive). Players' and hostile NPCs' actions both go through it. */
export function targetedSuccessRate(chance: number, ctx: Omit<OthersContext, "holder">, registry: ModifierRegistry = MODIFIERS): number {
  const aimed = (ctx.action as { target?: unknown }).target;
  const holder = typeof aimed === "string" ? ctx.state.players.find((o) => o.id === aimed) : undefined;
  if (!holder) return chance;
  let result = chance;
  for (const id of modifierIds(holder)) {
    const hook = registry[id]?.targetedSuccessRate;
    if (hook) result = hook(result, { ...ctx, holder });
  }
  return result;
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
  cost = roomActionCost(cost, { ...ctx, room: ctx.actor.room }, registry);
  if (ctx.action.type === "scan_planet" && projectDone(ctx.state, "CHIPSET_ACCELERATION")) {
    cost.ap -= ctx.state.config.project.chipsetAcceleration.scanApDiscount;
  }
  // Spatial wave radar (owner, 2026-11-16): connection to Sol attempts and diplomacy trades cost 1 AP less.
  if ((ctx.action.type === "contact_sol" || ctx.action.type === "close_deal") && projectDone(ctx.state, "RADAR_TRANS_VOID")) {
    cost.ap -= ctx.state.config.project.radarTransVoid.apDiscount;
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
  chance = targetedSuccessRate(chance, { ...ctx, room: ctx.actor.room }, registry);
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
  // Floor heating (owner, 2026-11-15): halves the random injury chance on every action (50% reduction).
  if (projectDone(ctx.state, "FLOOR_HEATING")) {
    chance *= ctx.state.config.project.floorHeating.injuryFactor;
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

/** Weight of one weapon outcome entry once the attacker's modifiers have had their say; never below 0. */
export function weaponOutcomeWeight(
  base: number,
  ctx: WeaponOutcomeContext,
  registry: ModifierRegistry = MODIFIERS,
): number {
  let weight = base;
  for (const id of modifierIds(ctx.player)) {
    const hook = registry[id]?.weaponOutcomeWeight;
    if (hook) weight = hook(weight, ctx);
  }
  return Math.max(0, weight);
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

/** Runs every onActionDone hook the player has. Mutates a state the caller already cloned. */
export function actionDone(next: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onActionDone?.(next, player);
}

/** Runs every onDirty hook the player has, once they have just become dirty. Mutates a state the caller already cloned. */
export function becameDirty(next: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onDirty?.(next, player);
}

/** Runs every onActionFailed hook the player has. Mutates a state the caller already cloned. */
export function actionFailed(next: GameState, player: PlayerState, apSpent: number, registry: ModifierRegistry = MODIFIERS): void {
  for (const id of modifierIds(player)) registry[id]?.onActionFailed?.(next, player, apSpent);
}

/** The AP a player gains at this cycle change's refill: `apGain`, each modifier's onApRefill, then a spoiled rest. Mutates `next.rng`. */
export function apRefill(next: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): number {
  let gain = apGain(next, player, registry);
  for (const id of modifierIds(player)) {
    const hook = registry[id]?.onApRefill;
    if (hook) gain = hook(gain, next, player);
  }
  // Rejuvenation, Migraine, Rubella: the first that spoils the rest takes the bed's bonus, once (owner, 2026-11-18).
  if (player.alive && player.modifiers.includes("lying_down") && modifierIds(player).some((id) => registry[id]?.spoilsRest?.(next, player))) {
    gain -= bedBonus(next, player, registry);
  }
  return gain;
}

/** What lying down adds to the player's AP refill now: the bed's +1 and Lethargy's bonus. */
export function bedBonus(state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS): number {
  const awake = { ...player, modifiers: player.modifiers.filter((m) => m !== "lying_down"), lyingSince: undefined };
  return Math.max(0, apGain(state, player, registry) - apGain(state, awake, registry));
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
  if (!hasSkill(player, "sprint") && activeScooter(state, player)) {
    rules.mpPerConversion += state.config.scooter.extraMpPerConversion;
  }
  if (player.energizeUntil !== undefined && state.cycle < player.energizeUntil) {
    rules.mpPerConversion += state.config.botany.fruits.buffs.energize.extraMpPerConversion;
  }
  // Broken or restarting (gravity.ts): conversions give less, and a heavy item weighs nothing (owner, 2026-11-22, eMush's Burdened).
  if (noGravity(state)) rules.mpPerConversion = Math.max(0, rules.mpPerConversion - state.config.gravitySimulator.brokenMpPenalty);
  else if (carriesHeavy(state, player)) rules.mpPerMove += fold("heavyMpPenalty", state.config.heavy.mpPenalty, state, player, registry);
  return rules;
}

/** AP gained at the start of a cycle: the base gain folded through the player's modifiers. */
export const apGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("apPerCycle", state.config.apPerCycle, state, player, registry);

/**
 * MP gained at the start of a cycle: the base gain folded through the player's modifiers, less the broken-gravity penalty; never below 0.
 * Only a broken simulator: a restarting one is back by then (gravity.ts).
 */
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

/** AP a human gains from eating food (satiety above 0), before the AP cap: the meal's AP folded through the player's modifiers. */
export const mealApGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, ap: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("mealAp", ap, state, player, registry);

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

/** Sectors one remote planet analysis reveals: one, plus what the astrophysician skill brings, Quantum Sensors (while the Planet Scanner is unbroken), and BIOS Astronavigation CPU priority. */
export const analysisSectors = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("analysisSectors", 1, state, player, registry) +
  (projectDone(state, "QUANTUM_SENSORS") && !isBrokenIn(state, "MOTOR_ROOM", "MOTOR_ROOM:PLANET_SCANNER")
    ? state.config.project.quantumSensors.extraSectors
    : 0) +
  (state.bios.cpu_priority === "astronavigation" ? state.config.bios.astroExtraSectors : 0);

/** NERON update progress one update action adds: `base` (`config.comms.neron.progressPercent`) folded (Migraine halves it). */
export const neronProgress = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("neronProgress", base, state, player, registry);

/** Progress one rebel decode adds: the rolled `base` (comms.ts, `rollRebelGain`) folded (Migraine halves it). */
export const rebelGain = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("rebelGain", base, state, player, registry);

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
  fold("maxAp", base, state, player, registry) + noiseReducerBonus(state);

const noiseReducerBonus = (state: Readonly<GameState>): number => (projectDone(state, "NOISE_REDUCER") ? state.config.project.noiseReducer.maxAp : 0);

/** AP a crewmate gains when given a Commander mission: the configured base folded through the recipient's modifiers (for Devotion). */
export const missionAp = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  fold("missionAp", state.config.commanderMission.apGranted, state, player, registry);

/** Max MP */
export const maxMp = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxMp", base, state, player, registry);

/** Max Morale */
export const maxMorale = (state: Readonly<GameState>, player: Readonly<PlayerState>, base: number, registry: ModifierRegistry = MODIFIERS) =>
  fold("maxMorale", base, state, player, registry);

/** One thing that changes a stat's cap: a modifier (skill, disease, injury, …) or a finished project, and its real change. */
export interface CapSource {
  kind: "modifier" | "project";
  id: string;
  delta: number;
}

/** A stat's cap and why: the configured `base`, each source that changed it in the order applied, and the resulting `max`. */
export interface CapBreakdown {
  base: number;
  max: number;
  sources: CapSource[];
}

export type CapStat = "ap" | "mp" | "hp" | "morale";

/**
 * Each cap the way `updateMaxValues` (adjustStats.ts) computes it, with the steps that got it there. `max` equals the
 * matching accessor (`maxAp`, `maxMp`, `maxHp`, `maxMorale`) on the same base; a Mush's diseases are left out, as in
 * every fold. Derived, never stored.
 */
export function capBreakdown(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): Record<CapStat, CapBreakdown> {
  const traced = (hook: "maxAp" | "maxMp" | "maxHp" | "maxMorale", base: number): CapBreakdown => {
    const sources: CapSource[] = [];
    return { base, max: fold(hook, base, state, player, registry, sources), sources };
  };
  const ap = traced("maxAp", state.config.maxAp);
  const bonus = noiseReducerBonus(state);
  if (bonus !== 0) {
    ap.max += bonus;
    ap.sources.push({ kind: "project", id: "NOISE_REDUCER", delta: bonus });
  }
  return {
    ap,
    mp: traced("maxMp", state.config.movement.mpCap),
    hp: traced("maxHp", state.config.maxHp),
    morale: traced("maxMorale", state.config.maxMorale),
  };
}

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

/** Whether the player can't speak right now (a `mute` modifier: Torn Tongue, Punctured Lung): no `talking` action, no chat post. */
export function isMute(player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS): boolean {
  return modifierIds(player).some((id) => registry[id]?.mute === true);
}

/** A chat message's text as the player actually says it: folded through every `speech` modifier (Missing Teeth). */
export function spokenText(player: Readonly<PlayerState>, text: string, registry: ModifierRegistry = MODIFIERS): string {
  return modifierIds(player).reduce((said, id) => registry[id]?.speech?.(said) ?? said, text);
}

/** Whether the player can't carry heavy items right now (a `noHeavy` modifier: Broken Shoulder). */
export function cantCarryHeavy(player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS): boolean {
  return modifierIds(player).some((id) => registry[id]?.noHeavy === true);
}

/** Whether incident damage always rolls its maximum for this player (a `worstDamage` modifier: Bad Luck). */
export function takesWorstDamage(player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS): boolean {
  return modifierIds(player).some((id) => registry[id]?.worstDamage === true);
}

/** Whether the player can't hear other players' chat right now (a `deaf` modifier: Damaged or Destroyed Ears). */
export function isDeaf(player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS): boolean {
  return modifierIds(player).some((id) => registry[id]?.deaf === true);
}

/** Spreads each living player's diseases in their room, then runs their onCycle hooks, in seat order. Mutates a state the caller already cloned. */
export function cycleChanged(next: GameState, registry: ModifierRegistry = MODIFIERS): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    spreadAtCycle(next, player);
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
  // Carrying Schrödinger in sets off any Cat Allergy already in the room (owner, 2026-11-21).
  catCarriedIn(next, player);
}

/**
 * A player has just moved into a room: diseases spread both ways with each living player already there
 * (`spreadOnEncounter`), then each modifier of theirs and of the other's gets its onEncounter hook, carrier first,
 * with the other as the one it may reach. A Mush's diseases still spread.
 */
export function enterRoom(state: GameState, player: PlayerState, registry: ModifierRegistry = MODIFIERS): void {
  for (const other of roomHolders(state, player.room)) {
    if (other.id === player.id) continue;
    spreadOnEncounter(state, other, player);
    for (const id of eventIds(other)) registry[id]?.onEncounter?.(state, other, player);
    for (const id of eventIds(player)) registry[id]?.onEncounter?.(state, player, other);
  }
}

/** Chance a patrol ship's takeoff or landing is clean (patrol.ts): 1 once XXL bay doors is complete, else the configured chance folded through the pilot's modifiers. */
export const cleanManoeuvreChance = (state: Readonly<GameState>, player: Readonly<PlayerState>, registry: ModifierRegistry = MODIFIERS) =>
  projectDone(state, "BAY_DOOR_XXL") ? 1 : fold("cleanManoeuvreChance", state.config.patrol.cleanChance, state, player, registry);
