import type { GameState, PlayerState } from "../types.ts";

/** Others you could bond with, share with or hit: living, in your room, not yourself. */
export const peopleHere = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);

/**
 * Who learns of an action, for the label on its button (the log entries themselves come from `log.ts`).
 * Declared per action and kept in step with the log call in its `apply`.
 */
export type ActionVisibility = "public" | "private" | "secret" | "covert";

export class Action<T extends { type: string }> {
  type: string;
  visibility: ActionVisibility = "public";
  /** Takes `config.action.durationMs` and waits its turn in the queue (queue.ts). False only for only a few actions. */
  timed: boolean = true;
  baseAPCost: number = 0;
  baseMPCost: number = 0;
  baseSuccessChance: number = 1;

  constructor(type: string) {
    this.type = type;
  }

  candidates(state: Readonly<GameState>, player: Readonly<PlayerState>): T[] {
    return this.getCandidates(state, player);
  }

  getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): T[] {
    return [] as T[];
  }

  /**
   * What the action costs this player: the one place every cost is read (legality, paying, the view). Subclasses
   * set the base price in `getCost`; anything that changes prices for everyone, like a room-wide surcharge on
   * aggressive actions, belongs here so the price shown and the price checked can't disagree.
   */
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    return this.getCost(state, player, target);
  }

  getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    return { ap: this.baseAPCost, mp: this.baseMPCost };
  }

  canAfford(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    const cost = this.cost(state, player, target);
    if (player.ap < cost.ap) return "cant_afford";
    if (player.mp < cost.mp) return "cant_afford";
    return null;
  }

  getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return this.baseSuccessChance;
  }

  chance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return this.getSuccessChance(state, player, target);
  }

  check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    return this.canAfford(state, player, target);
  }

  apply(state: GameState, player: PlayerState, target: T): void {
    return;
  }

  /** The effect when the success roll fails (the cost stays paid). */
  fail(state: GameState, player: PlayerState, target: T): void {
    return;
  }
}