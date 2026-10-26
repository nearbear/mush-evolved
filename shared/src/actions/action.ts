import { actionCost, actionSuccessRate, actionDirtRate, actionInjuryRate, type CostContext } from "../modifiers.ts";
import type { Action as AnyAction, GameState, PlayerState } from "../types.ts";

/** Others you could bond with, share with or hit: living, in your room, not yourself. */
export const peopleHere = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);

/** The `validate` code for full hands: such an action is shown disabled rather than hidden (`unaffordableActions`). */
/** Reason code: combat and spore actions wait for Mush selection (preselection.ts). */
export const IN_PRESELECTION = "preselection";

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
 * - `shoot`: a shot at a hunter from a turret. No effects yet; later ones include Gunner's accuracy and Gunman's pool.
 */
export type ActionTag = "aggressive" | "spore" | "shoot";

/** Checks one field of an action that came from a client (`Action.parse`). */
export type FieldCheck = (value: unknown) => boolean;

/** A check for each field of an action besides `type`. */
export type Fields<T> = { readonly [K in Exclude<keyof T, "type">]-?: FieldCheck };

export const isString = (value: unknown): value is string => typeof value === "string";
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export class Action<T extends { type: string }> {
  type: string;
  /** How `parse` checks each field. Given to the constructor, which requires it whenever the action has fields. */
  readonly fields: Fields<T>;
  visibility: ActionVisibility = "public";
  /** Fixed per type, like visibility, so safe for the client to show. */
  tags: readonly ActionTag[] = [];
  /** Takes `config.action.durationMs` and waits its turn in the queue (queue.ts). False only for only a few actions. */
  timed: boolean = true;
  /** Kept in the actor's action history (history.ts), which Interrogate and Chitchat reveal. False for the few eMush leaves out, and for moving. */
  recorded: boolean = true;
  /** Done in a terminal's window (web TerminalDialog), so the inspect panel leaves it out. Fixed per type, like visibility. */
  terminal: boolean = false;

  constructor(type: string, ...fields: [Exclude<keyof T, "type">] extends [never] ? [] : [fields: Fields<T>]) {
    this.type = type;
    this.fields = fields[0] ?? ({} as Fields<T>);
  }

  /**
   * The action in an untrusted client message (protocol.ts), or null if a field fails its check. Builds a fresh object
   * with only the known fields, so nothing extra a client sends reaches the queue or the game record. Override only
   * for shapes `fields` can't express: for a union of shapes, `fields` covers only the keys every shape shares, so
   * such an action must override it (dismantle, attack) or lose its other fields.
   */
  parse(raw: Readonly<Record<string, unknown>>): T | null {
    const action: Record<string, unknown> = { type: this.type };
    for (const [key, check] of Object.entries<FieldCheck>(this.fields)) {
      if (!check(raw[key])) return null;
      action[key] = raw[key];
    }
    // Every field of T but `type` has a check in `fields` (the constructor's type requires it), and each one passed.
    return action as T;
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
    return actionCost(this.getCost(state, player, target), this.context(state, player, target));
  }

  /** What modifiers see of this action (modifiers.ts). */
  private context(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): CostContext {
    // Every T is a member of the Action union; share.ts and transfer.ts are generic over the type name, so TS can't see it.
    return { state, actor: player, action: target as unknown as AnyAction, tags: this.tags };
  }

  /** How far modifiers move the price from `getCost` (can be negative). Queued actions compare it (queue.ts). */
  adjustment(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    const base = this.getCost(state, player, target);
    const cost = this.cost(state, player, target);
    return { ap: cost.ap - base.ap, mp: cost.mp - base.mp };
  }

  getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  canAfford(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    const cost = this.cost(state, player, target);
    if (player.ap < cost.ap) return "cant_afford";
    if (player.mp < cost.mp) return "cant_afford";
    return null;
  }

  getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 1;
  }

  chance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return actionSuccessRate(this.getSuccessChance(state, player, target), this.context(state, player, target));
  }

  dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  injuryChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  dirtChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return actionDirtRate(this.dirtChance(state, player, target), this.context(state, player, target));
  }

  injuryChanceMods(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return actionInjuryRate(this.injuryChance(state, player, target), this.context(state, player, target));
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