import { Action } from "./action.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReadyActionData = { type: "ready" };

export class ReadyAction extends Action<ReadyActionData> {
  constructor() {
    super("ready");
  }

  override getCandidates(): ReadyActionData[] {
    return [{ type: "ready" }];
  }

  override check(): string | null {
    return null;
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    player.ready = true;
  }
}
