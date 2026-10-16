// ---- Chat storage ----------------------------------------------------------
// Appending to state.chat, shared by player messages (rules.ts) and system
// messages (infection.ts), which can't import rules.ts without a cycle.

import type { ChannelId, ChatMessage, GameState } from "./types.ts";

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
