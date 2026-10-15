import { BondAction } from "./actions/bond.ts";
import { ConsumeAction } from "./actions/consume.ts";
import { DismantleAction } from "./actions/dismantle.ts";
import { DispenseAction } from "./actions/dispense.ts";
import { ExamineAction } from "./actions/examine.ts";
import { ExtractSporeAction } from "./actions/extract_spore.ts";
import { MoveAction } from "./actions/move.ts";
import { ReadyAction } from "./actions/ready.ts";
import { ShareAction } from "./actions/share.ts";
import { ShowerAction } from "./actions/shower.ts";
import { TransferAction } from "./actions/transfer.ts";
import { itemsIn } from "./items.ts";
import type { Action, GameState, LogParams, PlayerId, PlayerState, Target } from "./types.ts";

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

export interface ActionCost {
  ap: number;
  mp: number;
}

export interface ActionDef<A extends Action> {
  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): A[];
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): string | null;
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): ActionCost;
  apply(next: GameState, player: PlayerState, action: A): void;
  chance?(state: Readonly<GameState>, player: Readonly<PlayerState>, action: A): number;
}

export const ACTIONS: { [T in ActionType]: ActionDef<ActionOf<T>> } = {
  ready: new ReadyAction(),
  move: new MoveAction(),
  take: new TransferAction("take"),
  drop: new TransferAction("drop"),
  dismantle: new DismantleAction(),
  dispense: new DispenseAction(),
  consume: new ConsumeAction(),
  examine: new ExamineAction(),
  bond: new BondAction(),
  dtt: new ShareAction("dtt"),
  stt: new ShareAction("stt"),
  extract_spore: new ExtractSporeAction(),
  shower: new ShowerAction(),
};

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
      return target.id === viewer.id ? ["examineSelf", {}] : ["examinePlayer", { name: state.players.find((p) => p.id === target.id)?.name ?? target.id }];
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
