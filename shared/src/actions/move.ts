import { Action, isString } from "./action.ts";
import { leaveAccommodation, wheelAlong } from "./accommodate.ts";
import { logPublic } from "../log.ts";
import { arrive } from "../spot.ts";
import { freeAp } from "../helpers.ts";
import { moveCost, movementRules } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type MoveActionData = { type: "move"; to: string };

export class MoveAction extends Action<MoveActionData> {
  // Moving is left out of the action history (owner, 2026-10-24).
  override recorded = false;

  constructor() {
    super("move", { to: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): MoveActionData[] {
    // Someone being pushed goes where their pusher goes (accommodate.ts).
    if (player.pushedBy !== undefined) return [];
    return (state.config.rooms[player.room] ?? []).map((to) => ({ type: "move", to }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MoveActionData): string | null {
    if (!(state.config.rooms[player.room] ?? []).includes(target.to)) return "not_adjacent";
    if (player.pushedBy !== undefined) return "being_pushed";
    // The price itself, not just the base check: a move can have a negative MP price (converting AP gives MP), so a
    // modifier lowering the AP could let a player with no AP move and gain MP; and a cap below one move's MP makes it
    // impossible, not unaffordable.
    return moveCost(movementRules(state, player), { ap: freeAp(player), mp: player.mp }) ? null : "cant_afford";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MoveActionData): { ap: number; mp: number } {
    const rules = movementRules(state, player);
    const c = moveCost(rules, { ap: freeAp(player), mp: player.mp });
    // Unaffordable (a queued move repriced after the AP ran out): a nominal price; check() rejects it and it is dropped.
    if (!c) return { ap: rules.apPerConversion, mp: 0 };
    return { ap: c.ap, mp: player.mp - c.mpAfter };
  }

  override apply(state: GameState, player: PlayerState, target: MoveActionData): void {
    const from = player.room;
    player.room = target.to;
    arrive(player, from);
    logPublic(state, from, "left", { name: player.character, room: target.to });
    logPublic(state, target.to, "entered", { name: player.character, room: from });
    leaveAccommodation(state, player);
    wheelAlong(state, player, from);
  }
}
