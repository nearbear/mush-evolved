import type { CharacterId } from "./characters.ts";

export * from "./types/chat.ts";
export * from "./types/config.ts";
export * from "./types/plan.ts";
export * from "./types/player.ts";
export * from "./types/state.ts";
export * from "./types/view.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

/** Which scripted brain drives a bot seat. Absent means "logParrot". */
export type BotKind = "wander" | "logParrot" | "model";

export interface Seat {
  id: PlayerId;
  /** The account's chosen name. Never in a view while the game runs: players know each other only by character. */
  name: string;
  isBot: boolean;
  botKind?: BotKind;
  /** Which crew member this seat plays: their art, and the only name other players see. No effect on the rules. */
  character: CharacterId;
}

/**
 * One line of history. `room` is where it happened (absent = ship-wide, e.g. a
 * new cycle). `visibleTo: "all"` entries are part of that room's history and
 * shown to whoever is in the room; a player list is private to those players,
 * named by body id, so it stays with the body across a Transfer. A view names only its viewer.
 */
export interface LogEntry {
  /** Increasing per game, like `ChatMessage.id`; never reused. Identifies a line once the log is windowed or trimmed. */
  id: number;
  cycle: number;
  /** Wall-clock ms when the server recorded it. The rules have no clock; GameRoom stamps it. Missing on older games. */
  at?: number;
  /** Message id; the client turns it into text (`logEvent.<key>` in the locale catalogs). */
  key: string;
  /** Data for the message. `room`, `item` and `equipment` params are ids the client names; `name`, `target` and `body` are character ids (never a player's own name). */
  params?: LogParams;
  room?: RoomId;
  visibleTo: "all" | PlayerId[];
  /** Set on entries the crew should take notice of: a secret or covert action that leaked into the room log, or an alarm. */
  level?: "warning";
}

/** A log line as a live view sends it: no `id` (`PlayerView.log` says why). */
export type LogLine = Omit<LogEntry, "id">;

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
  /** For a blueprint: the key of the recipe it carries (BLUEPRINTS in blueprints.ts). */
  builds?: string;
  /** For a microwave: express cooks left. */
  charges?: number;
  /** For a skill book: the skill id it teaches (SKILLS in skills.ts). */
  teaches?: string;
  /** For a food item a Mush filled with spores (Fungal cuisine): the contamination it passes to a human who eats it. Mush-only in views. */
  spores?: number;
  /** For an item hidden in its room (actions/hide.ts): who hid it. Only they can see or use it, until someone searches the room. */
  hiddenBy?: PlayerId;
  /** For a hydropot with something growing in it (botany.ts). An empty pot has none. */
  plant?: PlantState;
  /** Broken (breakage.ts `breakItem`): it can't be used until repaired. It can still be carried, dropped, given, examined and dismantled. */
  broken?: true;
  /** Green jelly (actions/green_jelly.ts): cycle changes left before it breaks. Mush-only in views. */
  jelly?: number;
}

/** A plant in a hydropot (owner, 2026-10-22; docs/scratchpad/botany-plan.md, Pass 1). */
export interface PlantState {
  /** The fruit item type it grows from and produces (only `fruit_banana` for now). */
  species: string;
  /** Cycles since it was sown while young; null once adult. */
  age: number | null;
  /** 0 healthy, 1 thirsty, 2 dried. Public. */
  thirst: 0 | 1 | 2;
  /** Hidden: only the Botanist role sees it (`isBotanistRole`). */
  sick: boolean;
}

/**
 * Something a player can inspect and act on: a person, a piece of room
 * equipment, or an item.
 */
export type Target = { kind: "player"; id: PlayerId } | { kind: "equipment"; id: string } | { kind: "item"; id: ItemId };

export type { Action } from "./actions.ts";
