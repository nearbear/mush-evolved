import type { LogParams, PlayerId } from "../types.ts";

/**
 * Crew-wide threads, one per ship feature, with the same permissions as global
 * chat (decided 2026-10-13). Order is the order the client lists them in.
 */
export const FEATURE_CHANNELS = ["botany", "research", "inventory", "space_battle", "comms", "pilgred", "neron", "astrophysics"] as const;
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
/** Anything a chat message can be posted to. */
export type ChannelId = ChatChannel | typeof MUSH_CHANNEL | typeof GRAVEYARD_CHANNEL | PrivateChannelId | ThreadId | SharedPlanetId;

/**
 * A planet a player shared from the Astro terminal (owner, 2026-10-31): their own free text about it, never parsed,
 * listed in the Astrophysics feature with its own discussion thread (the entry's id is the thread's channel). Sent to
 * whoever can read the Astrophysics feature, without the planet it came from (see `SharedPlanetState`).
 */
export interface SharedPlanet {
  id: SharedPlanetId;
  text: string;
  by: PlayerId;
  /** Day and cycle of that day of the latest share: sharing the planet again replaces the text. */
  day: number;
  cycleOfDay: number;
  /** "No longer applicable": the planet was lost (a travel, leaving orbit). Entries are never removed. */
  stale: boolean;
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
  /** The global message it was started from. At most one thread per message. */
  from?: number;
  createdBy: PlayerId;
  cycle: number;
}

export interface ChatMessage {
  /** Increasing per game; stable React key and ordering. */
  id: number;
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
