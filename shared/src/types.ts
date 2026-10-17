import type { CharacterId } from "./characters.ts";

export * from "./types/chat.ts";
export * from "./types/config.ts";
export * from "./types/player.ts";
export * from "./types/state.ts";
export * from "./types/view.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

/** Which scripted brain drives a bot seat. Absent means "wander". */
export type BotKind = "wander" | "logParrot";

export interface Seat {
  id: PlayerId;
  name: string;
  isBot: boolean;
  botKind?: BotKind;
  /** Cosmetic only: which crew member's art this seat is drawn with. */
  character: CharacterId;
}

/**
 * One line of history. `room` is where it happened (absent = ship-wide, e.g. a
 * new cycle). `visibleTo: "all"` entries are part of that room's history and
 * shown to whoever is in the room; a player list is private to those players.
 */
export interface LogEntry {
  cycle: number;
  /** Message id; the client turns it into text (`logEvent.<key>` in the locale catalogs). */
  key: string;
  /** Data for the message. `room`, `item` and `equipment` params are ids the client names; `name` is a player name. */
  params?: LogParams;
  room?: RoomId;
  visibleTo: "all" | PlayerId[];
}

/** Values a log message can interpolate. */
export type LogParams = Record<string, string | number>;

export type ItemId = string;

/** Where an item is: a player's inventory or a room's (unlimited) storage. */
export type Container = { kind: "player"; id: PlayerId } | { kind: "room"; id: RoomId };

export interface ItemState {
  id: ItemId;
  /** Key into ITEM_TYPES (items.ts). */
  type: string;
  at: Container;
  /** For a corpse: whose body it is. */
  of?: PlayerId;
}

/**
 * Something a player can inspect and act on: a person, a piece of room
 * equipment, or an item.
 */
export type Target = { kind: "player"; id: PlayerId } | { kind: "equipment"; id: string } | { kind: "item"; id: ItemId };

export type Action =
  | { type: "move"; to: RoomId }
  | { type: "take"; item: ItemId }
  | { type: "drop"; item: ItemId }
  | { type: "dismantle"; item: ItemId }
  | { type: "dispense"; equipment: string }
  | { type: "consume"; item: ItemId }
  | { type: "cook"; item: ItemId }
  | { type: "jettison"; item: ItemId }
  | { type: "examine"; target: Target }
  | { type: "bond"; target: PlayerId }
  | { type: "dtt"; target: PlayerId }
  | { type: "stt"; target: PlayerId }
  | { type: "extract_spore" }
  | { type: "shower"; equipment: string }
  | { type: "heal"; target: PlayerId }
  | { type: "punch"; target: PlayerId }
  | { type: "spike"; target: PlayerId }
  | { type: "pick_skill"; skill: string }
  | { type: "ready" };
