// The base hostile NPC (owner, 2026-11-22). A hostile is a creature aboard with HP, AP and MP like a player's, kept in
// `GameState.hostiles` (never `players`, so nothing that counts the crew counts it). Its state is plain JSON; what it
// does lives in a class: `HostileNpc` is the base, and each kind (intruder.ts, ...) extends it and is registered by
// `kind` in `HOSTILE_KINDS` (hostiles.ts), as actions are in `ACTIONS`. Players hit it with Punch, Attack and Throw Out.
//
// Its turn comes at each cycle change: it regains AP and MP like a player, then spends AP on its own actions
// (`HostileAction`, actions/) until none is affordable or it has taken `actionsPerTurn`. Its actions so far are Move
// and Punch. Pure: every roll draws from the game's seeded `rng`.

import type { HostileAction, HostileOption } from "./actions/action.ts";
import { HOSTILE_MOVE } from "./actions/move.ts";
import { HOSTILE_PUNCH } from "./actions/punch.ts";
import { roomActionCost, targetedSuccessRate } from "../modifiers.ts";
import { rollFloat, rollInt } from "../rng.ts";
import type { Action, DeepReadonly, GameState, HostileStats, RoomId } from "../types.ts";

/** A hostile NPC as stored. `kind` names its class in `HOSTILE_KINDS` and its stats in `config.hostiles.kinds`. */
export interface HostileState {
  /** `hostile:<n>`: never a player's id, so an action's `target` says which it is (`isHostileId`). */
  id: string;
  kind: string;
  room: RoomId;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  mp: number;
  maxMp: number;
  /** The room it came in from by a door (its own Move, or being thrown out); unset if it came another way. A guardian reads it (actions/move.ts). */
  enteredFrom?: RoomId;
}

export const HOSTILE_ID_PREFIX = "hostile:";

export const isHostileId = (id: string): boolean => id.startsWith(HOSTILE_ID_PREFIX);

/** A turn never runs more actions than this, so a kind with a free action can't loop forever. */
const MAX_ACTIONS_PER_TURN = 50;

/**
 * The base of every hostile kind. A subclass sets `kind` and overrides what differs: which actions it has
 * (`actions`), how it picks one (`choose`), and what happens when it dies (`onDeath`).
 */
export abstract class HostileNpc {
  abstract readonly kind: string;

  /** This kind's numbers, from config so they stay tunable. */
  stats(state: Readonly<GameState>): DeepReadonly<HostileStats> {
    const stats = state.config.hostiles.kinds[this.kind];
    if (!stats) throw new Error(`No config for hostile kind ${this.kind}`);
    return stats;
  }

  /** A new one of this kind in `room`, with its starting stats. */
  create(state: Readonly<GameState>, id: string, room: RoomId): HostileState {
    const s = this.stats(state);
    return { id, kind: this.kind, room, hp: s.hp, maxHp: s.hp, ap: s.startAp, maxAp: s.maxAp, mp: s.startMp, maxMp: s.maxMp };
  }

  /** How many actions it may take in one turn; AP permitting. The base has no limit but `MAX_ACTIONS_PER_TURN`. */
  readonly actionsPerTurn: number = MAX_ACTIONS_PER_TURN;

  /** The actions this kind can take: Move and Punch in the base. A kind adds its own, or leaves one out. */
  actions(): readonly HostileAction[] {
    return [HOSTILE_PUNCH, HOSTILE_MOVE];
  }

  /** Picks one of the affordable options, or null to end the turn early. The base picks uniformly at random. */
  choose(state: GameState, _self: Readonly<HostileState>, options: readonly HostileOption[]): HostileOption | null {
    return options.length === 0 ? null : options[rollInt(state, options.length)]!;
  }

  /** Its regain at a cycle change, as a player's (`apPerCycle`, `mpPerCycle`), capped at its max. */
  regen(state: Readonly<GameState>, self: HostileState): void {
    const s = this.stats(state);
    self.ap = Math.min(self.maxAp, self.ap + s.apPerCycle);
    self.mp = Math.min(self.maxMp, self.mp + s.mpPerCycle);
  }

  /**
   * What an option costs once the room has had its say, as a player's action does: the `roomActionCost` hooks of
   * everyone in its room (Pacifist, Bodyguard). Its own `actionCost` hooks don't exist: a hostile has no modifiers.
   */
  price(state: Readonly<GameState>, self: Readonly<HostileState>, { action, data }: HostileOption): { ap: number; mp: number } {
    const cost = roomActionCost(action.cost(state, self, data), this.context(state, self, { action, data }));
    return { ap: Math.max(0, cost.ap), mp: Math.max(0, cost.mp) };
  }

  /** Its odds once the target has had its say (Elusive), as a player's; a sure thing stays sure. */
  chance(state: Readonly<GameState>, self: Readonly<HostileState>, { action, data }: HostileOption): number {
    const base = action.successChance(state, self, data);
    return base >= 1 ? 1 : targetedSuccessRate(base, this.context(state, self, { action, data }));
  }

  /** What room and target hooks see of a hostile's action: no player actor, its room, and its data (a player action's shape). */
  private context(state: Readonly<GameState>, self: Readonly<HostileState>, { action, data }: HostileOption) {
    return { state, actor: null, room: self.room, action: data as Action, tags: action.tags };
  }

  /** Every option it can afford now, from each of its actions' candidates. No aggressive one while a Ceasefire holds its room. */
  options(state: Readonly<GameState>, self: Readonly<HostileState>): HostileOption[] {
    const ceasefire = (state.ceasefires[self.room] ?? 0) > 0;
    return this.actions()
      .filter((action) => !(ceasefire && action.tags.includes("aggressive")))
      .flatMap((action) => action.candidates(state, self).map((data) => ({ action, data })))
      .filter((option) => {
        const cost = this.price(state, self, option);
        return cost.ap <= self.ap && cost.mp <= self.mp;
      });
  }

  /**
   * Its turn at a cycle change: regain, then act until it can't afford anything, `choose` ends it, it dies, or the game
   * ends. Mutates a state the caller already cloned.
   */
  turn(state: GameState, id: string): void {
    const start = state.hostiles.find((h) => h.id === id);
    if (!start) return;
    this.regen(state, start);
    for (let i = 0; i < Math.min(this.actionsPerTurn, MAX_ACTIONS_PER_TURN); i++) {
      // Looked up again each time: an action may kill or remove it.
      const self = state.hostiles.find((h) => h.id === id);
      if (!self || state.phase !== "playing" || state.preselection) return;
      const pick = this.choose(state, self, this.options(state, self));
      if (!pick) return;
      const cost = this.price(state, self, pick);
      self.ap -= cost.ap;
      self.mp -= cost.mp;
      const chance = this.chance(state, self, pick);
      if (chance >= 1 || rollFloat(state) < chance) pick.action.apply(state, self, pick.data);
      else pick.action.fail(state, self, pick.data);
    }
  }

  /** What else happens when it dies, after it is removed and its death is logged. Nothing for the base. */
  onDeath(_state: GameState, _self: Readonly<HostileState>): void {}
}
