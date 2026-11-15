// The Superkube (#170): the cheat room's testing machine. Each option is a `kube` cheat input, never an action, so it is
// not in `view.actions` and a bot (which only ever returns an Action) can't use it. The server refuses it unless cheats
// are allowed and the sender is a human in the cheat room; `applyKube` checks the last two again. Test tooling, not a
// game rule. Adding an option is one entry in `KUBE_OPS` plus its translations.

import { leaveAccommodation, pushing } from "./accommodation.ts";
import { getUp } from "./actions/lie_down.ts";
import { board } from "./actions/takeoff.ts";
import { updateMaxValues } from "./adjustStats.ts";
import { cheatItem } from "./cheatStock.ts";
import { CHEAT_ROOM } from "./cheatRoom.ts";
import { addDisease, removeDisease } from "./diseases.ts";
import { clone, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { allDoors, breakDoor } from "./doors.ts";
import { contaminate } from "./infection.ts";
import { ITEM_TYPES, newItemId, startCharges } from "./items.ts";
import { enterRoom, enteredRoom } from "./modifiers.ts";
import { logPublic } from "./log.ts";
import { inCraft } from "./patrol.ts";
import { addStatus, isImmune, type StatusId } from "./statuses.ts";
import { endGame, winnerOnArrival } from "./victory.ts";
import type { DeepReadonly, DoorId, GameConfig, GameState, PlayerId, PlayerState, RoomId } from "./types.ts";

/** What an option's argument is: nothing, a whole number, one of the ship's ailments, an item type, a room, or a door. */
export type KubeArgKind = "none" | "number" | "ailment" | "item" | "room" | "door";

/** The window's tabs. */
export type KubeGroup = "health" | "items" | "travel" | "destinations";

interface KubeOp {
  group: KubeGroup;
  arg: KubeArgKind;
  /** Mutates a cloned state for the player, with `arg` already checked against `arg`'s kind. An error code refuses. */
  apply: (state: GameState, me: PlayerState, arg: string | number | undefined) => string | null;
}

/** Sets a stat to `value`, between `min` and the player's max for it. */
const setStat = (stat: "hp" | "morale" | "ap" | "mp", min: number): KubeOp => ({
  group: "health",
  arg: "number",
  apply: (_state, me, arg) => {
    const max = { hp: me.maxHp, morale: me.maxMorale, ap: me.maxAp, mp: me.maxMp }[stat];
    me[stat] = Math.max(min, Math.min(max, arg as number));
    return null;
  },
});

/** Ends the game by arriving at `ending`, logging `logKey` publicly with the player's character. */
const arriveAt = (ending: "sol" | "eden", logKey: "returnedToSol" | "returnedToEden"): KubeOp => ({
  group: "destinations",
  arg: "none",
  apply: (state, me) => {
    logPublic(state, undefined, logKey, { name: me.character });
    endGame(state, winnerOnArrival(state), ending);
    return null;
  },
});

export const KUBE_OPS = {
  // A disease, disorder or injury of the ship's (`config.diseases`). As the old Self disease cheat did, no disease while
  // you're Mush (a disorder or an injury is fine). One you already have is refused.
  ailment: {
    group: "health",
    arg: "ailment",
    apply: (state, me, arg) => {
      const name = arg as StatusId;
      if (me.modifiers.includes(name)) return "already_has";
      if (me.role === "mush" && state.config.diseases.allDiseases.includes(name)) return "mush_immune";
      addDisease(state, me, name);
      return null;
    },
  },
  // Every disease, disorder and injury, and a human's contamination. A Mush stays Mush (that is the role cheat's job).
  cure: {
    group: "health",
    arg: "none",
    apply: (state, me) => {
      for (const name of ailments(state.config)) {
        removeDisease(state, me, name);
        me.diseaseTrackers = me.diseaseTrackers.filter((d) => d.name !== name);
      }
      delete state.contamination[me.id];
      updateMaxValues(state, me);
      return null;
    },
  },
  // HP never below 1: dying is not this option's job.
  hp: setStat("hp", 1),
  morale: setStat("morale", 0),
  ap: setStat("ap", 0),
  mp: setStat("mp", 0),
  // Dirty at once, past an apron or the Stickler skill, and with no log line.
  dirty: {
    group: "health",
    arg: "none",
    apply: (_state, me) => {
      addStatus(me, "dirty");
      return null;
    },
  },
  // One more contamination, as a spike gives: at capacity the human converts. Refused for a Mush or the immune.
  contaminate: {
    group: "health",
    arg: "none",
    apply: (state, me) => {
      if (me.role !== "human" || isImmune(state, me)) return "cannot_contaminate";
      contaminate(state, me);
      return null;
    },
  },
  // One item of the type, on the room's floor, with its start charges.
  spawn: {
    group: "items",
    arg: "item",
    apply: (state, me, arg) => {
      const type = arg as string;
      const charges = startCharges(state.config, type);
      state.items.push({ ...cheatItem(type, me.room), id: newItemId(state), ...(charges !== undefined && { charges }) });
      return null;
    },
  },
  // Out of the cheat room, to any room of the Daedalus.
  teleport: {
    group: "travel",
    arg: "room",
    apply: (state, me, arg) => {
      const blocked = teleportBlocked(state, me);
      if (blocked) return blocked;
      teleport(state, me, arg as RoomId);
      return null;
    },
  },
  // Breaks a working door of the Daedalus (#330), silently, as a stuck door would.
  breakDoor: {
    group: "travel",
    arg: "door",
    apply: (state, _me, arg) => (breakDoor(state, arg as DoorId) ? null : "door_broken"),
  },
  // End the game immediately by arriving at Sol or Eden (development route to a finished game and its replay).
  returnToSol: arriveAt("sol", "returnedToSol"),
  returnToEden: arriveAt("eden", "returnedToEden"),
} satisfies Record<string, KubeOp>;

export type KubeOpId = keyof typeof KUBE_OPS;

export const isKubeOp = (value: unknown): value is KubeOpId => typeof value === "string" && Object.hasOwn(KUBE_OPS, value);

/**
 * What `kubeChoices` reads: the ship's rooms and its disease lists. A `GameConfig` fits; so does the client's
 * `{ rooms: view.rooms, diseases: DEFAULT_CONFIG.diseases }` (the view carries no disease lists).
 */
export interface KubeChoiceSource {
  readonly rooms: Readonly<Record<RoomId, readonly RoomId[]>>;
  readonly diseases: { readonly allDiseases: readonly StatusId[]; readonly allDisorders: readonly StatusId[]; readonly allInjuries: readonly StatusId[] };
}

/** The ship's diseases, disorders and injuries, in that order. */
const ailments = (config: KubeChoiceSource): StatusId[] => [...config.diseases.allDiseases, ...config.diseases.allDisorders, ...config.diseases.allInjuries];

/**
 * What an argument of `kind` may be on a ship with this config, in the order the window lists them: the ship's
 * ailments, every item type, the Daedalus's rooms with the Laboratory first (the cheat room and the crafts left out),
 * or the Daedalus's doors.
 */
export function kubeChoices(config: KubeChoiceSource, kind: Exclude<KubeArgKind, "none" | "number">): string[] {
  if (kind === "ailment") return ailments(config);
  if (kind === "item") return Object.keys(ITEM_TYPES);
  if (kind === "door") return allDoors(config.rooms);
  const rooms = Object.keys(config.rooms).filter((room) => room !== CHEAT_ROOM && !inCraft(room));
  return [...rooms.filter((r) => r === "LABORATORY"), ...rooms.filter((r) => r !== "LABORATORY")];
}

/** The largest number a number option takes. */
const MAX_KUBE_NUMBER = 999;

function argError(config: DeepReadonly<GameConfig>, kind: KubeArgKind, arg: string | number | undefined): string | null {
  if (kind === "none") return arg === undefined ? null : "bad_argument";
  if (kind === "number") return Number.isInteger(arg) && (arg as number) >= 0 && (arg as number) <= MAX_KUBE_NUMBER ? null : "bad_argument";
  return typeof arg === "string" && kubeChoices(config, kind).includes(arg) ? null : "bad_argument";
}

/**
 * Applies one Superkube option for the player (#170, development cheat). The server has checked that cheats are
 * allowed; this checks the rest again: a ship with the cheat room, a living human player (not a bot) standing in it,
 * a known option and a fitting argument. Mutates nothing it was given.
 */
export function applyKube(state: GameState, playerId: PlayerId, op: KubeOpId, arg?: string | number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  if (state.phase !== "playing") return fail("game_over");
  if (!state.config.cheatRoom) return fail("no_cheat_room");
  if (p.isBot) return fail("bot");
  if (!p.alive) return fail("dead");
  if (p.room !== CHEAT_ROOM) return fail("not_in_cheat_room");
  const def: KubeOp | undefined = isKubeOp(op) ? KUBE_OPS[op] : undefined;
  if (!def) return fail("unknown_option");
  const bad = argError(state.config, def.arg, arg);
  if (bad) return fail(bad);
  const next = clone(state);
  const error = def.apply(next, findPlayer(next, playerId)!, arg);
  return error ? fail(error) : { ok: true, state: next };
}

/** Whether the player can be teleported now: not off the ship, not pushing or being pushed (ending a push logs). */
export function teleportBlocked(state: Readonly<GameState>, p: Readonly<PlayerState>): string | null {
  if (p.pushedBy !== undefined || pushing(state, p)) return "being_pushed";
  return null;
}

/**
 * Moves the player to `room` with no door, cost or log line, so the room they leave sees them vanish in place: out of
 * bed first, then the room hooks a move runs. The cheat room's way in (`cheatRoomCheat`) and out (`teleport`). Mutates
 * a cloned state; the caller checked `teleportBlocked`.
 */
export function teleport(state: GameState, me: PlayerState, room: RoomId): void {
  getUp(me);
  leaveAccommodation(state, me);
  board(me, room);
  enteredRoom(state, me);
  enterRoom(state, me);
}
