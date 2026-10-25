import { Action, peopleHere } from "./action.ts";
import { getUp } from "./lie_down.ts";
import { endsAccommodation } from "../actionTarget.ts";
import { logPublic } from "../log.ts";
import { arrive } from "../spot.ts";
import type { Action as AnyAction, GameState, PlayerId, PlayerState } from "../types.ts";
import type { ActionVisibility } from "./action.ts";

// Pushing someone's wheelchair (owner, 2026-10-19). Terrence starts with the `wheelchair` modifier. Anyone else in
// his room may offer to push him (free); the push starts only when he accepts one offer, within
// `accommodate.offerMs` (5 minutes) of server time, after which it lapses silently. While pushed he can't
// move on his own; when his pusher moves, he goes along at no cost to himself, and the pusher pays a normal move.
// Either of them can stop it at any time (free and instant, not queued), and it ends if either dies. Offer, start and stop go in the
// room's public log; roommates see the `accommodated` status and who is pushing (`OtherPlayerView.pushedBy`).
// Either of them sending a public action on equipment or another person also ends it (`endAccommodationToAct`).

export type AccommodateActionData = { type: "accommodate"; target: PlayerId };
export type AcceptAccommodationActionData = { type: "accept_accommodation"; target: PlayerId };
export type StopAccommodationActionData = { type: "stop_accommodation"; target: PlayerId };

export const needsWheelchair = (p: Readonly<PlayerState>): boolean => p.modifiers.includes("wheelchair");

/** Whoever this player is pushing, if anyone. */
export const pushing = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState | undefined =>
  state.players.find((o) => o.pushedBy === p.id);

const offeredBy = (p: Readonly<PlayerState>, by: PlayerId): boolean => !!p.accommodationOffers?.some((o) => o.by === by);

/** Offers this person could accept now: not expired, and the offerer is alive, here, and not already pushing someone. */
const liveOffers = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState[] =>
  peopleHere(state, p).filter((o) => p.accommodationOffers?.some((x) => x.by === o.id && x.until > state.now) && !pushing(state, o));

/** Drops offers whose time has run out (`tick` in queue.ts, at `state.now`). Mutates a state the caller cloned. */
export function expireOffers(state: GameState): void {
  for (const p of state.players) {
    if (!p.accommodationOffers) continue;
    p.accommodationOffers = p.accommodationOffers.filter((o) => o.until > state.now);
    if (p.accommodationOffers.length === 0) delete p.accommodationOffers;
  }
}

/**
 * Someone left the room or died: their offers lapse, and so do offers made to them. A push they were part of ends
 * (death only; a pusher's move takes the pushed person along, see `MoveAction`). Mutates a state the caller cloned.
 */
export function leaveAccommodation(state: GameState, p: PlayerState): void {
  delete p.accommodationOffers;
  for (const o of state.players) {
    if (offeredBy(o, p.id)) {
      o.accommodationOffers = o.accommodationOffers!.filter((x) => x.by !== p.id);
      if (o.accommodationOffers.length === 0) delete o.accommodationOffers;
    }
  }
}

/** Ends a push when either side dies (death.ts). No log line: the death line says enough. */
export function endAccommodationOnDeath(state: GameState, dead: PlayerState): void {
  delete dead.pushedBy;
  const pushed = pushing(state, dead);
  if (pushed) delete pushed.pushedBy;
  leaveAccommodation(state, dead);
}

/** Ends `pushed`'s push, with the public log line the stop action writes. Mutates a cloned state. */
function endPush(state: GameState, pushed: PlayerState): void {
  const pusher = state.players.find((o) => o.id === pushed.pushedBy)!;
  delete pushed.pushedBy;
  logPublic(state, pushed.room, "accommodationEnded", { name: pusher.character, target: pushed.character });
}

/**
 * `p` sent `action`: if it walks them up to equipment or another person in public (`endsAccommodation`), a push they
 * are part of, pushing or pushed, ends then and there (owner, 2026-10-24). Mutates a cloned state.
 */
export function endAccommodationToAct(state: GameState, p: PlayerState, action: AnyAction, visibility: ActionVisibility): void {
  const pushed = p.pushedBy !== undefined ? p : pushing(state, p);
  if (pushed && endsAccommodation(action, p.id, visibility)) endPush(state, pushed);
}

/**
 * `p` leaves the room without their partner (taking off in a patrol ship): a push they are part of, pushing or pushed,
 * ends with its public line, and their offers lapse (owner, 2026-10-24). Mutates a cloned state.
 */
export function endPushToLeave(state: GameState, p: PlayerState): void {
  const pushed = p.pushedBy !== undefined ? p : pushing(state, p);
  if (pushed) endPush(state, pushed);
  leaveAccommodation(state, p);
}

/** The pusher has moved: the person they push goes with them, out of bed, and both rooms see them go and arrive. */
export function wheelAlong(state: GameState, pusher: PlayerState, from: string): void {
  const pushed = pushing(state, pusher);
  if (!pushed) return;
  getUp(pushed);
  pushed.room = pusher.room;
  arrive(pushed, from);
  logPublic(state, from, "left", { name: pushed.character, room: pusher.room });
  logPublic(state, pusher.room, "entered", { name: pushed.character, room: from });
}

export class AccommodateAction extends Action<AccommodateActionData> {
  constructor() {
    super("accommodate");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.accommodate.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AccommodateActionData[] {
    return peopleHere(state, player)
      .filter(needsWheelchair)
      .map((o) => ({ type: "accommodate", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AccommodateActionData): string | null {
    const other = peopleHere(state, player).find((o) => o.id === target.target);
    if (!other || !needsWheelchair(other)) return "cant_accommodate";
    if (other.pushedBy !== undefined || pushing(state, player)) return "already_accommodating";
    if (offeredBy(other, player.id)) return "already_offered";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AccommodateActionData): void {
    const other = state.players.find((o) => o.id === target.target)!;
    (other.accommodationOffers ??= []).push({ by: player.id, until: state.now + state.config.accommodate.offerMs });
    logPublic(state, player.room, "accommodationOffered", { name: player.character, target: other.character });
  }
}

export class AcceptAccommodationAction extends Action<AcceptAccommodationActionData> {
  constructor() {
    super("accept_accommodation");
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AcceptAccommodationActionData[] {
    return liveOffers(state, player).map((o) => ({ type: "accept_accommodation", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AcceptAccommodationActionData): string | null {
    if (player.pushedBy !== undefined) return "already_accommodating";
    if (!liveOffers(state, player).some((o) => o.id === target.target)) return "no_offer";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AcceptAccommodationActionData): void {
    const pusher = state.players.find((o) => o.id === target.target)!;
    player.pushedBy = pusher.id;
    delete player.accommodationOffers;
    logPublic(state, player.room, "accommodated", { name: pusher.character, target: player.character });
  }
}

export class StopAccommodationAction extends Action<StopAccommodationActionData> {
  // Happens at once, skipping the queue (owner, 2026-10-19).
  override timed = false;

  constructor() {
    super("stop_accommodation");
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  /** On yourself while you are pushed; on the person you push while you push. */
  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): StopAccommodationActionData[] {
    const pushed = player.pushedBy !== undefined ? player : pushing(state, player);
    return pushed ? [{ type: "stop_accommodation", target: pushed.id }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: StopAccommodationActionData): string | null {
    const pushed = state.players.find((o) => o.id === target.target);
    if (!pushed || pushed.pushedBy === undefined || (pushed.id !== player.id && pushed.pushedBy !== player.id)) return "not_accommodating";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: StopAccommodationActionData): void {
    endPush(state, state.players.find((o) => o.id === target.target)!);
  }
}
