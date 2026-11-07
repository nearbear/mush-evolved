// Which chat messages are new to a reader (#355). Views carry no game-wide message id, so "new" is per channel: a
// message is new when its `seq` is at or past the count the reader had seen in its channel.

import type { ChannelId, ChatLine, PlayerView } from "@mush2/shared";

/** How many messages the reader had in each channel they could read. A channel missing from it was not readable. */
export type ChatSeen = Partial<Record<ChannelId, number>>;

/** What `view` holds, as counts per readable channel (0 for an empty one). */
export function chatSeenIn(view: Pick<PlayerView, "readChannels" | "chatCounts">): ChatSeen {
  return Object.fromEntries(view.readChannels.map((c) => [c, view.chatCounts[c] ?? 0]));
}

/**
 * Whether `m` came after `seen`. A channel that wasn't readable then (an iTrackie picked up, an invite to a private
 * channel) brings its history, which is not new.
 */
export function isNewer(seen: ChatSeen, m: Pick<ChatLine, "channel" | "seq">): boolean {
  const count = seen[m.channel];
  return count !== undefined && m.seq >= count;
}

/** A message's key in lists and caches: unique per game, and no game-wide id (ChatMessage.id says why). */
export const messageKey = (m: Pick<ChatLine, "channel" | "seq">): string => `${m.channel}:${m.seq}`;
