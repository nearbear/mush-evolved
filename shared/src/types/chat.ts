import type { ItemTypeId } from "../itemIds.ts";
import type { PlanetTag } from "../planets.ts";
import type { LogParams, PlayerId } from "../types.ts";

/**
 * Crew-wide threads, one per ship feature, with the same permissions as global
 * chat (decided 2026-10-13). Order is the order the client lists them in.
 */
export const FEATURE_CHANNELS = ["botany", "research", "inventory", "space_battle", "comms", "pilgred", "neron", "astrophysics", "expeditions", "dirtiness"] as const;
export type FeatureChannel = (typeof FEATURE_CHANNELS)[number];
export type ChatChannel = "global" | FeatureChannel;
export const CHAT_CHANNELS: readonly ChatChannel[] = ["global", ...FEATURE_CHANNELS];

/**
 * The Mush's own channel. Only living Mush read or post (see chatChannels); the
 * game also posts system messages here when a human's contamination rises.
 */
export const MUSH_CHANNEL = "mush";

/** The graveyard: only the dead read or post (decided 2026-10-17). */
export const GRAVEYARD_CHANNEL = "graveyard";

/** Id of a player-made private channel (`pc-1`, `pc-2`, ...). Never collides with a ChatChannel name. */
export type PrivateChannelId = `pc-${number}`;
/** Id of a thread under global chat (`th-1`, `th-2`, ...). */
export type ThreadId = `th-${number}`;
/** Id of a shared planet's entry in the Astrophysics feature, which is also its discussion thread (`sp-1`, ...). */
export type SharedPlanetId = `sp-${number}`;
/** Id of a shared expedition report's entry in the Expeditions feature, which is also its discussion thread (`sr-1`, ...). */
export type SharedReportId = `sr-${number}`;
/** Anything a chat message can be posted to. */
export type ChannelId = ChatChannel | typeof MUSH_CHANNEL | typeof GRAVEYARD_CHANNEL | PrivateChannelId | ThreadId | SharedPlanetId | SharedReportId;

/**
 * A planet a player shared from the Astro terminal (owner, 2026-10-31): their own free text about it, never parsed,
 * listed in the Astrophysics feature with its own discussion thread (the entry's id is the thread's channel). Sent to
 * whoever can read the Astrophysics feature, without the planet it came from (see `SharedPlanetState`).
 * `name` is the planet's true name, never edited; `sectors` has one slot per sector of the planet when it was shared
 * (its true size), each the tag the sharer chose or null for unknown, lies included (owner, 2026-11-19,
 * docs/plans/archive/expedition-ui.md).
 */
export interface SharedPlanet {
  id: SharedPlanetId;
  name: string;
  sectors: (PlanetTag | null)[];
  text: string;
  by: PlayerId;
  /** Day and cycle of that day of the latest share: sharing the planet again replaces the text. */
  day: number;
  cycleOfDay: number;
  /** "No longer applicable": the planet was lost (a travel, leaving orbit). Entries are never removed. */
  stale: boolean;
}

/**
 * An expedition report a member shared (owner, 2026-11-07, #356): the first share's free text, never parsed, listed in
 * the Expeditions feature with its own discussion thread (the entry's id is the thread's channel). Later shares are
 * messages in that thread. Never marked no longer applicable. Sent to whoever can read the Expeditions feature,
 * without the report it came from (see `SharedReportState`).
 */
export interface SharedReport {
  id: SharedReportId;
  text: string;
  by: PlayerId;
  /** Day and cycle of that day of the first share. */
  day: number;
  cycleOfDay: number;
}

/** One plant row in a greenhouse status shared from the Hydroponics center (`PLANT_CONTROLLER`, sharedPlants.ts). */
export interface SharedPlantRow {
  /** Fruit species id (`fruit_banana`, `fruit01`–`fruit12`, or `graft_fruitXX_fruitYY`). */
  species: ItemTypeId;
  /** Effects claimed by the sharer, newline-separated (moderated free text, editable so players can lie). */
  effects: string;
  /** Thirst claimed by the sharer: 0 none, 1 thirsty, 2 dried out. */
  thirst: 0 | 1 | 2;
  /** Cycles diseased claimed by the sharer, or null if not claimed diseased. */
  sickCycles: number | null;
  /** Whether the sharer claims the plant is young. */
  young: boolean;
}

/**
 * The latest greenhouse plant status shared from the Hydroponics center (`PLANT_CONTROLLER`, sharedPlants.ts), pinned
 * above the Botany feature thread. Sharing again replaces it. Sent to whoever can read the Botany feature.
 */
export interface SharedPlantStatus {
  plants: SharedPlantRow[];
  /** Optional free-text note (moderated). */
  text: string;
  by: PlayerId;
  day: number;
  cycleOfDay: number;
}

/**
 * Latest PILGRED repair progress shared from the PILGRED terminal in the PILGRED feature (sharedPilgred.ts):
 * an editable progress percent (lies allowed) and optional free-text note, pinned above the PILGRED thread.
 */
export interface SharedPilgredStatus {
  /** Claimed repair percent (integer 0..PILGRED_COMPLETE). */
  percent: number;
  /** Optional free-text note (moderated). */
  text: string;
  by: PlayerId;
  day: number;
  cycleOfDay: number;
}

/** Chat among the members only. Anyone in it may invite others; it ends when the last member leaves. */
export interface PrivateChannel {
  id: PrivateChannelId;
  /** Blank when the creator gave none; clients then show the localized "Day N, Cycle M" from `day` and `cycleOfDay`. */
  name: string;
  members: PlayerId[];
  createdBy: PlayerId;
  /**
   * The creator died or left (owner, 2026-10-31): its open plan was cancelled and no plan can be posted in it again.
   * Absent while the creator is still a member. The channel itself keeps working for chat.
   */
  planningClosed?: true;
  /** Day and cycle of that day when it was opened. */
  day: number;
  cycleOfDay: number;
}

/**
 * A Discord-style thread under global chat (decided 2026-10-21): named, started
 * from a global message or on its own, with global chat's read and post access.
 * No cap on how many; the server's chat rate limit is the only brake.
 */
export interface ChatThread {
  id: ThreadId;
  name: string;
  /** The `seq` of the global message it was started from. At most one thread per message. */
  from?: number;
  createdBy: PlayerId;
  cycle: number;
}

export interface ChatMessage {
  /**
   * Increasing per game, across channels; never reused. The server, the record and the replay use it. A live view
   * never carries it (`ChatLine`): a gap in it would show that someone posted where you can't read.
   */
  id: number;
  /** Position in its channel, 0, 1, 2… with no gaps (#355). Page n holds `seq` n·50 to n·50+49 (`CHAT_PAGE`). */
  seq: number;
  cycle: number;
  /** Wall-clock ms when the server recorded it (stamped by GameRoom; the rules have no clock). Missing on older games. */
  at?: number;
  channel: ChannelId;
  /** Null for a system message posted by the game. */
  from: PlayerId | null;
  isBot: boolean;
  /** Empty for a system message, which carries `system` instead. */
  text: string;
  /** A system message: the client translates `key` with `params`, like a log entry. */
  system?: { key: string; params?: LogParams };
}

/** A chat message as a live view carries it: no game-wide `id` (see `ChatMessage.id`). Named by `channel` and `seq`. */
export type ChatLine = Omit<ChatMessage, "id">;

/**
 * Which task lines of a checklist message are ticked (#355, docs/plans/archive/chat-pages.md phase 2). Kept in the state beside
 * the chat (`GameState.chatMarks`), so a message's text stays as typed and a sealed page is never written again. Every
 * view applies it to the text (`markedText`).
 */
export interface ChatMark {
  /** The author: only they may tick. */
  from: PlayerId;
  /** The 0-based lines that are task items outside code fences (`taskLines`, chat.ts), ascending. */
  tasks: number[];
  /** The task lines ticked now, ascending. */
  checked: number[];
}

/** A full page that left the state, for the server to store (`chatPageKey`). */
export interface SealedChatPage {
  channel: ChannelId;
  page: number;
  messages: ChatMessage[];
}

/**
 * What the rules hand the server to store (#355): pages that sealed, and private channels deleted with how many pages
 * they had stored. The server empties it after every input (`takeChatOutbox`); the rules never read storage.
 */
export interface ChatOutbox {
  sealed: SealedChatPage[];
  dropped: { channel: ChannelId; pages: number }[];
}

/** A run of a channel's messages by position, `from` inclusive to `to` exclusive (`ChatMessage.seq`). */
export type SeqRange = [from: number, to: number];
