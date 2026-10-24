// ---- Chat ------------------------------------------------------------------
// Storage (pushChat, removeFromChannel), which infection.ts and death.ts also
// use, then the player-facing chat and private-channel rules. Chat is not an
// Action: free text can't be enumerated in legalActions. Moderation (filtering,
// rate limits) is the server's job before these run.

import { ITRACKIE_ITEM, itemsIn } from "./items.ts";
import { channelLimit } from "./modifiers.ts";
import { noITrackieNeeded } from "./comms.ts";
import { clone, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL } from "./types.ts";
import type { ChannelId, ChatMessage, GameState, PlayerId, PlayerState, PrivateChannelId, ThreadId } from "./types.ts";

/** Longest chat message the rules accept. Moderation trims before this. */
export const MAX_CHAT_LENGTH = 300;

/** Longest chat message in lines (moderation enforces it; messages are markdown and may span lines). */
export const MAX_CHAT_LINES = 12;

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

/**
 * Channels a player may read. The living read what they can post to; the dead
 * (decided 2026-10-16, #45) read global chat and the feature threads without an
 * iTrackie, and a dead Mush also the Mush channel. Private channels are gone:
 * dying leaves them.
 */
export function readChannels(state: GameState, player: Readonly<PlayerState>): ChannelId[] {
  if (player.alive) return chatChannels(state, player);
  if (state.phase !== "playing") return [];
  const mush: ChannelId[] = player.role === "mush" ? [MUSH_CHANNEL] : [];
  return [...CHAT_CHANNELS, ...threadIds(state), ...mush, GRAVEYARD_CHANNEL];
}

/** Threads go wherever global chat goes. */
const threadIds = (state: GameState): ThreadId[] => state.threads.map((t) => t.id);

/**
 * Channels a player may post to (and so read). The dead post only in the graveyard. Global chat and every feature thread
 * need an iTrackie in your inventory (confirmed 2026-10-13); drop it and you
 * lose them, pick one up and you see the whole history.
 */
export function chatChannels(state: GameState, player: Readonly<PlayerState>): ChannelId[] {
  if (state.phase !== "playing") return [];
  // The graveyard is the one place the dead may post (decided 2026-10-17), and no iTrackie is needed.
  if (!player.alive) return [GRAVEYARD_CHANNEL];
  // The Mush channel is a link between the Mush, not a device: no iTrackie needed (decided 2026-10-16).
  const mush: ChannelId[] = player.role === "mush" ? [MUSH_CHANNEL] : [];
  const hasITrackie = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === ITRACKIE_ITEM);
  // Luyten-Ceti's brain probes stand in for the iTrackie once that rebel base is reached (owner, 2026-10-21).
  if (!hasITrackie && !noITrackieNeeded(state)) return mush;
  return [...CHAT_CHANNELS, ...threadIds(state), ...mush, ...state.channels.filter((c) => c.members.includes(player.id)).map((c) => c.id)];
}

export function sendChat(state: GameState, playerId: PlayerId, channel: ChannelId, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return { ok: false, error: "unknown_player" };
  if (!chatChannels(state, p).includes(channel)) return { ok: false, error: "cant_post" };
  const body = text.trim();
  if (!body) return { ok: false, error: "empty_message" };
  if (body.length > MAX_CHAT_LENGTH) return { ok: false, error: "message_too_long" };

  const next = clone(state);
  pushChat(next, channel, { from: p.id, isBot: p.isBot, text: body });
  return { ok: true, state: next };
}

/** A markdown task-list line: optional quote marks and indent, a list marker, then `[ ]` or `[x]`. */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\])/;

/** Whether line `line` (0-based) of `text` is a task-list item outside a fenced code block. */
export function isTaskLine(text: string, line: number): boolean {
  let fence: string | null = null;
  const lines = text.split("\n");
  for (let i = 0; i <= line && i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i]!)?.[1];
    if (marker) fence = fence === null ? marker[0]! : lines[i]!.trimStart().startsWith(fence) ? null : fence;
    else if (i === line) return fence === null && TASK_LINE.test(lines[i]!);
  }
  return false;
}

/**
 * Tick or untick a markdown checkbox in a message. Only the author may, and
 * only while they can still read the channel. The text itself changes (so
 * replays and late joiners agree), and `line` is the 0-based line of the item.
 */
export function toggleCheckbox(state: GameState, playerId: PlayerId, messageId: number, line: number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  const message = state.chat.find((m) => m.id === messageId);
  if (!message || !chatChannels(state, p).includes(message.channel)) return fail("message_not_found");
  if (message.from !== p.id) return fail("message_not_yours");
  if (!Number.isInteger(line) || !isTaskLine(message.text, line)) return fail("checkbox_not_found");

  const next = clone(state);
  const target = next.chat.find((m) => m.id === messageId)!;
  const lines = target.text.split("\n");
  lines[line] = lines[line]!.replace(TASK_LINE, (_, head: string, mark: string, tail: string) => `${head}${mark === " " ? "x" : " "}${tail}`);
  target.text = lines.join("\n");
  return { ok: true, state: next };
}

// ---- Threads ---------------------------------------------------------------
// Discord-style threads under global chat (decided 2026-10-21). Anyone who can
// post in global chat may start one, on its own or from a global message (one
// thread per message), and its access is global chat's. No cap on how many.

export const MAX_THREAD_NAME_LENGTH = 40;

export function createThread(state: GameState, playerId: PlayerId, rawName: string, fromMessage?: number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !chatChannels(state, p).includes("global")) return fail("thread_forbidden");
  // A name is one line.
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_THREAD_NAME_LENGTH) return fail("thread_name_invalid");
  if (fromMessage !== undefined) {
    if (!state.chat.some((m) => m.id === fromMessage && m.channel === "global")) return fail("message_not_found");
    if (state.threads.some((t) => t.from === fromMessage)) return fail("thread_exists");
  }

  const next = clone(state);
  const id: ThreadId = `th-${next.nextThreadId++}`;
  next.threads.push({ id, name, ...(fromMessage !== undefined && { from: fromMessage }), createdBy: playerId, cycle: next.cycle });
  return { ok: true, state: next };
}

// ---- Private channels ------------------------------------------------------
// Membership is the only access control (confirmed 2026-10-13): anyone in a
// channel may invite anyone, from any room, and new members see the history.
// Reading and posting still need an iTrackie (chatChannels). Joining is
// immediate, with no accept step. Dying takes you out of every channel (death.ts). Errors are codes, not sentences (i18n rule 4).

export const MAX_CHANNEL_NAME_LENGTH = 24;

function channelCount(state: GameState, playerId: PlayerId): number {
  return state.channels.filter((c) => c.members.includes(playerId)).length;
}

/**
 * Opens a channel with you in it, then adds each of `members` as if you had
 * invited them one by one: anyone an invite would refuse is skipped, so the
 * member list shows who got in and nothing more than a refused invite would.
 */
export function createChannel(state: GameState, playerId: PlayerId, rawName: string, members: readonly PlayerId[] = []): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !p.alive || state.phase !== "playing") return fail("channel_forbidden");
  const name = rawName.trim();
  if (!name || name.length > MAX_CHANNEL_NAME_LENGTH) return fail("channel_name_invalid");
  if (channelCount(state, playerId) >= channelLimit(state, p)) return fail("channel_limit_reached");

  const next = clone(state);
  const id: PrivateChannelId = `pc-${next.nextChannelId++}`;
  const channel = { id, name, members: [playerId], createdBy: playerId };
  next.channels.push(channel);
  for (const m of members) if (canJoin(next, channel.members, m)) channel.members.push(m);
  return { ok: true, state: next };
}

/**
 * Any member can invite any living player. Every failure on the invitee's side
 * gets the same error, so a refusal can't tell the inviter how many channels
 * someone is in.
 */
export function inviteToChannel(state: GameState, playerId: PlayerId, channelId: PrivateChannelId, inviteeId: PlayerId): ActionResult {
  const p = findPlayer(state, playerId);
  const channel = state.channels.find((c) => c.id === channelId);
  if (!p || !p.alive || state.phase !== "playing" || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  if (!canJoin(state, channel.members, inviteeId)) return fail("channel_invite_refused");
  const next = clone(state);
  next.channels.find((c) => c.id === channelId)!.members.push(inviteeId);
  return { ok: true, state: next };
}

/** Whether a living player outside the channel has a free channel slot. */
function canJoin(state: GameState, members: readonly PlayerId[], inviteeId: PlayerId): boolean {
  const invitee = findPlayer(state, inviteeId);
  return !!invitee && invitee.alive && !members.includes(inviteeId) && channelCount(state, inviteeId) < channelLimit(state, invitee);
}

/** The last member to leave deletes the channel and its messages. */
export function leaveChannel(state: GameState, playerId: PlayerId, channelId: PrivateChannelId): ActionResult {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!findPlayer(state, playerId) || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  const next = clone(state);
  removeFromChannel(next, channelId, playerId);
  return { ok: true, state: next };
}

