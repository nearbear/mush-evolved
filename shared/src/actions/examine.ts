import { Action, type ActionVisibility } from "./action.ts";
import { itemsIn, visibleItemsIn } from "../items.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState, Target } from "../types.ts";

export type ExamineActionData = { type: "examine"; target: Target };

export class ExamineAction extends Action<ExamineActionData> {
  override visibility: ActionVisibility = "private";

  // Left out of the action history, as in eMush (owner, 2026-10-24).
  override recorded = false;

  constructor() {
    super("examine");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ExamineActionData[] {
    return visibleTargets(state, player).map((target) => ({ type: "examine", target }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ExamineActionData): string | null {
    return visibleTargets(state, player).some((t) => t.kind === target.target.kind && t.id === target.target.id) ? null : "cant_see";
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: ExamineActionData): void {
    switch (target.target.kind) {
      case "player":
        logPrivate(
          state,
          player.id,
          target.target.id === player.id ? "examineSelf" : "examinePlayer",
          target.target.id === player.id ? {} : { name: state.players.find((p) => p.id === target.target.id)?.character ?? target.target.id },
        );
        return;
      case "equipment": {
        const equipment = state.config.equipment[player.room]?.find((eq) => eq.id === target.target.id);
        logPrivate(state, player.id, "examineEquipment", { equipment: equipment?.type ?? target.target.id });
        return;
      }
      case "item": {
        const item = state.items.find((entry) => entry.id === target.target.id);
        logPrivate(state, player.id, "examineItem", { item: item?.type ?? target.target.id });
        return;
      }
    }
  }
}

function visibleTargets(state: Readonly<GameState>, player: Readonly<PlayerState>): Target[] {
  return [
    ...state.players.filter((o) => o.room === player.room).map((o): Target => ({ kind: "player", id: o.id })),
    ...(state.config.equipment[player.room] ?? []).map((e): Target => ({ kind: "equipment", id: e.id })),
    ...itemsIn(state, { kind: "player", id: player.id }).map((i): Target => ({ kind: "item", id: i.id })),
    ...visibleItemsIn(state, { kind: "room", id: player.room }, player).map((i): Target => ({ kind: "item", id: i.id })),
  ];
}
