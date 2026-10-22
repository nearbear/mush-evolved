import { AcceptAccommodationAction, AccommodateAction, StopAccommodationAction } from "./actions/accommodate.ts";
import { BondAction } from "./actions/bond.ts";
import { BuildAction } from "./actions/build.ts";
import { ConsumeAction } from "./actions/consume.ts";
import { CookAction } from "./actions/cook.ts";
import { ExpressCookAction } from "./actions/express_cook.ts";
import { DismantleAction } from "./actions/dismantle.ts";
import { AccessAction } from "./actions/access.ts";
import type { ActionTag, ActionVisibility } from "./actions/action.ts";
import { DispenseAction } from "./actions/dispense.ts";
import { ExamineAction } from "./actions/examine.ts";
import { ExtractSporeAction } from "./actions/extract_spore.ts";
import { MoveAction } from "./actions/move.ts";
import { ResearchAction } from "./actions/research.ts";
import { ProjectAction } from "./actions/project.ts";
import { ScanPlanetAction } from "./actions/scan_planet.ts";
import { AnalyzePlanetAction } from "./actions/analyze_planet.ts";
import { DeletePlanetAction } from "./actions/delete_planet.ts";
import { ReadyAction } from "./actions/ready.ts";
import { HealAction } from "./actions/heal.ts";
import { InstallAction } from "./actions/install.ts";
import { UninstallAction } from "./actions/uninstall.ts";
import { JettisonAction } from "./actions/jettison.ts";
import { PickSkillAction } from "./actions/pick_skill.ts";
import { ReadBookAction } from "./actions/read_book.ts";
import { PunchAction } from "./actions/punch.ts";
import { ShareAction } from "./actions/share.ts";
import { GetUpAction, LieDownAction } from "./actions/lie_down.ts";
import { ShowerAction } from "./actions/shower.ts";
import { SpikeAction } from "./actions/spike.ts";
import { TransferAction } from "./actions/transfer.ts";
import type { Action, GameState, PlayerState } from "./types.ts";

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

export interface ActionCost {
  ap: number;
  mp: number;
}

export type { ActionTag, ActionVisibility };

export interface ActionDef<A extends Action> {
  /** Who learns of it; the same for every candidate of a type. */
  readonly visibility: ActionVisibility;
  /** What kind of action it is, for rules that react to kinds (see `ActionTag`); the same for every candidate of a type. */
  readonly tags: readonly ActionTag[];
  /** Whether it takes time and goes through the queue (queue.ts), or happens at once. */
  readonly timed: boolean;
  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): A[];
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): string | null;
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  /** How far modifiers move the price from the action's own (`Action.adjustment`). */
  adjustment(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  apply(next: GameState, player: PlayerState, action: A): void;
  /** Chance of success, 0 to 1; applyAction rolls it once with the seeded RNG after the cost is paid (skipped at 1). */
  chance?(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  dirtChance?(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
  /** The effect on failure (the cost stays paid). Mutates a state the caller already cloned. */
  fail?(next: GameState, player: PlayerState, action: A): void;
}

export const ACTIONS: { [T in ActionType]: ActionDef<ActionOf<T>> } = {
  ready: new ReadyAction(),
  move: new MoveAction(),
  take: new TransferAction("take"),
  drop: new TransferAction("drop"),
  dismantle: new DismantleAction(),
  access: new AccessAction(),
  research: new ResearchAction(),
  project: new ProjectAction(),
  scan_planet: new ScanPlanetAction(),
  analyze_planet: new AnalyzePlanetAction(),
  delete_planet: new DeletePlanetAction(),
  dispense: new DispenseAction(),
  consume: new ConsumeAction(),
  cook: new CookAction(),
  express_cook: new ExpressCookAction(),
  build: new BuildAction(),
  jettison: new JettisonAction(),
  install: new InstallAction(),
  uninstall: new UninstallAction(),
  examine: new ExamineAction(),
  bond: new BondAction(),
  dtt: new ShareAction("dtt"),
  stt: new ShareAction("stt"),
  extract_spore: new ExtractSporeAction(),
  spike: new SpikeAction(),
  lie_down: new LieDownAction(),
  get_up: new GetUpAction(),
  accommodate: new AccommodateAction(),
  accept_accommodation: new AcceptAccommodationAction(),
  stop_accommodation: new StopAccommodationAction(),
  shower: new ShowerAction(),
  heal: new HealAction(),
  punch: new PunchAction(),
  pick_skill: new PickSkillAction(),
  read_book: new ReadBookAction(),
};

/** Whether an action type is public, private, secret or covert. A fixed property of the type, so safe for the client to show. */
export const actionVisibility = (type: ActionType): ActionVisibility => ACTIONS[type].visibility;
