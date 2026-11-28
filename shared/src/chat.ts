// ---- Chat ------------------------------------------------------------------
// Storage (pushChat, removeFromChannel), which infection.ts and death.ts also
// use, then the player-facing chat and private-channel rules. Chat is not an
// Action: free text can't be enumerated in legalActions. Moderation (filtering,
// rate limits) is the server's job before these run.

import { ITRACKIE_ITEM } from "./itemIds.ts";
import { itemsIn, isWorking } from "./items.ts";
import { channelLimit, isDeaf, isMute, spokenText } from "./modifiers.ts";
import { noITrackieNeeded } from "./comms.ts";
import { cloneState, fail, dayOf, findPlayer, type ActionResult } from "./helpers.ts";
import { dropChannelPlans, leavePlans } from "./plans.ts";
import { isComatose } from "./statuses.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL } from "./types.ts";
import type { ChannelId, ChatMark, ChatMessage, ChatOutbox, GameState, PlayerId, PlayerState, PrivateChannelId, SeqRange, SharedPlanetId, SharedReportId, ThreadId } from "./types.ts";

/** Longest chat message the rules accept. Moderation trims before this. */
/** A private channel's id from untrusted input, or null. */
export function privateChannelId(value: unknown): PrivateChannelId | null {
  return typeof value === "string" && /^pc-\d{1,9}$/.test(value) ? (value as PrivateChannelId) : null;
}

export const MAX_CHAT_LENGTH = 300;

/** Longest chat message in lines (moderation enforces it; messages are markdown and may span lines). */
export const MAX_CHAT_LINES = 12;

/** Messages in a chat page (owner, 2026-11-04, #355). A full page is sealed: nothing is added to it or removed again. */
export const CHAT_PAGE = 50;

/** The page a message with this `seq` is on. */
export const chatPageOf = (seq: number): number => Math.floor(seq / CHAT_PAGE);

/** Where the server stores a sealed page. */
export const chatPageKey = (channel: ChannelId, page: number): string => `chat:${channel}:${page}`;

/**
 * Mutates a state that the caller already cloned. Assigns the id, `seq` and cycle. The first message of a new page
 * seals the full page before it: that page becomes the tail and goes to the outbox to be stored, and the old tail
 * leaves the state (it was stored when it sealed). Sealing on overflow, not when the page fills, keeps the message an
 * input just posted in `state.chat`, where the server stamps and finds it.
 */
export function pushChat(state: GameState, channel: ChannelId, message: Omit<ChatMessage, "id" | "seq" | "cycle" | "channel">): void {
  const seq = state.chatSeq[channel] ?? 0;
  if (seq > 0 && seq % CHAT_PAGE === 0) {
    const page = chatPageOf(seq) - 1;
    const messages = state.chat.filter((m) => m.channel === channel && chatPageOf(m.seq) === page).map((m) => ({ ...m }));
    state.chatOutbox.sealed.push({ channel, page, messages });
    state.chat = state.chat.filter((m) => m.channel !== channel || chatPageOf(m.seq) >= page);
  }
  state.chatSeq[channel] = seq + 1;
  state.chat.push({ id: state.nextChatId++, seq, cycle: state.cycle, channel, ...message });
  // Comatose players permanently miss every message written during their coma, system messages included (#489).
  for (const p of state.players) {
    if (!isComatose(state, p)) continue;
    const unheard = (p.unheard ??= {});
    unheard[channel] = withSeq(unheard[channel] ?? [], seq);
  }
  // A checklist keeps its ticks beside the chat, starting from the boxes as typed (phase 2 of the plan).
  if (message.from === null) return;
  // Whoever is deaf now never hears it (Damaged or Destroyed Ears; owner, 2026-11-17).
  for (const p of state.players) {
    if (p.id === message.from || !isDeaf(p) || isComatose(state, p)) continue;
    const unheard = (p.unheard ??= {});
    unheard[channel] = withSeq(unheard[channel] ?? [], seq);
  }
  const tasks = taskLines(message.text);
  if (tasks.length > 0) {
    state.chatMarks[chatMarkKey(channel, seq)] = { from: message.from, tasks: tasks.map((t) => t.line), checked: tasks.filter((t) => t.ticked).map((t) => t.line) };
  }
}

/** Where `GameState.chatMarks` keeps a message's ticks. Channel ids never contain a colon. */
export const chatMarkKey = (channel: ChannelId, seq: number): string => `${channel}:${seq}`;

/** Empties the state's outbox and returns what was in it. The server stores it after every input; a replay keeps it. */
export function takeChatOutbox(state: GameState): ChatOutbox {
  const outbox = state.chatOutbox;
  state.chatOutbox = { sealed: [], dropped: [] };
  return outbox;
}

/**
 * Takes a member out of a private channel, with their claims on its plan (plans.ts). The last one out deletes the
 * channel, its messages and its plans. Returns whether the channel still exists. Mutates a state that the caller
 * already cloned.
 */
export function removeFromChannel(state: GameState, channelId: PrivateChannelId, playerId: PlayerId): boolean {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return false;
  leavePlans(state, channelId, playerId);
  channel.members = channel.members.filter((m) => m !== playerId);
  if (channel.members.length > 0) return true;
  state.channels = state.channels.filter((c) => c.id !== channelId);
  state.chat = state.chat.filter((m) => m.channel !== channelId);
  for (const key of Object.keys(state.chatMarks)) if (key.startsWith(`${channelId}:`)) delete state.chatMarks[key];
  // Its stored pages go too, and any that sealed in this same input are never stored.
  const count = state.chatSeq[channelId] ?? 0;
  delete state.chatSeq[channelId];
  state.chatOutbox.sealed = state.chatOutbox.sealed.filter((p) => p.channel !== channelId);
  if (count > CHAT_PAGE) state.chatOutbox.dropped.push({ channel: channelId, pages: chatPageOf(count - 1) });
  dropChannelPlans(state, channelId);
  return false;
}

/**
 * Channels a player may read. The living read what they can post to; the dead
 * (decided 2026-10-16, #45) read global chat and the feature threads without an
 * iTrackie, and a dead Mush also the Mush channel. Private channels are gone:
 * dying leaves them.
 */
/**
 * Whether `player` hears this message: anything but another player's message posted while they were deaf (Damaged or
 * Destroyed Ears, `PlayerState.unheard`; owner 2026-11-17). Their own and the game's (system) messages always arrive.
 */
export function heardBy(player: Readonly<PlayerState>, m: Readonly<Pick<ChatMessage, "channel" | "seq">>): boolean {
  return !inRanges(player.unheard?.[m.channel], m.seq);
}

/** `ranges` with `seq` added: it extends the last range when it follows on, so a deaf or comatose stretch stays one range. */
export function withSeq(ranges: readonly SeqRange[], seq: number): SeqRange[] {
  const last = ranges.at(-1);
  if (last && last[1] === seq) return [...ranges.slice(0, -1), [last[0], seq + 1]];
  return [...ranges, [seq, seq + 1]];
}

/** Whether `seq` is in one of `ranges`. */
export function inRanges(ranges: readonly SeqRange[] | undefined, seq: number): boolean {
  return (ranges ?? []).some(([from, to]) => seq >= from && seq < to);
}

/** How many positions from `from` (inclusive) to `to` (exclusive) are in `ranges`. */
export function countInRanges(ranges: readonly SeqRange[] | undefined, from: number, to: number): number {
  let n = 0;
  for (const [a, b] of ranges ?? []) n += Math.max(0, Math.min(b, to) - Math.max(a, from));
  return n;
}

export function readChannels(state: Readonly<GameState>, player: Readonly<PlayerState>): ChannelId[] {
  if (isComatose(state, player)) return [];
  if (player.alive) return chatChannels(state, player);
  if (state.phase !== "playing") return [];
  const mush: ChannelId[] = player.role === "mush" ? [MUSH_CHANNEL] : [];
  return [...CHAT_CHANNELS, ...threadIds(state), ...mush, GRAVEYARD_CHANNEL];
}

/**
 * Threads go wherever global chat goes, and so do shared planets' and shared reports' threads: they have their
 * feature's access (owner, 2026-10-31 and 2026-11-07), which is global chat's.
 */
const threadIds = (state: Readonly<GameState>): (ThreadId | SharedPlanetId | SharedReportId)[] => [
  ...state.threads.map((t) => t.id),
  ...state.sharedPlanets.map((s) => s.id),
  ...state.sharedReports.map((s) => s.id),
];

/**
 * Channels a player may post to (and so read). The dead post only in the graveyard. Global chat and every feature thread
 * need an iTrackie in your inventory (confirmed 2026-10-13); drop it and you
 * lose them, pick one up and you see the whole history.
 */
export function chatChannels(state: Readonly<GameState>, player: Readonly<PlayerState>): ChannelId[] {
  if (state.phase !== "playing" || isComatose(state, player)) return [];
  // The graveyard is the one place the dead may post (decided 2026-10-17), and no iTrackie is needed.
  if (!player.alive) return [GRAVEYARD_CHANNEL];
  // The Mush channel is a link between the Mush, not a device: no iTrackie needed (decided 2026-10-16).
  const mush: ChannelId[] = player.role === "mush" ? [MUSH_CHANNEL] : [];
  const hasITrackie = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === ITRACKIE_ITEM && isWorking(i));
  // Luyten-Ceti's brain probes stand in for the iTrackie once that rebel base is reached (owner, 2026-10-21).
  if (!hasITrackie && !noITrackieNeeded(state)) return mush;
  return [...CHAT_CHANNELS, ...threadIds(state), ...mush, ...state.channels.filter((c) => c.members.includes(player.id)).map((c) => c.id)];
}

export function sendChat(state: GameState, playerId: PlayerId, channel: ChannelId, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return { ok: false, error: "unknown_player" };
  if (!chatChannels(state, p).includes(channel)) return { ok: false, error: "cant_post" };
  // Torn Tongue: no post in any channel (owner, 2026-11-17).
  if (isMute(p)) return { ok: false, error: "cant_speak" };
  if (text.trim().length > MAX_CHAT_LENGTH) return { ok: false, error: "message_too_long" };
  // Missing Teeth drops letters (owner, 2026-11-22); a message left with nothing to say is refused as empty.
  const body = spokenText(p, text.trim()).trim();
  if (!body) return { ok: false, error: "empty_message" };

  const next: GameState = {
    ...state,
    players: state.players.some((pl) => isDeaf(pl) || isComatose(state, pl))
      ? state.players.map((pl) => (isDeaf(pl) || isComatose(state, pl) ? { ...pl, ...(pl.unheard && { unheard: { ...pl.unheard } }) } : pl))
      : state.players,
    chat: state.chat.map((m) => (m.at === undefined ? { ...m } : m)),
    chatSeq: { ...state.chatSeq },
    chatMarks: { ...state.chatMarks },
    chatOutbox: {
      sealed: state.chatOutbox.sealed.map((p) => ({ ...p, messages: p.messages.map((m) => ({ ...m })) })),
      dropped: [...state.chatOutbox.dropped],
    },
  };
  pushChat(next, channel, { from: p.id, isBot: p.isBot, text: body });
  return { ok: true, state: next };
}

/** A markdown task-list line: optional quote marks and indent, a list marker, then `[ ]` or `[x]`. */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\])/;

/** The task-list items of `text` outside fenced code blocks: each one's 0-based line and whether it was typed ticked. */
export function taskLines(text: string): { line: number; ticked: boolean }[] {
  const tasks: { line: number; ticked: boolean }[] = [];
  let fence: string | null = null;
  text.split("\n").forEach((source, line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(source)?.[1];
    if (marker) fence = fence === null ? marker[0]! : source.trimStart().startsWith(fence) ? null : fence;
    else if (fence === null) {
      const box = TASK_LINE.exec(source)?.[2];
      if (box !== undefined) tasks.push({ line, ticked: box !== " " });
    }
  });
  return tasks;
}

/**
 * `text` with each task line's box drawn from the ticks: `[x]` for a line in `checked`, `[ ]` for the others. Without
 * ticks (no entry: not a checklist, or a private channel since deleted), the text as typed. Every view uses it; the
 * state and the stored pages keep the text as typed.
 */
export function markedText(text: string, mark: Readonly<Pick<ChatMark, "tasks" | "checked">> | undefined): string {
  if (!mark) return text;
  const lines = text.split("\n");
  for (const line of mark.tasks) {
    if (lines[line] === undefined) continue;
    const box = mark.checked.includes(line) ? "x" : " ";
    lines[line] = lines[line].replace(TASK_LINE, (_, head: string, _mark: string, tail: string) => `${head}${box}${tail}`);
  }
  return lines.join("\n");
}

/**
 * Tick or untick a markdown checkbox in a message (`line` is the 0-based line of the item). Only the author may, and
 * only while they can still post to the channel. The ticks live in `chatMarks`, not the text (owner, 2026-11-06), so
 * this needs only the state and works the same on a message in any page, sealed or not.
 */
export function toggleCheckbox(state: GameState, playerId: PlayerId, channel: ChannelId, seq: number, line: number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  const key = chatMarkKey(channel, seq);
  const mark = Object.hasOwn(state.chatMarks, key) ? state.chatMarks[key] : undefined;
  if (!mark || !chatChannels(state, p).includes(channel)) return fail("message_not_found");
  if (mark.from !== p.id) return fail("message_not_yours");
  if (!mark.tasks.includes(line)) return fail("checkbox_not_found");

  const next = cloneState(state);
  const target = next.chatMarks[key]!;
  target.checked = target.checked.includes(line) ? target.checked.filter((l) => l !== line) : [...target.checked, line].sort((a, b) => a - b);
  return { ok: true, state: next };
}

// ---- Threads ---------------------------------------------------------------
// Discord-style threads under global chat (decided 2026-10-21). Anyone who can
// post in global chat may start one, on its own or from a global message (one
// thread per message), and its access is global chat's. No cap on how many.

export const MAX_THREAD_NAME_LENGTH = 40;

/** `fromMessage` is a global message's `seq`. Global messages are never deleted, so any `seq` below the count exists. */
export function createThread(state: GameState, playerId: PlayerId, rawName: string, fromMessage?: number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !chatChannels(state, p).includes("global")) return fail("thread_forbidden");
  // A name is one line.
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_THREAD_NAME_LENGTH) return fail("thread_name_invalid");
  if (fromMessage !== undefined) {
    if (!Number.isSafeInteger(fromMessage) || fromMessage < 0 || fromMessage >= (state.chatSeq.global ?? 0)) return fail("message_not_found");
    if (state.threads.some((t) => t.from === fromMessage)) return fail("thread_exists");
  }

  const next = cloneState(state);
  const id: ThreadId = `th-${next.nextThreadId++}`;
  next.threads.push({ id, name, ...(fromMessage !== undefined && { from: fromMessage }), createdBy: playerId, cycle: next.cycle });
  return { ok: true, state: next };
}

// ---- Private channels ------------------------------------------------------
// Membership is the only access control (confirmed 2026-10-13): anyone in a
// channel may invite anyone, from any room, and new members see the history.
// Creating one and reading and posting need an iTrackie (chatChannels). Joining is
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
export function createChannel(state: GameState, playerId: PlayerId, rawName = "", members: readonly PlayerId[] = []): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !p.alive || isComatose(state, p) || state.phase !== "playing") return fail("channel_forbidden");
  // Torn Tongue: no new private channel either (owner, 2026-11-17).
  if (isMute(p)) return fail("cant_speak");
  // Opening a channel needs an iTrackie, or whatever stands in for one in chat (owner, 2026-11-27): the access to
  // global chat. Invites don't (the invitee reads once they hold one).
  if (!chatChannels(state, p).includes("global")) return fail("channel_needs_itrackie");
  const name = rawName.trim();
  if (name.length > MAX_CHANNEL_NAME_LENGTH) return fail("channel_name_invalid");
  if (channelCount(state, playerId) >= channelLimit(state, p)) return fail("channel_limit_reached");

  const next = cloneState(state);
  const id: PrivateChannelId = `pc-${next.nextChannelId++}`;
  const channel = { id, name, members: [playerId], createdBy: playerId, ...dayOf(next) };
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
  if (!p || !p.alive || isComatose(state, p) || state.phase !== "playing" || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  if (!canJoin(state, channel.members, inviteeId)) return fail("channel_invite_refused");
  const next = cloneState(state);
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
  const p = findPlayer(state, playerId);
  const channel = state.channels.find((c) => c.id === channelId);
  if (!p || isComatose(state, p) || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  const next = cloneState(state);
  removeFromChannel(next, channelId, playerId);
  return { ok: true, state: next };
}

