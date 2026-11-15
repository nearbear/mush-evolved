// The summons (docs/plans/on-call.md, owner 2026-10-30): a plan's author, standing in its room, presses Go once and
// the game walks each on-call holder there. The walk is the only thing the game ever does on an absent player's behalf,
// and it is the live `move`, door by door, paying as live, with the same log lines.

import { isString } from "./action.ts";
import { PlanAction, authorRefusal } from "./plan_slots.ts";
import { endAccommodationToAct } from "./accommodate.ts";
import { getUp } from "./lie_down.ts";
import { MoveAction, type MoveActionData } from "./move.ts";
import { findPlayer } from "../helpers.ts";
import { logPrivate } from "../log.ts";
import { shortestPath } from "../paths.ts";
import { doorId, doorsOf } from "../doors.ts";
import { findPlan, finishPlan } from "../plans.ts";
import { emptyQueue } from "../queueCore.ts";
import { standUp } from "../spot.ts";
import type { DoorId, GameState, Plan, PlayerId, PlayerState, RoomId } from "../types.ts";

/**
 * `performAction` (rules.ts), bound by rules.ts as it loads. Importing it here would make an import cycle (rules.ts
 * and queue.ts import the registry, which imports this file); a summons only ever runs inside `performAction`, so it is
 * always bound by then.
 */
let perform: ((next: GameState, actor: PlayerState, action: MoveActionData) => boolean) | null = null;
export function bindPerformAction(fn: (next: GameState, actor: PlayerState, action: MoveActionData) => boolean): void {
  perform = fn;
}

const MOVE = new MoveAction();

/** One live step: `performAction` with `actNow`'s hooks (queue.ts), on a state the caller already cloned. */
function step(state: GameState, holder: PlayerState, move: MoveActionData): boolean {
  if (!perform!(state, holder, move)) return false;
  standUp(holder, MOVE);
  endAccommodationToAct(state, holder, move, MOVE.visibility);
  return true;
}

export type SummonActionData = { type: "summon"; plan: string };

/** Why a walk stopped, as the private log key the holder gets. Any other refusal of a move gets the generic one. */
const STOP_KEYS: Record<string, string> = {
  cant_afford: "summonStoppedCantAfford",
  not_adjacent: "summonStoppedDoor",
  door_broken: "summonStoppedDoor",
  being_pushed: "summonStoppedPushed",
  no_path: "summonStoppedNoPath",
};

/**
 * Walks `holderId` to `to` (owner, 2026-10-30): already there counts as arrived. Otherwise their queue is dropped (each
 * with an `actionDropped` line), they get out of bed, and each door along `shortestPath` from where they stand now is
 * a live `move`, checked when they reach it. A refused or unaffordable step stops them there; doors already walked
 * stay walked. Only the holder learns why. Returns whether they arrived. Mutates a state the caller already cloned.
 *
 * Broken doors (#330): the holder knows only the doors of rooms they stand in on the way, so the route avoids those
 * and is worked out again in each room; a broken door further on is found only on reaching it, and walked around then.
 * The route never uses a door state the holder couldn't have seen.
 */
export function walk(state: GameState, holderId: PlayerId, to: RoomId): boolean {
  const holder = findPlayer(state, holderId);
  if (!holder?.alive) return false;
  if (holder.room !== to) {
    emptyQueue(state, holder, true);
    getUp(holder);
    const seen = new Set<DoorId>();
    // Each step either reaches a room one door nearer (on what the holder knows) or learns a broken door, so this
    // ends; the bound is only a guard.
    for (let guard = 0; holder.room !== to; guard++) {
      for (const door of doorsOf(state, holder.room)) if (door.broken) seen.add(door.id);
      const route = shortestPath(state.config.rooms, holder.room, to, (a, b) => !seen.has(doorId(a, b)));
      if (!route) return stopped(state, holder, to, "no_path");
      if (guard > 4 * Object.keys(state.config.rooms).length) return stopped(state, holder, to, "no_path");
      const move: MoveActionData = { type: "move", to: route[0]! };
      const refused = MOVE.check(state, holder, move);
      if (refused !== null || !step(state, holder, move)) return stopped(state, holder, to, refused ?? "cant_afford");
    }
  }
  logPrivate(state, holder.id, "summonArrived", { room: to });
  return true;
}

function stopped(state: GameState, holder: PlayerState, to: RoomId, reason: string): false {
  logPrivate(state, holder.id, STOP_KEYS[reason] ?? "summonStopped", { room: to });
  return false;
}

const hasOnCall = (plan: Readonly<Plan>): boolean => plan.slots.some((s) => s.kind === "onCall");

export class SummonAction extends PlanAction<SummonActionData> {
  constructor() {
    super("summon", { plan: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SummonActionData[] {
    return state.plans.filter((p) => authorRefusal(state, player, p.id) === null && hasOnCall(p)).map((p) => ({ type: "summon", plan: p.id }));
  }

  /**
   * Go is offered only in the plan's room, so who arrives is ordinary room presence to the author (owner, 2026-10-30),
   * and only on a plan with an on-call slot: a task list has nobody to summon (owner, 2026-10-31).
   */
  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SummonActionData): string | null {
    const refused = authorRefusal(state, player, target.plan);
    if (refused) return refused;
    const plan = findPlan(state, target.plan)!;
    if (!hasOnCall(plan)) return "plan_no_on_call";
    return plan.room === player.room ? null : "not_in_plan_room";
  }

  /** In slot order, each holder's whole walk before the next; summons once (`called`). */
  override apply(state: GameState, _player: PlayerState, target: SummonActionData): void {
    const plan = findPlan(state, target.plan)!;
    for (const slot of plan.slots) {
      if (slot.kind !== "onCall") continue;
      if (slot.holder === null) slot.outcome = "unclaimed";
      else slot.outcome = walk(state, slot.holder, plan.room) ? "arrived" : "stopped";
    }
    finishPlan(state, plan, "called");
  }
}
