// How bots tell each other where things lie (owner, 2026-11-13): a fixed line in global chat, like the Commander's
// jump lines (planetShare.ts). A bot that sees a shared item type on a room's floor posts `Item: <type> in <ROOM>`; one
// that finds a room named that way empty posts `Item: no <type> in <ROOM>`. Every bot folds the lines it reads, and
// what it sees itself, into `BotMemory.items`, so a goal that needs the item walks to a room that has it instead of to
// a hard-coded one. Only bots parse the lines, and only this format; a player can post a false one and mislead them
// (accepted, as with shared planets). Types and rooms are ids (the bots' language is #95).

import { SHIP_ROOMS, TREE_POT_ITEM, type PlayerView, type RoomId } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";

/** The item types bots report. A goal that needs another type shared adds it here. Extinguishers: #429; expedition gear: space_suit, rope, quad_compass, white_flag, drill. */
export const SHARED_ITEMS = ["metal_scraps", "extinguisher", "space_suit", "rope", "quad_compass", "white_flag", "drill", TREE_POT_ITEM] as const;
export type SharedItem = (typeof SHARED_ITEMS)[number];

const ROOM_IDS: ReadonlySet<string> = new Set(SHIP_ROOMS.map((r) => r.id));

export interface ItemLine {
  type: SharedItem;
  room: RoomId;
  /** False: the room has none left. */
  present: boolean;
}

export const formatItemLine = ({ type, room, present }: ItemLine): string => `Item: ${present ? "" : "no "}${type} in ${room}`;

/** A chat line's item report, if it is in the bots' format and names a shared type and a room of the ship. */
export function parseItemLine(text: string): ItemLine | null {
  const m = /^Item: (no )?(\w+) in (\w+)$/.exec(text.trim());
  if (!m) return null;
  const type = SHARED_ITEMS.find((t) => t === m[2]);
  if (!type || !ROOM_IDS.has(m[3]!)) return null;
  return { type, room: m[3]!, present: m[1] === undefined };
}

/** What a bot knows about where shared items lie (`BotMemory.items`). */
export interface ItemMemory {
  /** Rooms believed to hold each type: the latest of what chat said and what the bot saw. */
  rooms: Map<SharedItem, Set<RoomId>>;
  /** Rooms global chat currently names for each type (the latest line per room), so nobody repeats a line. */
  said: Map<SharedItem, Set<RoomId>>;
  /** The global-chat position read up to (`ChatLine.seq`); chat pages leave the view, so lines are folded in as seen. */
  seq: number;
}

export const newItemMemory = (): ItemMemory => ({ rooms: new Map(), said: new Map(), seq: -1 });

const setIn = (map: Map<SharedItem, Set<RoomId>>, type: SharedItem, room: RoomId, present: boolean): void => {
  const rooms = map.get(type) ?? new Set<RoomId>();
  if (present) rooms.add(room);
  else rooms.delete(room);
  map.set(type, rooms);
};

/**
 * Folds the new global-chat item lines and the floor of the bot's own room into its memory, and returns the line to
 * post if chat doesn't say what the bot sees here (one line a turn). The line counts as said once returned, so a
 * refused message isn't tried again.
 */
export function observeItems(view: PlayerView, memory: BotMemory): BotSocial | null {
  const items = memory.items;
  for (const line of view.chat) {
    if (line.system || line.channel !== "global" || line.seq <= items.seq) continue;
    items.seq = line.seq;
    const report = parseItemLine(line.text);
    if (!report) continue;
    setIn(items.said, report.type, report.room, report.present);
    setIn(items.rooms, report.type, report.room, report.present);
  }
  const room = view.you.room;
  if (!ROOM_IDS.has(room)) return null;
  let post: BotSocial | null = null;
  for (const type of SHARED_ITEMS) {
    // A broken one isn't worth crossing the ship for (it can't be used until repaired); planted or already-gardened pots stay put.
    const present = view.roomItems.some(
      (i) => i.type === type && !i.broken && (type !== TREE_POT_ITEM || (!i.plant && room !== view.config.gardenRoom)),
    );
    setIn(items.rooms, type, room, present);
    if (post === null && view.chatChannels.includes("global") && present !== (items.said.get(type)?.has(room) ?? false)) {
      setIn(items.said, type, room, present);
      post = { type: "chat", channel: "global", text: formatItemLine({ type, room, present }) };
    }
  }
  return post;
}

/** The rooms the bot believes hold `type`. */
export const roomsHolding = (memory: BotMemory, type: SharedItem): RoomId[] => [...(memory.items.rooms.get(type) ?? [])];
