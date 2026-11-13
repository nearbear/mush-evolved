import { AcceptAccommodationAction, AccommodateAction, StopAccommodationAction } from "./actions/accommodate.ts";
import { BondAction } from "./actions/bond.ts";
import { BuildAction } from "./actions/build.ts";
import { ConsumeAction } from "./actions/consume.ts";
import { HideAction } from "./actions/hide.ts";
import { SearchAction } from "./actions/search.ts";
import { SnoopAction } from "./actions/snoop.ts";
import { CheckSporesAction } from "./actions/check_spores.ts";
import { DispenseDrugAction } from "./actions/dispense_drug.ts";
import { CookAction } from "./actions/cook.ts";
import { ExpressCookAction } from "./actions/express_cook.ts";
import { DismantleAction } from "./actions/dismantle.ts";
import { AccessAction } from "./actions/access.ts";
import type { ActionCost, ActionTag, ActionVisibility } from "./actions/action.ts";
import { DispenseAction } from "./actions/dispense.ts";
import { ExamineAction } from "./actions/examine.ts";
import { ConsumeSporeAction } from "./actions/consume_spore.ts";
import { TubeTransferAction } from "./actions/tube_transfer.ts";
import { ExtractSporeAction } from "./actions/extract_spore.ts";
import { MoveAction } from "./actions/move.ts";
import { CancelPlanAction, ClaimSlotAction, MarkDoneAction, WithdrawSlotAction } from "./actions/plan_slots.ts";
import { SummonAction } from "./actions/summon.ts";
import { ResearchAction } from "./actions/research.ts";
import { SpoilResearchAction } from "./actions/spoil_research.ts";
import { ContaminateAction } from "./actions/contaminate.ts";
import { ProjectAction } from "./actions/project.ts";
import { RepairPilgredAction } from "./actions/repair_pilgred.ts";
import { ReturnToSolAction } from "./actions/return_to_sol.ts";
import { ContactSolAction } from "./actions/contact_sol.ts";
import { DecodeRebelAction } from "./actions/decode_rebel.ts";
import { ContactXylophAction } from "./actions/contact_xyloph.ts";
import { UpdateNeronAction } from "./actions/update_neron.ts";
import { SetBiosAction } from "./actions/set_bios.ts";
import { ScanPlanetAction } from "./actions/scan_planet.ts";
import { WarpToPlanetAction } from "./actions/warp_to_planet.ts";
import { PatrolAttackAction } from "./actions/patrol_attack.ts";
import { TurretAttackAction } from "./actions/turret_attack.ts";
import { RepairHullAction } from "./actions/repair_hull.ts";
import { RepairAction } from "./actions/repair.ts";
import { IgniteAction } from "./actions/ignite.ts";
import { GreenJellyAction } from "./actions/green_jelly.ts";
import { ReinforceAction } from "./actions/reinforce.ts";
import { SabotageAction } from "./actions/sabotage.ts";
import { ExtinguishAction } from "./actions/extinguish.ts";
import { ExtinguishManuallyAction } from "./actions/extinguish_manually.ts";
import { TakeoffAction } from "./actions/takeoff.ts";
import { IcarusTakeoffAction } from "./actions/icarus_takeoff.ts";
import { LandOnPlanetAction } from "./actions/land_on_planet.ts";
import { UTurnAction } from "./actions/u_turn.ts";
import { SabotageExpeditionAction } from "./actions/sabotage_expedition.ts";
import { LandAction } from "./actions/land.ts";
import { CollectScrapAction } from "./actions/collect_scrap.ts";
import { RenovateAction } from "./actions/renovate.ts";
import { OpenCapsuleAction } from "./actions/open_capsule.ts";
import { AnalyzePlanetAction } from "./actions/analyze_planet.ts";
import { DeletePlanetAction } from "./actions/delete_planet.ts";
import { LeaveOrbitAction } from "./actions/leave_orbit.ts";
import { CheckCombustionAction } from "./actions/check_combustion.ts";
import { ReturnOxygenAction } from "./actions/return_oxygen.ts";
import { TakeOxygenAction } from "./actions/take_oxygen.ts";
import { ReturnFuelAction } from "./actions/return_fuel.ts";
import { LoadFuelAction } from "./actions/load_fuel.ts";
import { TakeFuelAction } from "./actions/take_fuel.ts";
import { UnloadFuelAction } from "./actions/unload_fuel.ts";
import { TravelAction } from "./actions/travel.ts";
import { TurnShipAction } from "./actions/turn_ship.ts";
import { ReadyAction } from "./actions/ready.ts";
import { HealAction } from "./actions/heal.ts";
import { VaccinateAction } from "./actions/vaccinate.ts";
import { UseBandageAction } from "./actions/use_bandage.ts";
import { InstallAction } from "./actions/install.ts";
import { UninstallAction } from "./actions/uninstall.ts";
import { JettisonAction } from "./actions/jettison.ts";
import { PickSkillAction } from "./actions/pick_skill.ts";
import { ApprenticeshipAction } from "./actions/apprenticeship.ts";
import { BecomeGeniusAction } from "./actions/become_genius.ts";
import { ReadBookAction } from "./actions/read_book.ts";
import { AnathemaAction } from "./actions/anathema.ts";
import { CoupAction } from "./actions/coup.ts";
import { BoringSpeechAction, FierySpeechAction } from "./actions/speech.ts";
import { PunchAction } from "./actions/punch.ts";
import { InterrogateAction } from "./actions/interrogate.ts";
import { ChitchatAction } from "./actions/chitchat.ts";
import { ComfortAction } from "./actions/comfort.ts";
import { AttackAction } from "./actions/attack.ts";
import { ShareAction } from "./actions/share.ts";
import { GuardAction, StopGuardingAction } from "./actions/guard.ts";
import { GetUpAction, LieDownAction } from "./actions/lie_down.ts";
import { ShowerAction } from "./actions/shower.ts";
import { SpikeAction } from "./actions/spike.ts";
import { FungalCuisineAction } from "./actions/fungal_cuisine.ts";
import { BodyTransferAction } from "./actions/body_transfer.ts";
import { TransferAction } from "./actions/transfer.ts";
import { WaterAction } from "./actions/water.ts";
import { TreatAction } from "./actions/treat.ts";
import { SowAction } from "./actions/sow.ts";
import { SelfDiseaseAction } from "./actions/self_disease.ts";
import { SelfInjuryAction } from "./actions/self_injury.ts";
import type { GameState, PlayerState } from "./types.ts";

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

export type { ActionCost, ActionTag, ActionVisibility };

export interface ActionDef<A extends Action> {
  /** Who learns of it; the same for every candidate of a type. */
  readonly visibility: ActionVisibility;
  /** What kind of action it is, for rules that react to kinds (see `ActionTag`); the same for every candidate of a type. */
  readonly tags: readonly ActionTag[];
  /** `tags` plus those that depend on the action itself (a knife attack is melee). Use this for a given action. */
  tagsFor(state: Readonly<GameState>, action: A): readonly ActionTag[];
  /** Whether it takes time and goes through the queue (queue.ts), or happens at once. */
  readonly timed: boolean;
  /** Whether it goes in the actor's action history (history.ts). */
  readonly recorded: boolean;
  /** Whether it is done in a terminal's window (web TerminalDialog) rather than from the inspect panel. */
  readonly terminal: boolean;
  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): A[];
  /** The action in an untrusted client message, rebuilt with only its own fields, or null if malformed (protocol.ts). */
  parse(raw: Readonly<Record<string, unknown>>): A | null;
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): string | null;
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  /** How far modifiers move the price from the action's own (`Action.adjustment`). */
  adjustment(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  apply(next: GameState, player: PlayerState, action: A): void;
  /** Chance of success, 0 to 1; applyAction rolls it once with the seeded RNG after the cost is paid (skipped at 1). */
  chance(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  /** Cycles until a `cooldown` refusal clears (0 when none applies). */
  cooldownLeft(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  dirtChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  injuryChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  /** Counts the roll toward the player's failure streak at this action type (performAction): a miss adds one, a success clears it. */
  recordOutcome(next: GameState, player: PlayerState, succeeded: boolean): void;
  /** The effect on failure (the cost stays paid). Mutates a state the caller already cloned. */
  fail(next: GameState, player: PlayerState, action: A): void;
}

const REGISTRY = {
  ready: new ReadyAction(),
  move: new MoveAction(),
  take: new TransferAction("take"),
  drop: new TransferAction("drop"),
  dismantle: new DismantleAction(),
  access: new AccessAction(),
  research: new ResearchAction(),
  spoil_research: new SpoilResearchAction(),
  contaminate: new ContaminateAction(),
  project: new ProjectAction(),
  repair_pilgred: new RepairPilgredAction(),
  return_to_sol: new ReturnToSolAction(),
  turn_ship: new TurnShipAction(),
  travel: new TravelAction(),
  leave_orbit: new LeaveOrbitAction(),
  take_fuel: new TakeFuelAction(),
  load_fuel: new LoadFuelAction(),
  unload_fuel: new UnloadFuelAction(),
  return_fuel: new ReturnFuelAction(),
  take_oxygen: new TakeOxygenAction(),
  return_oxygen: new ReturnOxygenAction(),
  check_combustion: new CheckCombustionAction(),
  contact_sol: new ContactSolAction(),
  decode_rebel: new DecodeRebelAction(),
  contact_xyloph: new ContactXylophAction(),
  update_neron: new UpdateNeronAction(),
  set_bios: new SetBiosAction(),
  scan_planet: new ScanPlanetAction(),
  analyze_planet: new AnalyzePlanetAction(),
  delete_planet: new DeletePlanetAction(),
  turret_attack: new TurretAttackAction(),
  patrol_attack: new PatrolAttackAction(),
  repair_hull: new RepairHullAction(),
  repair: new RepairAction(),
  extinguish: new ExtinguishAction(),
  ignite: new IgniteAction(),
  sabotage: new SabotageAction(),
  reinforce: new ReinforceAction(),
  green_jelly: new GreenJellyAction(),
  extinguish_manually: new ExtinguishManuallyAction(),
  takeoff: new TakeoffAction(),
  icarus_takeoff: new IcarusTakeoffAction(),
  land_on_planet: new LandOnPlanetAction(),
  u_turn: new UTurnAction(),
  sabotage_expedition: new SabotageExpeditionAction(),
  land: new LandAction(),
  collect_scrap: new CollectScrapAction(),
  renovate: new RenovateAction(),
  open_capsule: new OpenCapsuleAction(),
  dispense: new DispenseAction(),
  consume: new ConsumeAction(),
  hide: new HideAction(),
  search: new SearchAction(),
  snoop: new SnoopAction(),
  check_spores: new CheckSporesAction(),
  dispense_drug: new DispenseDrugAction(),
  cook: new CookAction(),
  express_cook: new ExpressCookAction(),
  water: new WaterAction(),
  treat: new TreatAction(),
  sow: new SowAction(),
  build: new BuildAction(),
  jettison: new JettisonAction(),
  install: new InstallAction(),
  uninstall: new UninstallAction(),
  examine: new ExamineAction(),
  bond: new BondAction(),
  dtt: new ShareAction("dtt"),
  stt: new ShareAction("stt"),
  extract_spore: new ExtractSporeAction(),
  consume_spore: new ConsumeSporeAction(),
  tube_transfer: new TubeTransferAction(),
  spike: new SpikeAction(),
  fungal_cuisine: new FungalCuisineAction(),
  body_transfer: new BodyTransferAction(),
  lie_down: new LieDownAction(),
  get_up: new GetUpAction(),
  guard: new GuardAction(),
  stop_guarding: new StopGuardingAction(),
  accommodate: new AccommodateAction(),
  accept_accommodation: new AcceptAccommodationAction(),
  stop_accommodation: new StopAccommodationAction(),
  shower: new ShowerAction(),
  heal: new HealAction(),
  vaccinate: new VaccinateAction(),
  use_bandage: new UseBandageAction(),
  punch: new PunchAction(),
  interrogate: new InterrogateAction(),
  chitchat: new ChitchatAction(),
  comfort: new ComfortAction(),
  anathema: new AnathemaAction(),
  coup: new CoupAction(),
  fiery_speech: new FierySpeechAction(),
  boring_speech: new BoringSpeechAction(),
  attack: new AttackAction(),
  pick_skill: new PickSkillAction(),
  apprenticeship: new ApprenticeshipAction(),
  become_genius: new BecomeGeniusAction(),
  read_book: new ReadBookAction(),
  self_disease: new SelfDiseaseAction(),
  self_injury: new SelfInjuryAction(),
  warp_to_planet: new WarpToPlanetAction(),
  claim_slot: new ClaimSlotAction(),
  withdraw_slot: new WithdrawSlotAction(),
  mark_done: new MarkDoneAction(),
  cancel_plan: new CancelPlanAction(),
  summon: new SummonAction(),
};

/** Every action a player can send: each class's own data shape (`XyzActionData` in its file), so a new action needs only its entry above. */
export type Action = ReturnType<(typeof REGISTRY)[keyof typeof REGISTRY]["candidates"]>[number];

export const ACTIONS: { [T in ActionType]: ActionDef<ActionOf<T>> } = REGISTRY;

/** Whether an action type is done in a terminal's window (`Action.terminal`), so not offered on the inspect panel. */
export const actionInTerminal = (type: ActionType): boolean => ACTIONS[type].terminal;

/** Whether an action type is public, private, secret or covert. A fixed property of the type, so safe for the client to show. */
export const actionVisibility = (type: ActionType): ActionVisibility => ACTIONS[type].visibility;
