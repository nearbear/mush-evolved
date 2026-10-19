import { Action } from "./action.ts";
import { logPublic } from "../log.ts";
import { moveCost, movementRules } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type MoveActionData = { type: "move"; to: string };

export class MoveAction extends Action<MoveActionData> {
  constructor() {
    super("move");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): MoveActionData[] {
    return (state.config.rooms[player.room] ?? []).map((to) => ({ type: "move", to }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MoveActionData): string | null {
    if (!(state.config.rooms[player.room] ?? []).includes(target.to)) return "not_adjacent";
    return moveCost(movementRules(state, player), player) ? null : "cant_afford";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MoveActionData): { ap: number; mp: number } {
    const rules = movementRules(state, player);
    const c = moveCost(rules, player);
    // Unaffordable (a queued move repriced after the AP ran out): a nominal price; check() rejects it and it is dropped.
    if (!c) return { ap: rules.apPerConversion, mp: 0 };
    return { ap: c.ap, mp: player.mp - c.mpAfter };
  }

  override apply(state: GameState, player: PlayerState, target: MoveActionData): void {
    const from = player.room;
    player.room = target.to;
    logPublic(state, from, "left", { name: player.character, room: target.to });
    logPublic(state, target.to, "entered", { name: player.character, room: from });
  }
}
