// ---- Room log -------------------------------------------------------------
// Four kinds of entry (rules from 2026-10-11; cameras and covert from 2026-10-17):
//   public:  part of the room's history; anyone in the room sees it, then or later.
//   private: only the actor ever sees it.
//   secret:  becomes room history if someone else was there to witness it, or
//            a camera was in the room; otherwise only the actor sees it.
//   covert:  bystanders don't see it; it becomes room history only if a camera
//            was in the room; otherwise only the actor sees it.
// A camera is `CAMERA` room equipment, put there by `install` (#35). A `camera`
// item, lying in a room or carried, is not a camera yet.
// Each entry records its kind (`LogEntry.kind`, from the writer, not the action type: a private research's completion
// line is public) and, for secret and covert, whether it leaked (owner, 2026-11-05, #366).
// A private list names bodies, which never change, so a private line stays with
// the body across a Transfer (owner, 2026-11-05, #281) and the log only grows.

import type { ActionVisibility } from "./actions/action.ts";
import { CAMERA_EQUIPMENT } from "./equipment.ts";
import { rollFloat } from "./rng.ts";
import { hasSkill } from "./skills.ts";
import type { GameState, LogEntry, LogParams, PlayerId, PlayerState, RoomId } from "./types.ts";

/** Appends `entry` with the next id and the current cycle. Every log line goes through here. Mutates a state the caller already cloned. */
export function pushLog(state: GameState, entry: Omit<LogEntry, "id" | "cycle">): void {
  const line: LogEntry = { id: state.nextLogId++, cycle: state.cycle, ...entry };
  state.log.push(line);
  for (const p of state.players) if (seesLine(line, p)) p.logSeen += 1;
}

/**
 * Whether `you` see `e` at all, window aside: the room's public history while you are in it, every line private to
 * you, and the ship-wide lines. The dead keep only ship-wide public lines (decided 2026-10-16, #45); every room line,
 * their own private ones included, goes.
 */
export function seesLine(e: Readonly<LogEntry>, you: Readonly<Pick<PlayerState, "id" | "alive" | "room">>): boolean {
  if (!you.alive) return e.room === undefined && e.visibleTo === "all";
  return e.visibleTo === "all" ? e.room === undefined || e.room === you.room : e.visibleTo.includes(you.id);
}

/**
 * How many cycles of room log `you` see (#365): `logWindow.tracker` with the Tracker skill (`hunt`, picked or from a
 * book), else `logWindow.cycles`. A room line shows while its cycle is within the window (`inLogWindow`).
 */
export function logWindowOf(state: Readonly<GameState>, you: Readonly<PlayerState>): number {
  return hasSkill(you, "hunt") ? state.config.logWindow.tracker : state.config.logWindow.cycles;
}

/** Whether `e` is inside a window of `cycles`: the current cycle and the `cycles - 1` before it. Ship-wide lines always are. */
export function inLogWindow(state: Readonly<GameState>, e: Readonly<LogEntry>, cycles: number): boolean {
  return e.room === undefined || e.cycle > state.cycle - cycles;
}

/**
 * Drops room lines no window can show any more (owner, 2026-11-05, #365), so the state and every view stop growing
 * with the game. Ship-wide lines stay. The record keeps every line: each input's step in the history has it. Called as
 * each cycle begins. Mutates a state the caller already cloned.
 */
export function pruneLog(state: GameState): void {
  const longest = Math.max(state.config.logWindow.cycles, state.config.logWindow.tracker);
  state.log = state.log.filter((e) => inLogWindow(state, e, longest));
}

/**
 * Starts `p`'s `logSeen` at the lines their view shows now: at launch, on boarding in pre-selection, and for both
 * bodies in a Transfer, so a new occupant never learns how many lines the body saw before (lines that left the window
 * included). The client starts over when its body changes, so nothing is announced.
 */
export function startLogSeen(state: Readonly<GameState>, p: PlayerState): void {
  const window = logWindowOf(state, p);
  p.logSeen = state.log.filter((e) => seesLine(e, p) && inLogWindow(state, e, window)).length;
}

let nimbleActorId: PlayerId | null = null;

/**
 * Runs `fn` with `actor` marked as acting in Nimble mode: any room-level `logPublic` call (`room !== undefined`)
 * becomes `logSecretIn` for `actor` in that room. Ship-wide announcements (`room === undefined`) stay public.
 */
export function withNimbleActor<T>(actor: PlayerId, fn: () => T): T {
  const prev = nimbleActorId;
  nimbleActorId = actor;
  try {
    return fn();
  } finally {
    nimbleActorId = prev;
  }
}

/** Mutates a state that the caller already cloned. */
export function logPublic(state: GameState, room: RoomId | undefined, key: string, params?: LogParams, level?: "warning"): void {
  if (room !== undefined && nimbleActorId !== null) {
    logSecretIn(state, nimbleActorId, room, key, params);
    return;
  }
  pushLog(state, { key, ...(params && { params }), ...(room !== undefined && { room }), visibleTo: "all", ...(level && { level }) });
}

/** Mutates a state that the caller already cloned. */
export function logPrivate(state: GameState, actor: PlayerId, key: string, params?: LogParams): void {
  const p = state.players.find((pl) => pl.id === actor);
  pushLog(state, { key, ...(params && { params }), ...(p && { room: p.room }), visibleTo: [actor], kind: "private" });
}

/**
 * Mutates a state that the caller already cloned. `hideFrom` is someone who must
 * not see the entry even if present: when it is set and there are witnesses but no
 * camera, the entry goes to the actor and those witnesses only. A camera shows it
 * to everyone, `hideFrom` included.
 */
export function logSecret(state: GameState, actor: PlayerId, key: string, params?: LogParams, hideFrom?: PlayerId): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  logSecretIn(state, actor, p.room, key, params, hideFrom);
}

/**
 * Same as `logSecret`, but evaluates witnesses and cameras in `room` explicitly (used for `move` in Nimble mode,
 * where `left` is logged in `from` after `player.room` has already changed to `to`).
 */
export function logSecretIn(
  state: GameState,
  actor: PlayerId,
  room: RoomId,
  key: string,
  params?: LogParams,
  hideFrom?: PlayerId,
): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  if (p.outcastBy !== undefined) {
    outcastLine(state, room, "secret", key, params);
    return;
  }
  const witnesses = state.players.filter((o) => o.id !== actor && o.alive && o.room === room && o.id !== hideFrom);
  const witnessed = hideFrom === undefined ? state.players.some((o) => o.id !== actor && o.alive && o.room === room) : witnesses.length > 0;
  const visibleTo = cameraSees(state, room, params) ? "all" : !witnessed ? [actor] : hideFrom === undefined ? "all" : [actor, ...witnesses.map((o) => o.id)];
  pushLog(state, { key, ...(params && { params }), room, visibleTo, kind: "secret", ...spilled(visibleTo) });
}

/**
 * Mutates a state that the caller already cloned. Room history only if a camera saw it, or an Observant noticed it:
 * each living Observant in the room other than the actor rolls `observant.revealChance` in turn (owner, 2026-11-14,
 * eMushpedia Observateur), and the first who succeeds makes it room history, like a camera, and adds a public line
 * naming them. No roll when a camera already shows it. A Mush Observant never reveals their own covert actions.
 */
export function logCovert(state: GameState, actor: PlayerId, key: string, params?: LogParams): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  if (p.outcastBy !== undefined) {
    outcastLine(state, p.room, "covert", key, params);
    return;
  }
  const noticer = cameraSees(state, p.room, params) ? undefined : observantNotices(state, p);
  const visibleTo = cameraSees(state, p.room, params) || noticer ? "all" : [actor];
  pushLog(state, { key, ...(params && { params }), room: p.room, visibleTo, kind: "covert", ...spilled(visibleTo) });
  if (noticer) logPublic(state, p.room, "observantNoticed", { name: noticer.character });
}

/** The first living Observant in the actor's room, other than the actor, whose reveal roll succeeds. Rolls the seeded RNG once per Observant tried. */
function observantNotices(state: GameState, actor: Readonly<PlayerState>): PlayerState | undefined {
  const observants = state.players.filter((o) => o.id !== actor.id && o.alive && o.room === actor.room && hasSkill(o, "observant"));
  return observants.find(() => rollFloat(state) < state.config.observant.revealChance);
}

/**
 * Whether a camera in the room shows this secret or covert entry. Not when the entry's `equipment` is an installed
 * camera: a camera can't reveal an action aimed at itself (owner, 2026-11-07), e.g. sabotaging or jellying it.
 */
function cameraSees(state: Readonly<GameState>, room: RoomId, params?: LogParams): boolean {
  return hasCamera(state, room) && params?.equipment !== CAMERA_EQUIPMENT;
}

/** A secret or covert entry that reached anyone besides the actor is leaked, and a warning. One only the actor sees is neither. */
function spilled(visibleTo: LogEntry["visibleTo"]): { leaked?: true; level?: "warning" } {
  return visibleTo === "all" || visibleTo.length > 1 ? { leaked: true, level: "warning" } : {};
}

/**
 * An Outcast's secret or covert entry: their stealth is gone (anathema.ts), so it is public room history, leaked but
 * not a warning (owner, 2026-11-08, #366: "leaks and nothing else").
 */
function outcastLine(state: GameState, room: RoomId, kind: "secret" | "covert", key: string, params?: LogParams): void {
  pushLog(state, { key, ...(params && { params }), room, visibleTo: "all", kind, leaked: true });
}

/**
 * Whether someone in the actor's room sees them busy with an action of this visibility (its bar): exactly when the
 * action's log entry could reach them. A witness always sees public and secret entries, covert ones only on camera.
 */
export function activitySeen(state: Readonly<GameState>, room: RoomId, visibility: ActionVisibility, actor?: Readonly<PlayerState>): boolean {
  // An Outcast's stealth is gone (anathema.ts): their covert and secret entries are public room history.
  if (actor?.outcastBy !== undefined && visibility !== "private") return true;
  return visibility === "public" || visibility === "secret" || (visibility === "covert" && hasCamera(state, room));
}

export function hasCamera(state: Readonly<GameState>, room: RoomId): boolean {
  return (state.equipment[room] ?? []).some((e) => e.type === CAMERA_EQUIPMENT && !e.broken);
}
