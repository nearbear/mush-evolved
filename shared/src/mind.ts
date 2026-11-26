// ---- Minds and bodies ------------------------------------------------------
// A player (account, seat token, bot) is a mind playing a body, the PlayerState. Both are the same until a Mush's
// Transfer (actions/body_transfer.ts) swaps two bodies' minds (owner, 2026-10-24, rules-design.md "Transfer").
// Body ids stay put, so other players see no id change; the server resolves each seat to its body with `bodyOf`.

import { cloneState, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { startLogSeen } from "./log.ts";
import type { GameState, PlayerId, PlayerState } from "./types.ts";

/** The body a seat (`PlayerState.mind`) plays now: the one it started in until a Transfer moves it. */
export function bodyOf(state: Readonly<GameState>, mind: PlayerId): PlayerId | undefined {
  return state.players.find((p) => p.mind === mind)?.id;
}

/** What belongs to the player rather than the body, so it moves in a Transfer. Everything else stays with the body. */
const MIND_FIELDS = ["mind", "name", "isBot", "botKind", "role", "alpha", "mushSkills", "spores", "transferUsed", "epigeneticsUsed", "massMoulderingUsed", "fairyRingUsed", "fertileToday", "doormanToday", "delogToday", "radioHackToday", "bodyTakenBy", "cheats", "lastSeenAt"] as const;

/**
 * Swaps the minds of bodies `a` and `b`: the fields in MIND_FIELDS, the spike cooldown. Private log lines are
 * addressed to bodies and stay with them (owner, 2026-11-05, #281), so the log is not touched; each body's `logSeen` starts over. Both
 * bodies' actions are cancelled and neither is ready. Leaves role-dependent body state (contamination, satiety) to
 * the caller. Mutates a state the caller already cloned.
 */
export function swapMinds(state: GameState, a: PlayerState, b: PlayerState): void {
  swapFields(a, b, MIND_FIELDS);
  for (const spikes of [state.spikedOn, state.spikeCount]) {
    const [sa, sb] = [spikes[a.id], spikes[b.id]];
    delete spikes[a.id];
    delete spikes[b.id];
    if (sb !== undefined) spikes[a.id] = sb;
    if (sa !== undefined) spikes[b.id] = sa;
  }
  restartBodies(state, a, b);
}

/** What belongs to the seat itself (the account or bot), the least a seat can move with. */
const SEAT_FIELDS = ["mind", "name", "isBot", "botKind", "cheats", "lastSeenAt"] as const;

/**
 * Swaps the seats playing bodies `a` and `b` and nothing else (the swapCharacter cheat, actions/swap_character.ts):
 * each player takes over the other's character whole, role, spores and Mush skills included. Like `swapMinds`, both
 * bodies' actions are cancelled and their `logSeen` starts over. Mutates a state the caller already cloned.
 */
export function swapSeats(state: GameState, a: PlayerState, b: PlayerState): void {
  swapFields(a, b, SEAT_FIELDS);
  restartBodies(state, a, b);
}

function swapFields(a: PlayerState, b: PlayerState, fields: readonly string[]): void {
  const record = (p: PlayerState) => p as unknown as Record<string, unknown>;
  for (const field of fields) {
    const [va, vb] = [record(a)[field], record(b)[field]];
    if (vb === undefined) delete record(a)[field];
    else record(a)[field] = vb;
    if (va === undefined) delete record(b)[field];
    else record(b)[field] = va;
  }
}

/** A body changing hands: its actions are cancelled, it isn't ready, and the new occupant's unread count starts over. */
function restartBodies(state: GameState, a: PlayerState, b: PlayerState): void {
  for (const p of [a, b]) {
    p.current = null;
    p.queue = [];
    p.ready = false;
    delete p.hackedEquipment;
    startLogSeen(state, p); // the count of what the body saw before is not the new mind's (#365)
  }
}

/** The victim of a Transfer closes the pop-up naming who took their body. Cosmetic; it changes nothing else. */
export function acknowledgeTransfer(state: GameState, playerId: PlayerId): ActionResult {
  if (findPlayer(state, playerId)?.bodyTakenBy === undefined) return fail("nothing_to_acknowledge");
  const next = cloneState(state);
  delete findPlayer(next, playerId)!.bodyTakenBy;
  return { ok: true, state: next };
}
