// ---- Minds and bodies ------------------------------------------------------
// A player (account, seat token, bot) is a mind playing a body, the PlayerState. Both are the same until a Mush's
// Transfer (actions/body_transfer.ts) swaps two bodies' minds (owner, 2026-10-24, rules-design.md "Transfer").
// Body ids stay put, so other players see no id change; the server resolves each seat to its body with `bodyOf`.

import { clone, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { startLogSeen } from "./log.ts";
import type { GameState, PlayerId, PlayerState } from "./types.ts";

/** The body a seat (`PlayerState.mind`) plays now: the one it started in until a Transfer moves it. */
export function bodyOf(state: Readonly<GameState>, mind: PlayerId): PlayerId | undefined {
  return state.players.find((p) => p.mind === mind)?.id;
}

/** What belongs to the player rather than the body, so it moves in a Transfer. Everything else stays with the body. */
const MIND_FIELDS = ["mind", "name", "isBot", "botKind", "role", "alpha", "mushSkills", "spores", "transferUsed", "epigeneticsUsed", "massMoulderingUsed", "fertileToday", "doormanToday", "bodyTakenBy", "cheats", "lastSeenAt"] as const;

/**
 * Swaps the minds of bodies `a` and `b`: the fields in MIND_FIELDS, the spike cooldown. Private log lines are
 * addressed to bodies and stay with them (owner, 2026-11-05, #281), so the log is not touched; each body's `logSeen` starts over. Both
 * bodies' actions are cancelled and neither is ready. Leaves role-dependent body state (contamination, satiety) to
 * the caller. Mutates a state the caller already cloned.
 */
export function swapMinds(state: GameState, a: PlayerState, b: PlayerState): void {
  const record = (p: PlayerState) => p as unknown as Record<string, unknown>;
  for (const field of MIND_FIELDS) {
    const [va, vb] = [record(a)[field], record(b)[field]];
    if (vb === undefined) delete record(a)[field];
    else record(a)[field] = vb;
    if (va === undefined) delete record(b)[field];
    else record(b)[field] = va;
  }
  const [sa, sb] = [state.spikedOn[a.id], state.spikedOn[b.id]];
  delete state.spikedOn[a.id];
  delete state.spikedOn[b.id];
  if (sb !== undefined) state.spikedOn[a.id] = sb;
  if (sa !== undefined) state.spikedOn[b.id] = sa;
  for (const p of [a, b]) {
    p.current = null;
    p.queue = [];
    p.ready = false;
    startLogSeen(state, p); // the count of what the body saw before is not the new mind's (#365)
  }
}

/** The victim of a Transfer closes the pop-up naming who took their body. Cosmetic; it changes nothing else. */
export function acknowledgeTransfer(state: GameState, playerId: PlayerId): ActionResult {
  if (findPlayer(state, playerId)?.bodyTakenBy === undefined) return fail("nothing_to_acknowledge");
  const next = clone(state);
  delete findPlayer(next, playerId)!.bodyTakenBy;
  return { ok: true, state: next };
}
