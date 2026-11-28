import { actionCost, actionSuccessRate, actionDirtRate, actionInjuryRate, failureStreakMultiplier, isMute, type CostContext } from "../modifiers.ts";
import { isBrokenIn } from "../equipment.ts";
import type { Action as AnyAction, GameState, PlayerState, ResourceId } from "../types.ts";

/** Others you could bond with, share with or hit: living, in your room, not yourself. */
export const peopleHere = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);

/** The `check` code for an action on broken equipment (breakage.ts): it does nothing until repaired. */
export const BROKEN = "broken";

/** The `validate` code for full hands: such an action is shown disabled rather than hidden (`unaffordableActions`). */
/** Reason code: combat and spore actions wait for Mush selection (preselection.ts). */
export const IN_PRESELECTION = "preselection";

export const NO_SPACE = "no_space";

/** The `validate` code for an action whose shared daily limit is used up: shown disabled, not hidden (`unaffordableActions`). */
export const AT_CAPACITY = "at_capacity";

/** The `validate` code for a spore action refused at the Mush's own holding limit (`spores.max`): shown disabled, not hidden (`unaffordableActions`). */
export const SPORES_FULL = "spores_full";

/** The `validate` code for drawing from a Fairy Ring someone already drew from today: shown disabled, not hidden (`unaffordableActions`). */
export const RING_TAPPED = "ring_tapped";

/** The `validate` code for an action that is waiting out a cooldown: shown disabled, with the wait (`unaffordableActions`). */
export const COOLDOWN = "cooldown";

/** The `validate` code for an action you must be clean for: shown disabled, with "take a shower" (`unaffordableActions`). */
export const DIRTY = "dirty";

/** The `validate` code for Collect scrap with no debris out there: shown disabled, not hidden (`unaffordableActions`). */
export const NO_DEBRIS = "no_debris";

/** The `validate` code for Collect scrap from a patrol ship while the Pasiphae still exists: shown disabled (`unaffordableActions`). */
export const PASIPHAE_INTACT = "pasiphae_intact";

/** The `validate` code for Travel or a turn whose reactor is broken (navigation.ts): shown disabled with the reason, not hidden (`unaffordableActions`). */
export const REACTOR_BROKEN = "reactor_broken";

/** The `validate` code for Travel or Leave orbit while an Arack is around (hunters.ts): shown disabled with the reason (`unaffordableActions`). */
export const ARACK_AROUND = "arack_around";

/** The `validate` code for Board the Icarus or Take off when the orbited planet has no unexplored sector (expeditions.ts): shown disabled with the reason (owner, 2026-11-19). */
export const EXPLORED = "explored";

/** The `validate` code for Board the Icarus or Take off once the Icarus is lost (expeditions.ts): shown disabled with the reason (owner, 2026-11-19). */
export const ICARUS_LOST = "icarus_lost";

/** The `validate` code for actions locked once intergalactic travel is underway (#480, owner 2026-11-22): shown disabled with the reason. */
export const TRAVEL_UNDERWAY = "travel_underway";

/**
 * Who learns of an action, for the label on its button (the log entries themselves come from `log.ts`).
 * Declared per action and kept in step with the log call in its `apply`.
 */
export type ActionVisibility = "public" | "private" | "secret" | "covert";

/**
 * Kinds of action that other rules react to, so those rules never list action types (issue 30, owner 2026-10-18).
 * - `aggressive`: an attack on someone. No effects yet; later ones include Pacifist's surcharge in its room.
 * - `spore`: a Mush ability that rings a myco alarm on the floor of the room where it resolves (mycoalarm.ts).
 * - `melee`: a blow in person: a punch, or an attack with a melee weapon (a knife). No effects yet.
 * - `shoot`: a shot at a hunter from a turret. No effects yet; later ones include Gunner's accuracy and Gunman's pool.
 * - `talking`: speaking to someone in the room (Fiery speech, Boring speech, Chitchat, Comfort). A mute player (Torn Tongue) can't.
 */
/** `mush`: a Mush-only action (Black Bite makes one aimed at its carrier free, modifiers/black_bite_disease.ts). */
export type ActionTag = "aggressive" | "spore" | "shoot" | "melee" | "talking" | "mush";

/**
 * What an action costs. `paidBy` names a skill resource (a Computer point, a care point...) that pays for it in place of
 * its AP: performAction spends one of it, and the client shows that resource's icon on the button (ActionLabel).
 */
export interface ActionCost {
  ap: number;
  mp: number;
  paidBy?: ResourceId;
}

/** Checks one field of an action that came from a client (`Action.parse`). */
export type FieldCheck = (value: unknown) => boolean;

/** A check for each field of an action besides `type`. */
export type Fields<T> = { readonly [K in Exclude<keyof T, "type">]-?: FieldCheck };

export const isString = (value: unknown): value is string => typeof value === "string";
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
/** A position in a list (a plan's slot): a whole number, 0 or more. */
export const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

export class Action<T extends { type: string }> {
  type: string;
  /** How `parse` checks each field. Given to the constructor, which requires it whenever the action has fields. */
  readonly fields: Fields<T>;
  visibility: ActionVisibility = "public";
  /** Fixed per type, like visibility, so safe for the client to show. */
  tags: readonly ActionTag[] = [];
  /** The tags of this one action: `tags`, plus any that depend on what it names (an attack with a knife is melee). */
  tagsFor(_state: Readonly<GameState>, _action: T): readonly ActionTag[] {
    return this.tags;
  }
  /** Happens at once instead of being timed. Set on the few such actions; terminal actions are always instant (see `timed`). */
  instant: boolean = false;
  /**
   * Takes `config.action.durationMs` and waits its turn in the queue (queue.ts). False for `instant` actions and for
   * every terminal action (owner, 2026-11-27). A getter, since a subclass's `terminal` is set after this constructor runs.
   */
  get timed(): boolean {
    return !this.instant && !this.terminal;
  }
  /** Kept in the actor's action history (history.ts), which Interrogate and Chitchat reveal. False for the few eMush leaves out, and for moving. */
  recorded: boolean = true;
  /** Done in a terminal's window (web TerminalDialog), so the inspect panel leaves it out. Fixed per type, like visibility. */
  terminal: boolean = false;
  /** Allowed on broken equipment (Repair). Every other action naming broken equipment in its `equipment` field is refused. */
  onBroken: boolean = false;
  /** Allowed on a broken item (carrying it about, dismantling it); every other action naming one in `item`, `fruit` or `weapon` is refused. Repair is `onBroken`. */
  onBrokenItem: boolean = false;

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
  cost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): ActionCost {
    return actionCost(this.getCost(state, player, target), this.context(state, player, target));
  }

  /** What modifiers see of this action (modifiers.ts). */
  private context(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): CostContext {
    // Every T is a member of the Action union; share.ts and transfer.ts are generic over the type name, so TS can't see it.
    return { state, actor: player, action: target as unknown as AnyAction, tags: this.tagsFor(state, target) };
  }

  /** How far modifiers move the price from `getCost` (can be negative). Queued actions compare it (queue.ts). */
  adjustment(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): { ap: number; mp: number } {
    const base = this.getCost(state, player, target);
    const cost = this.cost(state, player, target);
    return { ap: cost.ap - base.ap, mp: cost.mp - base.mp };
  }

  getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): ActionCost {
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

  /**
   * The per-miss multiplier on this action's failure streak, before modifiers (Persistent raises it). Defaults to
   * `config.failureMultiplier`; an action with its own number in the config overrides this.
   */
  getFailureMultiplier(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return state.config.failureMultiplier;
  }

  /** This player's failures in a row at this type of action. */
  failureStreak(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    return state.failureStreaks[player.id]?.[this.type] ?? 0;
  }

  /**
   * The odds the player sees and rolls: `getSuccessChance` raised by the failure streak (every try missed in a row
   * multiplies it by the failure multiplier, capped at certain), then adjusted by modifiers. Done here once, so no
   * action repeats it.
   */
  chance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    const base = this.getSuccessChance(state, player, target);
    const streak = this.failureStreak(state, player);
    const streaked = streak === 0 ? base : Math.min(1, base * failureStreakMultiplier(state, player, this.getFailureMultiplier(state, player, target)) ** streak);
    return actionSuccessRate(streaked, this.context(state, player, target));
  }

  /** Extends or clears the player's streak after the roll (performAction): a success resets it, a miss adds one. */
  recordOutcome(state: GameState, player: PlayerState, succeeded: boolean): void {
    const streaks = (state.failureStreaks[player.id] ??= {});
    if (succeeded) delete streaks[this.type];
    else streaks[this.type] = (streaks[this.type] ?? 0) + 1;
    if (Object.keys(streaks).length === 0) delete state.failureStreaks[player.id];
  }

  dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  injuryChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  /** Runs when the action's injury roll triggers and isn't blocked by gloves (after damage). */
  onInjury(state: GameState, player: PlayerState, target: T): void {}

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
    return this.refusedBroken(state, player, target) ?? this.refusedCeasefire(state, player, target) ?? this.refusedMute(state, player, target) ?? this.validate(state, player, target) ?? this.canAfford(state, player, target);
  }

  /** Active Ceasefire in the room blocks all `aggressive`-tagged actions (owner, 2026-11-17). */
  private refusedCeasefire(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    if ((state.ceasefires[player.room] ?? 0) > 0 && this.tagsFor(state, target).includes("aggressive")) return "ceasefire";
    return null;
  }

  /** A mute player (Torn Tongue) can't do any `talking`-tagged action (owner, 2026-11-17). */
  private refusedMute(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    return isMute(player) && this.tagsFor(state, target).includes("talking") ? "cant_speak" : null;
  }

  /** Broken equipment does nothing (owner, 2026-10-25): no action on it but those marked `onBroken`. Nor does a broken item (owner, 2026-11-07), but `onBrokenItem` ones can still move or dismantle it. */
  private refusedBroken(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    if (this.onBroken) return null;
    const named = target as { equipment?: unknown; item?: unknown; fruit?: unknown; weapon?: unknown };
    if (typeof named.equipment === "string" && isBrokenIn(state, player.room, named.equipment)) return BROKEN;
    if (this.onBrokenItem) return null;
    return [named.item, named.fruit, named.weapon].some((id) => typeof id === "string" && state.items.find((i) => i.id === id)?.broken) ? BROKEN : null;
  }

  /** Cycles until a `cooldown` refusal clears, for showing the action disabled with the wait. */
  cooldownLeft(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): number {
    return 0;
  }

  /** The action's own conditions, apart from the price: an error code, or null if it may go ahead. */
  validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: T): string | null {
    return null;
  }

  apply(state: GameState, player: PlayerState, target: T, cost?: ActionCost): void {
    return;
  }

  /** The effect when the success roll fails (the cost stays paid). */
  fail(state: GameState, player: PlayerState, target: T): void {
    return;
  }
}