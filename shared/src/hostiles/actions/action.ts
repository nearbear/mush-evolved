// The base of a hostile NPC's own actions (../hostile.ts), one file each in this folder, like the players' in
// shared/src/actions/. Move (move.ts) and Punch (punch.ts) so far. Like a player's `Action` but with the hostile as the actor: player actions take a whole
// `PlayerState`, which a hostile isn't. Each one offers candidates, prices them from config, and applies; the base
// `HostileNpc.turn` checks the price, pays it and rolls `successChance`, as `applyAction` does for players.

import type { ActionTag } from "../../actions/action.ts";
import type { GameState } from "../../types.ts";
import type { HostileState } from "../hostile.ts";
import type { MoveHostileData } from "./move.ts";
import type { PunchHostileData } from "./punch.ts";

/** Each hostile action's data, tagged by `type`: one member per action file. */
export type HostileActionData = MoveHostileData | PunchHostileData;

/** One action and the data it would be done with. */
export interface HostileOption {
  action: HostileAction;
  data: HostileActionData;
}

export abstract class HostileAction<D extends HostileActionData = HostileActionData> {
  constructor(readonly type: D["type"]) {}

  /** As a player action's: what the rules and modifiers that read tags see (an aggressive one is priced by Pacifist, stopped by a Ceasefire). */
  readonly tags: readonly ActionTag[] = [];

  /** What it could do this with now. */
  abstract candidates(state: Readonly<GameState>, self: Readonly<HostileState>): D[];

  /** Free by default. */
  cost(_state: Readonly<GameState>, _self: Readonly<HostileState>, _data: D): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  /** 0 to 1; rolled once with the seeded RNG, and not rolled at 1. */
  successChance(_state: Readonly<GameState>, _self: Readonly<HostileState>, _data: D): number {
    return 1;
  }

  /** The effect. Mutates a state the caller already cloned. */
  abstract apply(state: GameState, self: HostileState, data: D): void;

  /** The effect of a failed roll; the cost stays paid. Nothing by default. */
  fail(_state: GameState, _self: HostileState, _data: D): void {}
}

