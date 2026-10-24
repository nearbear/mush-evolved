import { actionCost, actionSuccessRate, actionDirtRate, actionInjuryRate } from "../modifiers.ts";
import type { Action as AnyAction, GameState, PlayerState } from "../types.ts";

/** Others you could bond with, share with or hit: living, in your room, not yourself. */
export const peopleHere = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);

/** The `validate` code for full hands: such an action is shown disabled rather than hidden (`unaffordableActions`). */
export const NO_SPACE = "no_space";

/**
 * Who learns of an action, for the label on its button (the log entries themselves come from `log.ts`).
 * Declared per action and kept in step with the log call in its `apply`.
 */
export type ActionVisibility = "public" | "private" | "secret" | "covert";

/**
 * Kinds of action that other rules react to, so those rules never list action types (issue 30, owner 2026-10-18).
 * - `aggressive`: an attack on someone. No effects yet; later ones include Pacifist's surcharge in its room.
 * - `spore`: a Mush ability that rings a myco alarm on the floor of the room where it resolves (mycoalarm.ts).
 */
export type ActionTag = "aggressive" | "spore";

export class Action<T extends { type: string }> {
  type: string;
  visibility: ActionVisibility = "public";
  /** Fixed per type, like visibility, so safe for the client to show. */
  tags: readonly ActionTag[] = [];
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
   * set the base price in `getCost`; modifiers (`actionCost` in modifiers.ts) adjust it here, so the price shown
   * and the price checked can't disagree.
   */
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    // Every T is a member of the Action union; share.ts and transfer.ts are generic over the type name, so TS can't see it.
    return actionCost(this.getCost(state, player, target), { state, actor: player, action: target as unknown as AnyAction, tags: this.tags });
  }

  /** How far modifiers move the price from `getCost` (can be negative). Queued actions compare it (queue.ts). */
  adjustment(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    const base = this.getCost(state, player, target);
    const cost = this.cost(state, player, target);
    return { ap: cost.ap - base.ap, mp: cost.mp - base.mp };
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
    return actionSuccessRate(this.getSuccessChance(state, player, target),  { state, actor: player, action: target as unknown as AnyAction, tags: this.tags });
  }

  dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  injuryChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  dirtChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T){
    return actionDirtRate(this.dirtChance(state, player, target),  { state, actor: player, action: target as unknown as AnyAction, tags: this.tags } );
  }

  injuryChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T){
    return actionInjuryRate(this.injuryChance(state, player, target),  { state, actor: player, action: target as unknown as AnyAction, tags: this.tags } );
  }

  /**
   * Whether this player can do it now: `validate`, then the price. Subclasses override `validate`, never this, so
   * no action can skip the cost check (a modifier can put a price on a free action).
   */
  check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    return this.validate(state, player, target) ?? this.canAfford(state, player, target);
  }

  /** The action's own conditions, apart from the price: an error code, or null if it may go ahead. */
  validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    return null;
  }

  apply(state: GameState, player: PlayerState, target: T): void {
    return;
  }

  /** The effect when the success roll fails (the cost stays paid). */
  fail(state: GameState, player: PlayerState, target: T): void {
    return;
  }
}