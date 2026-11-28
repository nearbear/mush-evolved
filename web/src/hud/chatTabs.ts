// Which iTrackie tab each chat channel is read in, and the unread on each tab (#400).

import { FEATURE_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL, unreadCount, type ChannelId, type ChatRead, type FeatureChannel, type PlayerView } from "@mush2/shared";
import type { ReadSnapshot } from "../chatRead.ts";

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

/**
 * Unread per tab: each readable channel's count less the count read, the messages read one at a time (#513) and what you
 * couldn't hear, summed by `tabOf`.
 */
export function unreadByTab(view: Pick<PlayerView, "readChannels" | "chatCounts" | "chatUnheard">, snap: ReadSnapshot): Record<TabId, number> {
  const counts: Record<TabId, number> = { room: 0, global: 0, threads: 0, features: 0, private: 0, mush: 0, graveyard: 0 };
  for (const channel of view.readChannels) counts[tabOf(channel)] += unreadCount(view.chatCounts, snap.read, channel, view.chatUnheard, snap.local);
  return counts;
}

/** Total unread across all readable channels (#400). */
export function totalUnread(view: Pick<PlayerView, "readChannels" | "chatCounts" | "chatUnheard">, snap: ReadSnapshot): number {
  let total = 0;
  for (const channel of view.readChannels) total += unreadCount(view.chatCounts, snap.read, channel, view.chatUnheard, snap.local);
  return total;
}

/** What Mark all read raises on `tab`: each channel read there, at its message count (#400). */
export function readAllOn(view: Pick<PlayerView, "readChannels" | "chatCounts">, tab: TabId): ChatRead {
  return Object.fromEntries(view.readChannels.filter((c) => tabOf(c) === tab).map((c) => [c, view.chatCounts[c] ?? 0]));
}

/** Which feature a Features-tab channel belongs to: shared planets to Astrophysics, shared reports to Expeditions. */
export function featureOf(channel: ChannelId): FeatureChannel | null {
  if (channel.startsWith("sp-")) return "astrophysics";
  if (channel.startsWith("sr-")) return "expeditions";
  return (FEATURE_CHANNELS as readonly string[]).includes(channel) ? (channel as FeatureChannel) : null;
}

/** Unread per feature, for the feature drop-down: each feature's own channel plus its shared entries (#400). */
export function unreadByFeature(view: Pick<PlayerView, "readChannels" | "chatCounts" | "chatUnheard">, snap: ReadSnapshot): Partial<Record<FeatureChannel, number>> {
  const counts: Partial<Record<FeatureChannel, number>> = {};
  for (const channel of view.readChannels) {
    const feature = featureOf(channel);
    const n = feature ? unreadCount(view.chatCounts, snap.read, channel, view.chatUnheard, snap.local) : 0;
    if (feature && n > 0) counts[feature] = (counts[feature] ?? 0) + n;
  }
  return counts;
}
