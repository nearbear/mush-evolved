// Bot memory in room storage (#440, docs/plans/bot-goals.md "Direction", point 3). `GameRoom.persist` saves one
// snapshot per bot seat under `bot:<seat>`, in the same atomic write as the game, so memory and state can't disagree
// after a crash. Never in game state, the record or a view: a replay never asks a bot anything (bot rule 9).
//
// Across deploys (owner's choice on #440): a new field is restored from a fresh bot's value (`{ ...fresh, ...stored }`);
// a renamed or reshaped field bumps `BOT_MEMORY_VERSION`, and a snapshot of another version is dropped, with no
// converters. Memory is a cache of what the bot saw: dropping it does no more harm than a restart did before.

import type { PlanetDirection, PlayerId, RngState, RoomId } from "@mush2/shared";
import type { ExpeditionKind, ExpeditionPrepMemory } from "./goals/types.ts";
import type { SharedItem } from "./itemShare.ts";
import type { JumpMemory } from "./planetShare.ts";

/** Bump when a stored field is renamed or reshaped; older snapshots are then dropped. */
export const BOT_MEMORY_VERSION = 1;

/** Storage key prefix for bot snapshots: `bot:<seat>`. */
export const BOT_MEMORY_PREFIX = "bot:";
export const botMemoryKey = (seat: string): string => `${BOT_MEMORY_PREFIX}${seat}`;

/**
 * A goal bot's memory as stored: plain data (arrays for sets and maps). Not stored: the computed `scripted`,
 * `language`, `roll` and `reserve`, and the current goal (a `Goal` holds closures; after a restart the bot chooses
 * again, which costs a model bot one call).
 */
export interface BotMemorySnapshot {
  version: number;
  rng: RngState;
  day: number;
  cycle: number;
  hp: number | null;
  ended: string[];
  today: string[];
  once: string[];
  visited: RoomId[];
  shrinks: string[];
  lastExpedition: ExpeditionKind | null;
  asteroidsOnly: number | null;
  items: { rooms: [SharedItem, RoomId[]][]; said: [SharedItem, RoomId[]][]; seq: number };
  fires: { active: number; burning: RoomId[]; checked: RoomId[]; seq: number };
  tanks: { broken: RoomId[]; suspect: RoomId[]; claims: [RoomId, { by: PlayerId; cycle: number }][]; seq: number };
  morale: { said: boolean; requests: [PlayerId, number][]; seq: number };
  expeditionEnd: { done: string[]; noIcarus: boolean; said: string[]; seq: number };
  combustion: number | null;
  holdSince: number | null;
  jump: JumpMemory;
  reports: { explored: [string, string[]][]; seen: string[]; shared: string[] };
  heading: PlanetDirection | null;
  cancelHold: boolean;
  justJumped: boolean;
  failedReason: string | null;
  expeditionPrep: ExpeditionPrepMemory | null;
}

/** The stored snapshot if it is of this version, merged over `fresh` so fields added since come out at their defaults. */
export function readSnapshot(stored: unknown, fresh: BotMemorySnapshot): BotMemorySnapshot | null {
  if (typeof stored !== "object" || stored === null || (stored as { version?: unknown }).version !== BOT_MEMORY_VERSION) return null;
  return { ...fresh, ...(stored as Partial<BotMemorySnapshot>) };
}
