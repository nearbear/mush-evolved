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
/** Anything a chat message can be posted to. */
export type ChannelId = ChatChannel | typeof MUSH_CHANNEL | typeof GRAVEYARD_CHANNEL | PrivateChannelId;

/** Chat among the members only. Anyone in it may invite others; it ends when the last member leaves. */
export interface PrivateChannel {
  id: PrivateChannelId;
  name: string;
  members: PlayerId[];
  createdBy: PlayerId;
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
