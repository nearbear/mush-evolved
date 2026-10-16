// ---- Chat storage ----------------------------------------------------------
// Appending to state.chat, shared by player messages (rules.ts) and system
// messages (infection.ts), which can't import rules.ts without a cycle.

import type { ChannelId, ChatMessage, GameState, PlayerId, PrivateChannelId } from "./types.ts";

/** Per channel, older chat is dropped so stored state stays bounded. */
export const CHAT_HISTORY = 200;

/** Mutates a state that the caller already cloned. Assigns the id and cycle. */
export function pushChat(state: GameState, channel: ChannelId, message: Omit<ChatMessage, "id" | "cycle" | "channel">): void {
  state.chat.push({ id: state.nextChatId++, cycle: state.cycle, channel, ...message });
  // Trim per channel, so a busy global chat can't push the feature threads out.
  if (state.chat.filter((m) => m.channel === channel).length > CHAT_HISTORY) {
    state.chat.splice(state.chat.findIndex((m) => m.channel === channel), 1);
  }
}

/**
 * Takes a member out of a private channel. The last one out deletes the channel
 * and its messages. Returns whether the channel still exists. Mutates a state
 * that the caller already cloned.
 */
export function removeFromChannel(state: GameState, channelId: PrivateChannelId, playerId: PlayerId): boolean {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return false;
  channel.members = channel.members.filter((m) => m !== playerId);
  if (channel.members.length > 0) return true;
  state.channels = state.channels.filter((c) => c.id !== channelId);
  state.chat = state.chat.filter((m) => m.channel !== channelId);
  return false;
}
