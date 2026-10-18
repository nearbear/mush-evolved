import { BondAction } from "./actions/bond.ts";
import { BuildAction } from "./actions/build.ts";
import { ConsumeAction } from "./actions/consume.ts";
import { CookAction } from "./actions/cook.ts";
import { DismantleAction } from "./actions/dismantle.ts";
import { AccessAction } from "./actions/access.ts";
import type { ActionVisibility } from "./actions/action.ts";
import { DispenseAction } from "./actions/dispense.ts";
import { ExamineAction } from "./actions/examine.ts";
import { ExtractSporeAction } from "./actions/extract_spore.ts";
import { MoveAction } from "./actions/move.ts";
import { ResearchAction } from "./actions/research.ts";
import { ReadyAction } from "./actions/ready.ts";
import { HealAction } from "./actions/heal.ts";
import { InstallAction } from "./actions/install.ts";
import { UninstallAction } from "./actions/uninstall.ts";
import { JettisonAction } from "./actions/jettison.ts";
import { PickSkillAction } from "./actions/pick_skill.ts";
import { PunchAction } from "./actions/punch.ts";
import { ShareAction } from "./actions/share.ts";
import { ShowerAction } from "./actions/shower.ts";
import { SpikeAction } from "./actions/spike.ts";
import { TransferAction } from "./actions/transfer.ts";
import { itemsIn } from "./items.ts";
import type { Action, GameState, LogParams, PlayerId, PlayerState, Target } from "./types.ts";

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

export interface ActionCost {
  ap: number;
  mp: number;
}

export type { ActionVisibility };

export interface ActionDef<A extends Action> {
  /** Who learns of it; the same for every candidate of a type. */
  readonly visibility: ActionVisibility;
  /** Whether it takes time and goes through the queue (queue.ts), or happens at once. */
  readonly timed: boolean;
  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): A[];
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): string | null;
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  apply(next: GameState, player: PlayerState, action: A): void;
  /** Chance of success, 0 to 1; applyAction rolls it once with the seeded RNG after the cost is paid (skipped at 1). */
  chance?(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
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
  dispense: new DispenseAction(),
  consume: new ConsumeAction(),
  cook: new CookAction(),
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
  shower: new ShowerAction(),
  heal: new HealAction(),
  punch: new PunchAction(),
  pick_skill: new PickSkillAction(),
};

/** Whether an action type is public, private, secret or covert. A fixed property of the type, so safe for the client to show. */
export const actionVisibility = (type: ActionType): ActionVisibility => ACTIONS[type].visibility;

export function visibleTargets(state: Readonly<GameState>, player: Readonly<PlayerState>): Target[] {
  return [
    ...state.players.filter((o) => o.room === player.room).map((o): Target => ({ kind: "player", id: o.id })),
    ...(state.config.equipment[player.room] ?? []).map((e): Target => ({ kind: "equipment", id: e.id })),
    ...itemsIn(state, { kind: "player", id: player.id }).map((i): Target => ({ kind: "item", id: i.id })),
    ...itemsIn(state, { kind: "room", id: player.room }).map((i): Target => ({ kind: "item", id: i.id })),
  ];
}

function examineEvent(state: Readonly<GameState>, viewer: Readonly<PlayerState>, target: Target): [string, LogParams] {
  switch (target.kind) {
    case "player":
      return target.id === viewer.id ? ["examineSelf", {}] : ["examinePlayer", { name: state.players.find((p) => p.id === target.id)?.character ?? target.id }];
    case "equipment": {
      const e = state.config.equipment[viewer.room]?.find((eq) => eq.id === target.id);
      return ["examineEquipment", { equipment: e?.type ?? target.id }];
    }
    case "item": {
      const i = state.items.find((it) => it.id === target.id);
      return ["examineItem", { item: i?.type ?? target.id }];
    }
  }
}

export { examineEvent };
