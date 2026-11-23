// Move, a hostile NPC's action (owner, 2026-11-22).

import { HostileAction } from "./action.ts";
import { isGuardian } from "../../actions/guard.ts";
import { isDoorBroken } from "../../doors.ts";
import { logPublic } from "../../log.ts";
import type { GameState } from "../../types.ts";
import type { HostileState } from "../hostile.ts";

export type MoveHostileData = { type: "move"; to: string };

/**
 * Walks through an unbroken door to an adjacent room, for `move.cost.ap`. Public in both rooms. A guardian in the room
 * (actions/guard.ts) holds it as it holds a player: it may only leave by the door it came in by (`enteredFrom`), and
 * one that came another way (spawned) can't leave at all.
 */
class MoveAction extends HostileAction<MoveHostileData> {
  constructor() {
    super("move");
  }

  override candidates(state: Readonly<GameState>, self: Readonly<HostileState>) {
    const guarded = state.players.some((p) => p.alive && p.room === self.room && isGuardian(p));
    return (state.config.rooms[self.room] ?? [])
      .filter((to) => !isDoorBroken(state, self.room, to) && (!guarded || self.enteredFrom === to))
      .map((to) => ({ type: "move" as const, to }));
  }

  override cost(state: Readonly<GameState>, self: Readonly<HostileState>) {
    return { ap: state.config.hostiles.kinds[self.kind]!.move.cost.ap, mp: 0 };
  }

  override apply(state: GameState, self: HostileState, data: { to: string }): void {
    const from = self.room;
    self.room = data.to;
    self.enteredFrom = from;
    logPublic(state, from, "hostileLeft", { hostile: self.kind, room: data.to });
    logPublic(state, data.to, "hostileArrived", { hostile: self.kind, room: from });
  }
}

export const HOSTILE_MOVE: HostileAction = new MoveAction() as HostileAction;
