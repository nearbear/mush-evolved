// Schrödinger, Raluca's cat (owner, 2026-11-21): an NPC item (npcs.ts) with no actions yet. He arrives with his owner:
// when she boards (at launch, or joining in pre-selection), he appears silently on the laboratory floor
// (`config.schrodinger.room`; eMush's `schrodinger_in_laboratory`). No Raluca aboard, no cat.
//
// His turn at each cycle change follows eMush's cat AI (clean-room, `npm run emush`), with `favoredChance` its 70%:
// - Owner alive: in her room he stays; elsewhere, `favoredChance` of a step toward her, else a random step.
// - Owner dead: with anyone alive in his room (Mush, asleep, inactive included; corpses and NPCs don't count),
//   `favoredChance` of a step toward the nearest room nobody alive is in, else a random step; in an empty room,
//   `favoredChance` of staying, else a random step.
// A step crosses only working doors (#330) and never leaves the Daedalus; paths are `shortestPath`'s, ties by door
// order, as eMush's BFS. A chosen move with nowhere to go leaves him where he is (eMush chains no fallback). Carried,
// he acts from his carrier's room, and a move takes him out of their hands, as a drone's (owner, 2026-11-21). He
// rolls on `state.rng`, like every NPC turn. Each move gets public lines in both rooms, like a drone's.

import { CAT_ITEM } from "./items.ts";
import { catCameIn } from "./modifiers/cat_allergy_disease.ts";
import { logPublic } from "./log.ts";
import type { Npc } from "./npcs.ts";
import { openDoors } from "./doors.ts";
import { shortestPath } from "./paths.ts";
import { offShip } from "./patrol.ts";
import { rollFloat, rollInt } from "./rng.ts";
import type { DeepReadonly, GameConfig, GameState, ItemState, RoomId } from "./types.ts";

/** Where Schrödinger appears when his owner boards, or nothing if `character` isn't his owner. */
export function catArrival(config: DeepReadonly<GameConfig>, character: string): Omit<ItemState, "id">[] {
  return character === config.schrodinger.owner ? [{ type: CAT_ITEM, at: { kind: "room", id: config.schrodinger.room } }] : [];
}

const livingIn = (state: Readonly<GameState>, room: RoomId): boolean => state.players.some((p) => p.alive && p.room === room);

/** The first step from `room` toward the nearest Daedalus room that `match`es, through working doors; undefined if none (or already there). */
function stepToward(state: Readonly<GameState>, room: RoomId, match: (r: RoomId) => boolean): RoomId | undefined {
  return shortestPath(state.config.rooms, room, (r) => !offShip(r) && match(r), (a, b) => !offShip(b) && openDoors(state)(a, b))?.[0];
}

/** A random neighbouring Daedalus room through a working door, undefined if none. */
function randomStep(state: GameState, room: RoomId): RoomId | undefined {
  const open = openDoors(state);
  const neighbours = (state.config.rooms[room] ?? []).filter((r) => !offShip(r) && open(room, r));
  return neighbours.length === 0 ? undefined : neighbours[rollInt(state, neighbours.length)];
}

/** Where his turn takes him from `room`, or undefined to stay. Rolls on `state.rng`. */
function destination(state: GameState, room: RoomId): RoomId | undefined {
  const { owner, favoredChance } = state.config.schrodinger;
  const favored = () => rollFloat(state) < favoredChance;
  const ownerRoom = state.players.find((p) => p.alive && p.character === owner)?.room;
  if (ownerRoom !== undefined) {
    if (ownerRoom === room) return undefined;
    return favored() ? stepToward(state, room, (r) => r === ownerRoom) : randomStep(state, room);
  }
  if (livingIn(state, room)) return favored() ? stepToward(state, room, (r) => !livingIn(state, r)) : randomStep(state, room);
  return favored() ? undefined : randomStep(state, room);
}

/** Schrödinger's behaviour (npcs.ts). */
export const schrodinger: Npc = {
  act: (state, item, room) => {
    if (offShip(room)) return;
    const to = destination(state, room);
    if (to === undefined) return;
    item.at = { kind: "room", id: to };
    logPublic(state, room, "catLeft", { room: to });
    logPublic(state, to, "catEntered", { room });
    // Cat Allergy (owner, 2026-11-21): carriers in the room he walks into react.
    catCameIn(state, to);
  },
};
