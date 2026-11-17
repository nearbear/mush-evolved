// ---- Timed actions --------------------------------------------------------
// Decided 2026-10-17 (owner). Every action but ready and access takes
// `config.action.durationMs` of server time. A player has at most one action
// under way (`current`, drawn as a bar over their head) and up to
// `config.action.queueCap` waiting behind it (`queue`). With `resolveAt: "end"`
// an action happens when its bar runs out, and is checked again and paid for
// then; a dropped or cleared action costs nothing. With "start" it happens at
// once and the bar is only a cooldown. An action whose modifier adjustment
// (Pacifist's surcharge, say) has changed since it was queued is cancelled when
// it starts or resolves, so nobody pays a price they didn't see (owner, 2026-10-18).
//
// The rules have no clock: the server stamps each action input with `at` and
// sends a `tick` input when the earliest bar runs out (`nextDue`).

import { ACTIONS, actionVisibility, type ActionDef } from "./actions.ts";
import { expeditionStep } from "./expeditions.ts";
import { endAccommodationToAct, expireOffers } from "./actions/accommodate.ts";
import { cloneState, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { logPrivate } from "./log.ts";
import { dropped, emptyQueue } from "./queueCore.ts";
import { getUp } from "./actions/lie_down.ts";
import { applyAction, canAct, performAction } from "./rules.ts";
import { standUp } from "./spot.ts";
import type { Action, GameState, PlayerId, PlayerState, QueuedAction } from "./types.ts";

/** A player asks to act: an untimed action happens now; a timed one starts if they are idle, or waits its turn. */
export function queueAction(state: GameState, playerId: PlayerId, action: Action, at: number): ActionResult {
  // The rules' clock; the state is cloned before anything is kept.
  state = { ...state, now: at };
  const p = findPlayer(state, playerId);
  const def: ActionDef<Action> | undefined = ACTIONS[action.type];
  if (!p || !def) return fail("illegal_action");
  if (!def.timed || p.cheats.includes("instantActions")) return actNow(state, playerId, action);
  // Checked against things as they are now, like the buttons the player pressed; checked again when its turn comes.
  if (!canAct(state, p) || def.check(state, p, action) !== null) return fail("illegal_action");
  if (p.current && p.queue.length >= state.config.action.queueCap) return fail("queue_full");
  const next = cloneState(state);
  const actor = findPlayer(next, playerId)!;
  if (action.type !== "lie_down") getUp(actor);
  const visibility = actionVisibility(action.type, actor);
  standUp(actor, { visibility });
  endAccommodationToAct(next, actor, action, visibility);
  // Priced against things as they are now, like the button the player pressed.
  const queued: QueuedAction = { action, adjustment: def.adjustment(state, p, action) };
  if (actor.current) actor.queue.push(queued);
  else begin(next, actor, [queued], at);
  return { ok: true, state: next };
}

/** Does an action at once, bypassing the queue: the untimed path of `queueAction`, with the same legality check, cost and hooks. */
export function actNow(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const def: ActionDef<Action> | undefined = ACTIONS[action.type];
  if (!def) return fail("illegal_action");
  const done = applyAction(state, playerId, action);
  if (done.ok) {
    const actor = findPlayer(done.state, playerId)!;
    const visibility = actionVisibility(action.type, actor);
    standUp(actor, { visibility });
    endAccommodationToAct(done.state, actor, action, visibility);
  }
  return done;
}

/**
 * Clear queue: drops everything waiting, and the action under way unless it has already happened ("start"). With
 * `notify`, the player gets an `actionDropped` line for each (the summons walk, which they didn't ask for); a player
 * clearing their own queue isn't told (owner, 2026-10-31).
 */
export function clearQueue(state: GameState, playerId: PlayerId, notify = false): ActionResult {
  const p = findPlayer(state, playerId);
  const cancelsCurrent = state.config.action.resolveAt === "end" && p?.current;
  if (!p || (!cancelsCurrent && p.queue.length === 0)) return fail("nothing_queued");
  const next = cloneState(state);
  emptyQueue(next, findPlayer(next, playerId)!, notify);
  return { ok: true, state: next };
}


/**
 * The server restarted and dropped every action under way and queued (#384, `normalizeGame`): the same here, so the
 * record rebuilds the state the server holds. Not `clearQueue` for each, which keeps an action already happened under
 * `resolveAt: "start"`; this matches the normalizer whatever the config. Nobody is told.
 */
export function dropQueues(state: GameState): ActionResult {
  if (!state.players.some((p) => p.current !== null || p.queue.length > 0)) return fail("nothing_queued");
  const next = cloneState(state);
  for (const p of next.players) Object.assign(p, { current: null, queue: [] });
  return { ok: true, state: next };
}

/**
 * Server time (ms) the earliest bar runs out, accommodation offer expires or expedition step is due, or null when nothing
 * is waiting.
 */
export function nextDue(state: Readonly<GameState>): number | null {
  const due = state.players.flatMap((p) => [...(p.current ? [p.current.until] : []), ...(p.accommodationOffers ?? []).map((o) => o.until)]);
  if (state.expedition && state.phase === "playing") due.push(state.expedition.nextAt);
  return due.length > 0 ? Math.min(...due) : null;
}

/**
 * Time has reached `at`: accommodation offers past their time lapse, then every bar that has run out ends (its
 * action happens, with "end") and that player's next queued action starts, and each expedition step due happens
 * (expeditions.ts). Earliest first, a step before a bar at the same time, then bars in seat order, so a replay settles
 * ties the same way.
 */
export function tick(state: GameState, at: number): ActionResult {
  const stepDue = (s: Readonly<GameState>): boolean => s.phase === "playing" && s.expedition !== null && s.expedition.nextAt <= at;
  const due = state.players
    .filter((p) => p.current && p.current.until <= at)
    .sort((a, b) => a.current!.until - b.current!.until)
    .map((p) => p.id);
  const lapsing = state.players.some((p) => p.accommodationOffers?.some((o) => o.until <= at));
  if (due.length === 0 && !lapsing && !stepDue(state)) return fail("nothing_due");
  const next = cloneState(state);
  next.now = at;
  expireOffers(next);
  for (const id of due) {
    const actor = findPlayer(next, id)!;
    // Expedition steps due by the time this bar ended happen first.
    while (stepDue(next) && next.expedition!.nextAt <= (actor.current?.until ?? at)) expeditionStep(next);
    const finished = actor.current;
    if (!finished) continue; // cleared by something earlier in this tick (a death)
    actor.current = null;
    if (next.config.action.resolveAt === "end") {
      if (repriced(next, actor, finished)) costChanged(next, actor, finished.action);
      else if (!performAction(next, actor, finished.action)) dropped(next, actor, finished.action);
    }
    begin(next, actor, actor.queue.splice(0), at);
  }
  while (stepDue(next)) expeditionStep(next);
  return { ok: true, state: next };
}

/**
 * Starts the first of `actions` that is still legal, dropping the ones before it; the rest go back in the queue.
 * Mutates a state the caller already cloned.
 */
function begin(next: GameState, actor: PlayerState, actions: QueuedAction[], at: number): void {
  while (actions.length > 0 && actor.alive && next.phase === "playing") {
    const queued = actions.shift()!;
    const { action } = queued;
    const def: ActionDef<Action> = ACTIONS[action.type];
    if (repriced(next, actor, queued)) {
      costChanged(next, actor, action);
      continue;
    }
    const legal = next.config.action.resolveAt === "start" ? performAction(next, actor, action) : def.check(next, actor, action) === null;
    if (!legal) {
      dropped(next, actor, action);
      continue;
    }
    actor.current = { ...queued, since: at, until: at + next.config.action.durationMs };
    actor.queue = actions;
    return;
  }
  actor.queue = [];
}

/**
 * Whether modifiers now move the price differently from when it was queued. Only the adjustment counts: base-price
 * changes the player's own queue causes (a move's AP-to-MP conversion, a care point used up) don't cancel.
 */
function repriced(state: Readonly<GameState>, actor: Readonly<PlayerState>, queued: QueuedAction): boolean {
  const now = (ACTIONS[queued.action.type] as ActionDef<Action>).adjustment(state, actor, queued.action);
  return now.ap !== queued.adjustment.ap || now.mp !== queued.adjustment.mp;
}

/** A queued action cancelled because its price changed. Only the actor is told, with what it would cost now. */
function costChanged(next: GameState, actor: PlayerState, action: Action): void {
  const cost = (ACTIONS[action.type] as ActionDef<Action>).cost(next, actor, action);
  if (actor.alive) logPrivate(next, actor.id, "actionCostChanged", { action: action.type, ap: cost.ap, mp: cost.mp });
}
