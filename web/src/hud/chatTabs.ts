// Which iTrackie tab each chat channel is read in, and the unread on each tab (#400).

import { GRAVEYARD_CHANNEL, MUSH_CHANNEL, unreadCount, type ChannelId, type ChatRead, type PlayerView } from "@mush2/shared";

export type TabId = "room" | "global" | "threads" | "features" | "private" | "mush" | "graveyard";

/** Which tab a channel's messages are read in. */
export function tabOf(channel: ChannelId): TabId {
  if (channel === "global") return "global";
  if (channel === MUSH_CHANNEL) return "mush";
  if (channel === GRAVEYARD_CHANNEL) return "graveyard";
  if (channel.startsWith("pc-")) return "private";
  if (channel.startsWith("th-")) return "threads";
  return "features";
}

/** Unread per tab: each readable channel's count less the count read, summed by `tabOf`. */
export function unreadByTab(view: Pick<PlayerView, "readChannels" | "chatCounts">, read: Readonly<ChatRead>): Record<TabId, number> {
  const counts: Record<TabId, number> = { room: 0, global: 0, threads: 0, features: 0, private: 0, mush: 0, graveyard: 0 };
  for (const channel of view.readChannels) counts[tabOf(channel)] += unreadCount(view.chatCounts, read, channel);
  return counts;
}
