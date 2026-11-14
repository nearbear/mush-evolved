// Wire messages between clients and the server. Everything arriving from a
// client is untrusted: always go through the parse* functions.

import { ACTIONS, type ActionType } from "./actions.ts";
import { isCheat, isRoleCheat, type Cheat, type RoleCheat } from "./cheats.ts";
import { isCharacterId, type CharacterId } from "./characters.ts";
import { MAX_CHAT_LENGTH, privateChannelId } from "./chat.ts";
import { MAX_CHAT_READ_ENTRIES, type ChatRead } from "./chatRead.ts";
import { isRecord } from "./helpers.ts";
import { parsePlanDraft } from "./plans.ts";
import { MAX_SHARED_PLANET_LENGTH } from "./sharedPlanets.ts";
import { isSpotCell } from "./spot.ts";
import {
  CHAT_CHANNELS,
  GRAVEYARD_CHANNEL,
  MUSH_CHANNEL,
  type Action,
  type ChannelId,
  type ChatLine,
  type ChatMark,
  type PlanDraft,
  type PlayerId,
  type PlayerView,
  type PrivateChannelId,
  type SharedPlanetId,
  type SharedReportId,
  type ThreadId,
} from "./types.ts";

export const MAX_NAME_LENGTH = 24;
/** A setup's id (setups.ts): a UUID, or "standard". */
export const MAX_SETUP_ID_LENGTH = 64;

export const LOBBY_LANGUAGES = ["en", "fr", "es"] as const;
export type LobbyLanguage = (typeof LOBBY_LANGUAGES)[number];

// Matchmaker ("matchmaker" party). One room per language: "en", "fr", "es" (LOBBY_LANGUAGES).
// Any connection, joining or just watching, is sent `queued` on connect and whenever the count changes: `waiting` is
// how many are aboard the language's open ship (in pre-selection), out of `seats`, and which characters they hold (`taken`). `queue` boards that ship at once
// (`matched`); `character` is the crew member picked in the lobby, refused if someone aboard already has it.
// `singlePlayer` launches a new single-player game (singlePlayer.ts) instead, for this player alone (`matched`).
// `resume` takes the signed-in account back to the multiplayer ship it is aboard, in any language (#320): `matched`, or
// the error `not_aboard` when it isn't on one any more (the game ended, the ship was retired, or it died), or
// `ship_unavailable` when it is aboard a ship this build can't read (#384; also sent for `queue`, and the game socket
// closes with code 4002).
//
// Vote round (#236, setups.ts "Voting"). `vote` casts or changes the signed-in account's vote for a setup on the ballot
// (the standard setup, or a listed setup's newest version), for its lobby's queue; it works after joining too. Refused
// with `voteRefused`: `sign_in_required`, `unknown_setup` (not on the ballot), or `vote_failed` (the server couldn't
// check it; try again). Every connection gets `votes` on connect and whenever the counts or the round change: the
// counts per setup id (only ever totals, never who voted what), when the round closes (the open ship's deadline, or
// earlier if it fills; null while no ship is open: the round then closes with the next ship launched), and
// `nextSetupId`, the setup already picked for the next ship to launch when no ship is open (null while one is: the
// round under way picks it). `myVote` is the account's own vote, sent only to its connections: on connect when signed
// in, when it votes, and null when a round closes (unless it has already voted in the new one). `queued` carries the
// open ship's setup id (`openSetupId`, null when none is open), and `seats` is the next ship's when none is open.
export type MatchmakerClientMessage =
  | { type: "queue" | "singlePlayer"; name: string; character: CharacterId }
  | { type: "resume" }
  | { type: "vote"; setupId: string };
export type VoteRefusal = "sign_in_required" | "unknown_setup" | "vote_failed";
export type MatchmakerServerMessage =
  | { type: "queued"; waiting: number; seats: number; taken: CharacterId[]; openSetupId: string | null }
  | { type: "votes"; counts: Record<string, number>; closesAt: number | null; nextSetupId: string | null }
  | { type: "myVote"; setupId: string | null }
  | { type: "voteRefused"; reason: VoteRefusal }
  | { type: "characterTaken" }
  | { type: "matched"; roomId: string; token: string }
  | { type: "error"; message: string };

/**
 * Why a game's model bots are waiting, so the cycle (which waits for them) is paused (owner, 2026-10-24, #114):
 * `unavailable` while calls fail and are retried, `key` once the provider refused the key or the request (bad key, no credit, unknown model, a refused setting),
 * `budget` once the game's call budget is spent. Never sent where bots have no key: those play scripted.
 */
export type BotPause = "unavailable" | "key" | "budget";

/**
 * Model providers a player may bring their own key for (BYOK, single player). The server maps each to its base URL
 * (server/src/model.ts); clients never send a URL. OpenRouter only for now (owner, 2026-10-24); more in #217.
 */
export const MODEL_PROVIDERS = ["openrouter"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

// Game room ("game-room" party). The seat token goes in the connection URL (?token=).
export type GameClientMessage =
  | { type: "action"; action: Action }
  // Cancels your queued actions and the one under way (queue.ts).
  | { type: "clearQueue" }
  // Closes the pop-up telling a Transfer's victim who took their body (mind.ts).
  | { type: "acknowledgeTransfer" }
  // Walk to a cell of your room, sitting if it's a chair (spot.ts). Free; not an action. Pushing a wheelchair, the
  // cell is where it goes, and `behind` where you end up behind it.
  | { type: "walk"; x: number; y: number; sitting: boolean; behind?: { x: number; y: number } }
  | { type: "chat"; channel: ChannelId; text: string }
  // A message is named by its channel and `seq`, never its game-wide id (ChatMessage.id says why).
  | { type: "toggleCheckbox"; channel: ChannelId; seq: number; line: number }
  // One page of a channel (#355), answered with `chatPage`. Read-only: not an input, never recorded.
  | { type: "chatPage"; channel: ChannelId; page: number }
  // How far the seat has read each channel (#400, chatRead.ts). Never answered: a refusal, a rate limit and a count
  // that is no news all look the same. Not an input, never recorded.
  | { type: "chatRead"; read: ChatRead }
  | { type: "createChannel"; name?: string; members?: PlayerId[] }
  // A thread under global chat, started from the global message whose `seq` is `from`, or on its own.
  | { type: "createThread"; name: string; from?: number }
  // Shares one of your planets in the Astrophysics feature, as free text (sharedPlanets.ts).
  | { type: "sharePlanet"; planet: string; text: string }
  // Shares the report of an expedition you went on in the Expeditions feature, as free text (sharedReports.ts).
  | { type: "shareReport"; report: string; text: string }
  | { type: "invite"; channel: PrivateChannelId; player: PlayerId }
  | { type: "leaveChannel"; channel: PrivateChannelId }
  // The channel's creator posts its plan (plans.ts, docs/plans/on-call.md). Chat-like, since a draft can't be
  // enumerated as an action; claiming, withdrawing, Done, cancelling and Go are ordinary actions. No free text.
  | { type: "postPlan"; plan: PlanDraft }
  // Single player only, from the human seat: the player's own model key for the bots (BYOK, #216). Never an input:
  // inputs are recorded, so the key would be stored. Held in memory until the seat's last connection closes, so the
  // client sends it again on reconnect. `clearModel` drops it.
  | { type: "setModel"; provider: ModelProvider; model: string; apiKey: string }
  | { type: "clearModel" }
  // Development only: the server refuses it unless cheats are enabled (cheats.ts).
  | { type: "cheat"; cheat: Cheat; on: boolean }
  | { type: "roleCheat"; role: RoleCheat }
  // Development only: the ship returns to Sol now, ending the game (a dev route to a finished game and its replay).
  | { type: "solCheat" }
  // Development only: takes the sender to the cheat room (#170), on a ship that has one. Not an action.
  | { type: "cheatRoom" }
  // Development only, like the cheats: frees the sender's account from this ship at once, so the lobby offers other
  // ships. Not an input: the rules never see it, and the character stays aboard unplayed.
  | { type: "leaveShip" };
export type GameServerMessage =
  // `cheatsAllowed` is the server's dev flag, so the client knows whether to offer cheats. It is not game state.
  // `now` is the server's clock when sent, so the client can draw action bars (server ms) against its own clock.
  // `nextCycleAt` is when the next cycle begins on the server's clock (the same for everyone, so not hidden); null in
  // single player, where cycles end only by End cycle. `botsPaused` says why model bots are waiting instead of
  // playing, or null (see BotPause).
  | { type: "view"; view: PlayerView; cheatsAllowed: boolean; now: number; nextCycleAt: number | null; botsPaused: BotPause | null }
  // A checklist's ticks changed on a message two or more pages back, which no view carries (#355): the reader redraws a
  // copy it fetched (`markedText`). Only to connections whose body reads the channel; never an `id`.
  | { type: "chatEdit"; channel: ChannelId; seq: number; mark: Pick<ChatMark, "tasks" | "checked"> }
  // The page a `chatPage` asked for, as a view carries chat (ticks drawn in, no `id`). Every refusal is the one error
  // `chat_page_unavailable`, so it can't tell a channel you can't read from a page not begun.
  | { type: "chatPage"; channel: ChannelId; page: number; messages: ChatLine[] }
  // The seat's read counts for the channels its body reads now (#400, `chatReadFor`): on connect after the view, and to
  // the seat's other connections when they rise. Only ever to that seat.
  | { type: "chatRead"; read: ChatRead }
  | { type: "error"; message: string };

export function parseMatchmakerMessage(raw: string): MatchmakerClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type === "resume") return { type: "resume" };
  if (msg?.type === "vote") {
    const { setupId } = msg;
    return typeof setupId === "string" && setupId !== "" && setupId.length <= MAX_SETUP_ID_LENGTH ? { type: "vote", setupId } : null;
  }
  if ((msg?.type !== "queue" && msg?.type !== "singlePlayer") || typeof msg.name !== "string" || !isCharacterId(msg.character)) return null;
  const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  return { type: msg.type, name, character: msg.character };
}

/** A chat channel's id from untrusted input, or null. */
function channelId(value: unknown): ChannelId | null {
  return (value === MUSH_CHANNEL ? MUSH_CHANNEL : value === GRAVEYARD_CHANNEL ? GRAVEYARD_CHANNEL : undefined) ?? CHAT_CHANNELS.find((c) => c === value) ?? privateChannelId(value) ?? threadId(value) ?? sharedPlanetId(value) ?? sharedReportId(value);
}

export function parseGameMessage(raw: string): GameClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type === "chat") {
    // Generous bound here; moderation and the rules enforce the real limit.
    const channel = channelId(msg.channel);
    if (!channel || typeof msg.text !== "string" || msg.text.length > MAX_CHAT_LENGTH * 4) return null;
    return { type: "chat", channel, text: msg.text };
  }
  if (msg?.type === "toggleCheckbox") {
    const { seq, line } = msg;
    const channel = channelId(msg.channel);
    return channel && Number.isSafeInteger(seq) && (seq as number) >= 0 && Number.isSafeInteger(line) && (line as number) >= 0
      ? { type: "toggleCheckbox", channel, seq: seq as number, line: line as number }
      : null;
  }
  if (msg?.type === "chatPage") {
    const channel = channelId(msg.channel);
    return channel && Number.isSafeInteger(msg.page) && (msg.page as number) >= 0 ? { type: "chatPage", channel, page: msg.page as number } : null;
  }
  if (msg?.type === "chatRead") {
    const read = parseChatRead(msg.read);
    return read && { type: "chatRead", read };
  }
  if (msg?.type === "createChannel") {
    if (msg.name !== undefined && (typeof msg.name !== "string" || msg.name.length > MAX_NAME_LENGTH * 4)) return null;
    const name = msg.name === undefined ? {} : { name: msg.name };
    if (msg.members === undefined) return { type: "createChannel", ...name };
    // Ships have at most 16 seats; the rules skip anyone who can't join.
    const members = msg.members;
    if (!Array.isArray(members) || members.length > 16 || !members.every((m) => typeof m === "string" && m.length <= 64)) return null;
    return { type: "createChannel", ...name, members };
  }
  if (msg?.type === "createThread") {
    if (typeof msg.name !== "string" || msg.name.length > MAX_NAME_LENGTH * 4) return null;
    if (msg.from === undefined) return { type: "createThread", name: msg.name };
    return Number.isSafeInteger(msg.from) && (msg.from as number) >= 0 ? { type: "createThread", name: msg.name, from: msg.from as number } : null;
  }
  if (msg?.type === "sharePlanet") {
    // Generous bound here, as for chat; moderation and the rules enforce the real limit.
    if (typeof msg.planet !== "string" || msg.planet.length > 64 || typeof msg.text !== "string" || msg.text.length > MAX_SHARED_PLANET_LENGTH * 4) return null;
    return { type: "sharePlanet", planet: msg.planet, text: msg.text };
  }
  if (msg?.type === "shareReport") {
    // Generous bound here, as for chat; moderation and the rules enforce the real limit.
    if (typeof msg.report !== "string" || msg.report.length > 64 || typeof msg.text !== "string" || msg.text.length > MAX_SHARED_PLANET_LENGTH * 4) return null;
    return { type: "shareReport", report: msg.report, text: msg.text };
  }
  if (msg?.type === "invite") {
    const channel = privateChannelId(msg.channel);
    return channel && typeof msg.player === "string" ? { type: "invite", channel, player: msg.player } : null;
  }
  if (msg?.type === "leaveChannel") {
    const channel = privateChannelId(msg.channel);
    return channel ? { type: "leaveChannel", channel } : null;
  }
  if (msg?.type === "postPlan") {
    const plan = parsePlanDraft(msg.plan);
    return plan && { type: "postPlan", plan };
  }
  if (msg?.type === "cheat") {
    return isCheat(msg.cheat) && typeof msg.on === "boolean" ? { type: "cheat", cheat: msg.cheat, on: msg.on } : null;
  }
  if (msg?.type === "setModel") {
    const { provider, model, apiKey } = msg;
    // Printable ASCII without spaces: the key goes into a header, and a model name into the request body.
    if (!MODEL_PROVIDERS.some((p) => p === provider) || typeof model !== "string" || !/^[\w.:/@-]{1,128}$/.test(model)) return null;
    if (typeof apiKey !== "string" || !/^[\x21-\x7e]{1,512}$/.test(apiKey)) return null;
    return { type: "setModel", provider: provider as ModelProvider, model, apiKey };
  }
  if (msg?.type === "clearModel") return { type: "clearModel" };
  if (msg?.type === "clearQueue") return { type: "clearQueue" };
  if (msg?.type === "acknowledgeTransfer") return { type: "acknowledgeTransfer" };
  if (msg?.type === "leaveShip") return { type: "leaveShip" };
  if (msg?.type === "walk") {
    const { x, y, sitting, behind } = msg;
    if (!isSpotCell(x, y) || typeof sitting !== "boolean") return null;
    if (behind === undefined) return { type: "walk", x: x as number, y: y as number, sitting };
    return isRecord(behind) && isSpotCell(behind.x, behind.y)
      ? { type: "walk", x: x as number, y: y as number, sitting, behind: { x: behind.x as number, y: behind.y as number } }
      : null;
  }
  if (msg?.type === "roleCheat") return isRoleCheat(msg.role) ? { type: "roleCheat", role: msg.role } : null;
  if (msg?.type === "solCheat") return { type: "solCheat" };
  if (msg?.type === "cheatRoom") return { type: "cheatRoom" };
  if (msg?.type !== "action" || !isRecord(msg.action)) return null;
  const a = msg.action;
  // `hasOwn`, not `in` or a lookup: those would find "constructor" and the like on the prototype.
  if (typeof a.type !== "string" || !Object.hasOwn(ACTIONS, a.type)) return null;
  const action = ACTIONS[a.type as ActionType].parse(a);
  return action && { type: "action", action };
}

/** A `chatRead` body from untrusted input: valid channel ids to safe non-negative counts, at most MAX_CHAT_READ_ENTRIES. */
function parseChatRead(value: unknown): ChatRead | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length > MAX_CHAT_READ_ENTRIES) return null;
  const read: ChatRead = {};
  // Own keys only, each a valid channel id, so "__proto__" and the like never reach `read`.
  for (const key of keys) {
    const channel = channelId(key);
    const count = value[key];
    if (!channel || !Number.isSafeInteger(count) || (count as number) < 0) return null;
    read[channel] = count as number;
  }
  return read;
}

function threadId(value: unknown): ThreadId | null {
  return typeof value === "string" && /^th-\d{1,9}$/.test(value) ? (value as ThreadId) : null;
}

function sharedPlanetId(value: unknown): SharedPlanetId | null {
  return typeof value === "string" && /^sp-\d{1,9}$/.test(value) ? (value as SharedPlanetId) : null;
}

function sharedReportId(value: unknown): SharedReportId | null {
  return typeof value === "string" && /^sr-\d{1,9}$/.test(value) ? (value as SharedReportId) : null;
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
