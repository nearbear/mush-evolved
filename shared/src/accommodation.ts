import type { GameState, PlayerId, PlayerState } from "./types.ts";

// The wheelchair push's state helpers (see actions/accommodate.ts for the rules). They live outside the actions so
// death.ts can end a push without importing action classes, which would make an import cycle through modifiers.ts.

/** Whoever this player is pushing, if anyone. */
export const pushing = (state: Readonly<GameState>, p: Readonly<PlayerState>): PlayerState | undefined =>
  state.players.find((o) => o.pushedBy === p.id);

export const offeredBy = (p: Readonly<PlayerState>, by: PlayerId): boolean => !!p.accommodationOffers?.some((o) => o.by === by);

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
