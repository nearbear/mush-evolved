import { AcceptAccommodationAction, AccommodateAction, StopAccommodationAction } from "./actions/accommodate.ts";
import { BondAction } from "./actions/bond.ts";
import { BuildAction } from "./actions/build.ts";
import { CaressAction } from "./actions/caress.ts";
import { MushCaressAction } from "./actions/mush_caress.ts";
import { ConsumeAction } from "./actions/consume.ts";
import { HideAction } from "./actions/hide.ts";
import { SearchAction } from "./actions/search.ts";
import { SnoopAction } from "./actions/snoop.ts";
import { CheckSporesAction } from "./actions/check_spores.ts";
import { DispenseDrugAction } from "./actions/dispense_drug.ts";
import { CookAction } from "./actions/cook.ts";
import { ExpressCookAction } from "./actions/express_cook.ts";
import { HyperfreezeAction } from "./actions/hyperfreeze.ts";
import { DismantleAction } from "./actions/dismantle.ts";
import { AccessAction } from "./actions/access.ts";
import { HackAction } from "./actions/hack.ts";
import type { ActionCost, ActionTag, ActionVisibility } from "./actions/action.ts";
import { ITEM_TYPES } from "./itemTypes.ts";
import type { ItemTypeId } from "./itemIds.ts";
import { DispenseAction } from "./actions/dispense.ts";
import { PlayArcadeAction } from "./actions/play_arcade.ts";
import { ListenJukeboxAction } from "./actions/listen_jukebox.ts";
import { CheckJukeboxAction } from "./actions/check_jukebox.ts";
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
import { TravelToEdenAction } from "./actions/travel_to_eden.ts";
import { ComputeEdenAction } from "./actions/compute_eden.ts";
import { ContactSolAction } from "./actions/contact_sol.ts";
import { DecodeRebelAction } from "./actions/decode_rebel.ts";
import { ContactXylophAction } from "./actions/contact_xyloph.ts";
import { CloseDealAction } from "./actions/close_deal.ts";
import { ContactSignalAction } from "./actions/contact_signal.ts";
import { RefuseSignalAction } from "./actions/refuse_signal.ts";
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
import { UpgradeDroneAction } from "./actions/upgrade_drone.ts";
import { SabotageAction } from "./actions/sabotage.ts";
import { SabotageDoorAction } from "./actions/sabotage_door.ts";
import { ExtinguishAction } from "./actions/extinguish.ts";
import { ExtinguishManuallyAction } from "./actions/extinguish_manually.ts";
import { TakeoffAction } from "./actions/takeoff.ts";
import { IcarusTakeoffAction } from "./actions/icarus_takeoff.ts";
import { BoardIcarusAction } from "./actions/board_icarus.ts";
import { LeaveIcarusAction } from "./actions/leave_icarus.ts";
import { LandOnPlanetAction } from "./actions/land_on_planet.ts";
import { UTurnAction } from "./actions/u_turn.ts";
import { SabotageExpeditionAction } from "./actions/sabotage_expedition.ts";
import { LandAction } from "./actions/land.ts";
import { CollectScrapAction } from "./actions/collect_scrap.ts";
import { RenovateAction } from "./actions/renovate.ts";
import { OpenCapsuleAction } from "./actions/open_capsule.ts";
import { OpenLunchboxAction } from "./actions/open_lunchbox.ts";
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
import { SetLaunchKeyAction } from "./actions/set_launch_key.ts";
import { ReadyAction } from "./actions/ready.ts";
import { HealAction } from "./actions/heal.ts";
import { SurgeryAction } from "./actions/surgery.ts";
import { VaccinateAction } from "./actions/vaccinate.ts";
import { UseBandageAction } from "./actions/use_bandage.ts";
import { RemoveSporeAction } from "./actions/remove_spore.ts";
import { InstallAction } from "./actions/install.ts";
import { UninstallAction } from "./actions/uninstall.ts";
import { JettisonAction } from "./actions/jettison.ts";
import { PickSkillAction } from "./actions/pick_skill.ts";
import { ApprenticeshipAction } from "./actions/apprenticeship.ts";
import { BecomeGeniusAction } from "./actions/become_genius.ts";
import { CeasefireAction } from "./actions/ceasefire.ts";
import { ReadBookAction } from "./actions/read_book.ts";
import { TearAction } from "./actions/tear.ts";
import { PrintListAction } from "./actions/print_list.ts";
import { AnathemaAction } from "./actions/anathema.ts";
import { CoupAction } from "./actions/coup.ts";
import { IssueMissionAction } from "./actions/issue_mission.ts";
import { SwapCharacterAction } from "./actions/swap_character.ts";
import { BoringSpeechAction, FierySpeechAction } from "./actions/speech.ts";
import { PunchAction } from "./actions/punch.ts";
import { ThrowOutAction } from "./actions/throw_out.ts";
import { InterrogateAction } from "./actions/interrogate.ts";
import { ChitchatAction } from "./actions/chitchat.ts";
import { PremonitionAction } from "./actions/premonition.ts";
import { ComfortAction } from "./actions/comfort.ts";
import { AttackAction } from "./actions/attack.ts";
import { ShareAction } from "./actions/share.ts";
import { GuardAction, StopGuardingAction } from "./actions/guard.ts";
import { EnterNimbleAction, ExitNimbleAction, NIMBLE } from "./actions/nimble.ts";
import { BecomeNinjaAction, BecomeNormalAction } from "./actions/ninja.ts";
import { DelogAction } from "./actions/delog.ts";
import { RadioPiracyAction } from "./actions/radio_piracy.ts";
import { RadioPiracyRoomAction } from "./actions/radio_piracy_room.ts";
import { FactoryResetAction } from "./actions/factory_reset.ts";
import { ProtectAction } from "./actions/protect.ts";
import { GetUpAction, LieDownAction } from "./actions/lie_down.ts";
import { ReportDoorAction, ReportEquipmentAction, ReportFireAction } from "./actions/report.ts";
import { ShowerAction } from "./actions/shower.ts";
import { SpikeAction } from "./actions/spike.ts";
import { FungalCuisineAction } from "./actions/fungal_cuisine.ts";
import { BodyTransferAction } from "./actions/body_transfer.ts";
import { ResetSkillsAction } from "./actions/reset_skills.ts";
import { MassMoulderingAction } from "./actions/mass_mouldering.ts";
import { DemoralizeAction } from "./actions/demoralize.ts";
import { GiveDiseaseAction } from "./actions/give_disease.ts";
import { TrapRoomAction } from "./actions/trap_room.ts";
import { GrowFairyRingAction } from "./actions/grow_fairy_ring.ts";
import { TapFairyRingAction } from "./actions/tap_fairy_ring.ts";
import { NightmareAction } from "./actions/nightmare.ts";
import { TransferAction } from "./actions/transfer.ts";
import { WaterAction } from "./actions/water.ts";
import { TreatAction } from "./actions/treat.ts";
import { SowAction } from "./actions/sow.ts";
import { GraftAction } from "./actions/graft.ts";
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
  apply(next: GameState, player: PlayerState, action: A, cost?: ActionCost): void;
  /** Chance of success, 0 to 1; applyAction rolls it once with the seeded RNG after the cost is paid (skipped at 1). */
  chance(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  /** Cycles until a `cooldown` refusal clears (0 when none applies). */
  cooldownLeft(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  dirtChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  injuryChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  /** Runs when the action's injury roll triggers and isn't blocked by gloves (after damage). */
  onInjury(next: GameState, player: PlayerState, action: A): void;
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
  hack: new HackAction(),
  research: new ResearchAction(),
  spoil_research: new SpoilResearchAction(),
  contaminate: new ContaminateAction(),
  project: new ProjectAction(),
  repair_pilgred: new RepairPilgredAction(),
  return_to_sol: new ReturnToSolAction(),
  travel_to_eden: new TravelToEdenAction(),
  compute_eden: new ComputeEdenAction(),
  turn_ship: new TurnShipAction(),
  set_launch_key: new SetLaunchKeyAction(),
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
  contact_signal: new ContactSignalAction(),
  close_deal: new CloseDealAction(),
  refuse_signal: new RefuseSignalAction(),
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
  sabotage_door: new SabotageDoorAction(),
  reinforce: new ReinforceAction(),
  upgrade_drone: new UpgradeDroneAction(),
  green_jelly: new GreenJellyAction(),
  extinguish_manually: new ExtinguishManuallyAction(),
  takeoff: new TakeoffAction(),
  board_icarus: new BoardIcarusAction(),
  leave_icarus: new LeaveIcarusAction(),
  icarus_takeoff: new IcarusTakeoffAction(),
  land_on_planet: new LandOnPlanetAction(),
  u_turn: new UTurnAction(),
  sabotage_expedition: new SabotageExpeditionAction(),
  land: new LandAction(),
  collect_scrap: new CollectScrapAction(),
  renovate: new RenovateAction(),
  open_capsule: new OpenCapsuleAction(),
  open_lunchbox: new OpenLunchboxAction(),
  dispense: new DispenseAction(),
  play_arcade: new PlayArcadeAction(),
  listen_jukebox: new ListenJukeboxAction(),
  check_jukebox: new CheckJukeboxAction(),
  consume: new ConsumeAction(),
  hide: new HideAction(),
  search: new SearchAction(),
  snoop: new SnoopAction(),
  check_spores: new CheckSporesAction(),
  dispense_drug: new DispenseDrugAction(),
  cook: new CookAction(),
  express_cook: new ExpressCookAction(),
  hyperfreeze: new HyperfreezeAction(),
  water: new WaterAction(),
  treat: new TreatAction(),
  sow: new SowAction(),
  graft: new GraftAction(),
  build: new BuildAction(),
  jettison: new JettisonAction(),
  install: new InstallAction(),
  uninstall: new UninstallAction(),
  examine: new ExamineAction(),
  caress: new CaressAction(),
  mush_caress: new MushCaressAction(),
  bond: new BondAction(),
  dtt: new ShareAction("dtt"),
  stt: new ShareAction("stt"),
  extract_spore: new ExtractSporeAction(),
  consume_spore: new ConsumeSporeAction(),
  tube_transfer: new TubeTransferAction(),
  spike: new SpikeAction(),
  fungal_cuisine: new FungalCuisineAction(),
  body_transfer: new BodyTransferAction(),
  reset_skills: new ResetSkillsAction(),
  mass_mouldering: new MassMoulderingAction(),
  demoralize: new DemoralizeAction(),
  give_disease: new GiveDiseaseAction(),
  trap_room: new TrapRoomAction(),
  grow_fairy_ring: new GrowFairyRingAction(),
  tap_fairy_ring: new TapFairyRingAction(),
  nightmare: new NightmareAction(),
  lie_down: new LieDownAction(),
  get_up: new GetUpAction(),
  report_fire: new ReportFireAction(),
  report_equipment: new ReportEquipmentAction(),
  report_door: new ReportDoorAction(),
  guard: new GuardAction(),
  stop_guarding: new StopGuardingAction(),
  enter_nimble: new EnterNimbleAction(),
  exit_nimble: new ExitNimbleAction(),
  become_ninja: new BecomeNinjaAction(),
  become_normal: new BecomeNormalAction(),
  delog: new DelogAction(),
  radio_piracy: new RadioPiracyAction(),
  radio_piracy_room: new RadioPiracyRoomAction(),
  factory_reset: new FactoryResetAction(),
  protect: new ProtectAction(),
  accommodate: new AccommodateAction(),
  accept_accommodation: new AcceptAccommodationAction(),
  stop_accommodation: new StopAccommodationAction(),
  shower: new ShowerAction(),
  heal: new HealAction(),
  surgery: new SurgeryAction(),
  vaccinate: new VaccinateAction(),
  use_bandage: new UseBandageAction(),
  remove_spore: new RemoveSporeAction(),
  punch: new PunchAction(),
  throw_out: new ThrowOutAction(),
  interrogate: new InterrogateAction(),
  chitchat: new ChitchatAction(),
  premonition: new PremonitionAction(),
  comfort: new ComfortAction(),
  anathema: new AnathemaAction(),
  coup: new CoupAction(),
  issue_mission: new IssueMissionAction(),
  swap_character: new SwapCharacterAction(),
  fiery_speech: new FierySpeechAction(),
  boring_speech: new BoringSpeechAction(),
  attack: new AttackAction(),
  pick_skill: new PickSkillAction(),
  apprenticeship: new ApprenticeshipAction(),
  become_genius: new BecomeGeniusAction(),
  ceasefire: new CeasefireAction(),
  read_book: new ReadBookAction(),
  tear: new TearAction(),
  print_list: new PrintListAction(),
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

const SHIP_WIDE_ACTIONS: ReadonlySet<ActionType> = new Set(["travel", "leave_orbit", "return_to_sol", "travel_to_eden"]);

/** The type of the item an action names in its `item` field, looked up in `items` (the state's, or a view's inventory and room items). */
export const actionItemType = (items: readonly { readonly id: string; readonly type: ItemTypeId }[], action: Action): ItemTypeId | undefined =>
  "item" in action && typeof action.item === "string" ? items.find((i) => i.id === action.item)?.type : undefined;

/**
 * Whether an action type is public, private, secret or covert. In Nimble mode, room-level public actions become secret.
 * Taking or dropping a private item (the iTrackie, owner 2026-11-18) is private: pass the item's type (`actionItemType`).
 */
export const actionVisibility = (type: ActionType, view?: { readonly statuses: readonly string[] }, itemType?: ItemTypeId): ActionVisibility => {
  const base = (type === "take" || type === "drop") && itemType !== undefined && ITEM_TYPES[itemType]?.private ? "private" : ACTIONS[type].visibility;
  if (base === "public" && view?.statuses.includes(NIMBLE) && !SHIP_WIDE_ACTIONS.has(type)) return "secret";
  return base;
};
