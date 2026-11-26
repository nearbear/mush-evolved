// ---- Chat read state (#400) -------------------------------------------------
// How far a seat has read each chat channel: one high-water count per channel, like Discord. Reading a message reads
// everything before it in its channel, so unread in a channel is `chatCounts[c] − read[c]`, right past the ~100
// messages a view carries. Not game state: the server keeps it per seat in its own storage, outside the input log
// (never recorded or replayed), and no view carries it. Keyed by seat (the mind), it follows a Transfer, which is also
// why it can't leak how far a body's previous mind had read (the reason `logSeen` restarts in `swapMinds`).
// docs/plans/archive/chat-pages.md, "Read state (#400)".

import { countInRanges } from "./chat.ts";
import { readableFrom } from "./radioPiracy.ts";
import type { ChannelId, GameState, PlayerState, SeqRange } from "./types.ts";

/** Messages read per channel: the count read, so 3 means `seq` 0 to 2. Missing means none. */
export type ChatRead = Partial<Record<ChannelId, number>>;

/** Most channels a `chatRead` message may name, so a client can't make the server store a huge object. */
export const MAX_CHAT_READ_ENTRIES = 256;

/** `read`'s entries, typed. */
const entriesOf = (read: Readonly<ChatRead>) => Object.entries(read) as [ChannelId, number][];

/**
 * Raises `stored` by `incoming` for the channels `body` reads now, each clamped to the messages the channel has.
 * Counts only rise; a channel `body` can't read now, or one with no messages, is ignored the same way, so a refusal
 * says nothing about a channel. Entries `body` can't read now stay as stored: dropping your iTrackie for a moment
 * mustn't make all of global chat unread again. `raised` holds the entries that went up (empty when nothing did).
 */
export function mergeChatRead(state: Readonly<GameState>, body: Readonly<PlayerState>, stored: Readonly<ChatRead>, incoming: Readonly<ChatRead>): { read: ChatRead; raised: ChatRead } {
  const readable = new Set(readableFrom(state, body).keys());
  const read: ChatRead = { ...stored };
  const raised: ChatRead = {};
  for (const [channel, count] of entriesOf(incoming)) {
    if (!readable.has(channel)) continue;
    const next = Math.min(count, state.chatSeq[channel] ?? 0);
    if (next <= (read[channel] ?? 0)) continue;
    read[channel] = next;
    raised[channel] = next;
  }
  return { read, raised };
}

/** What the seat in `body` is sent: its counts for the channels `body` reads now, clamped, without zeros. */
export function chatReadFor(state: Readonly<GameState>, body: Readonly<PlayerState>, read: Readonly<ChatRead>): ChatRead {
  const sent: ChatRead = {};
  for (const channel of readableFrom(state, body).keys()) {
    const count = Math.min(read[channel] ?? 0, state.chatSeq[channel] ?? 0);
    if (count > 0) sent[channel] = count;
  }
  return sent;
}

/**
 * Drops the channels that no longer have messages in `state.chatSeq`: a private channel deleted when its last member
 * left (`removeFromChannel`). Channel ids are never reused, so this only tidies storage.
 */
export function pruneChatRead(state: Readonly<GameState>, read: Readonly<ChatRead>): ChatRead {
  return Object.fromEntries(entriesOf(read).filter(([channel]) => state.chatSeq[channel] !== undefined)) as ChatRead;
}

/**
 * Messages in `channel` not read yet: its count (`PlayerView.chatCounts`) less the count read, never below 0, and less
 * the ones after it you couldn't hear (`PlayerView.chatUnheard`: Damaged or Destroyed Ears), which never notify.
 */
export function unreadCount(
  counts: Readonly<Partial<Record<ChannelId, number>>>,
  read: Readonly<ChatRead>,
  channel: ChannelId,
  unheard?: Readonly<Partial<Record<ChannelId, readonly SeqRange[]>>>,
): number {
  const total = counts[channel] ?? 0;
  const from = read[channel] ?? 0;
  return Math.max(0, total - from - countInRanges(unheard?.[channel], from, total));
}
