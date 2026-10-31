// Wire messages between clients and the server. Everything arriving from a
// client is untrusted: always go through the parse* functions.

import { ACTIONS, type ActionType } from "./actions.ts";
import { isCheat, isRoleCheat, type Cheat, type RoleCheat } from "./cheats.ts";
import { isCharacterId, type CharacterId } from "./characters.ts";
import { MAX_CHAT_LENGTH } from "./chat.ts";
import { MAX_SHARED_PLANET_LENGTH } from "./sharedPlanets.ts";
import { isSpotCell } from "./spot.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type Action, type ChannelId, type PlayerId, type PlayerView, type PrivateChannelId, type SharedPlanetId, type ThreadId } from "./types.ts";

export const MAX_NAME_LENGTH = 24;

export const LOBBY_LANGUAGES = ["en", "fr", "es"] as const;
export type LobbyLanguage = (typeof LOBBY_LANGUAGES)[number];

// Matchmaker ("matchmaker" party). One room per language: "en", "fr", "es" (LOBBY_LANGUAGES).
// Any connection, joining or just watching, is sent `queued` on connect and whenever the count changes: `waiting` is
// how many are aboard the language's open ship (in pre-selection), out of `seats`, and which characters they hold (`taken`). `queue` boards that ship at once
// (`matched`); `character` is the crew member picked in the lobby, refused if someone aboard already has it.
// `singlePlayer` launches a new single-player game (singlePlayer.ts) instead, for this player alone (`matched`).
export type MatchmakerClientMessage = { type: "queue" | "singlePlayer"; name: string; character: CharacterId };
export type MatchmakerServerMessage =
  | { type: "queued"; waiting: number; seats: number; taken: CharacterId[] }
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
  | { type: "toggleCheckbox"; message: number; line: number }
  | { type: "createChannel"; name?: string; members?: PlayerId[] }
  // A thread under global chat, started from global message `from` or on its own.
  | { type: "createThread"; name: string; from?: number }
  // Shares one of your planets in the Astrophysics feature, as free text (sharedPlanets.ts).
  | { type: "sharePlanet"; planet: string; text: string }
  | { type: "invite"; channel: PrivateChannelId; player: PlayerId }
  | { type: "leaveChannel"; channel: PrivateChannelId }
  // Single player only, from the human seat: the player's own model key for the bots (BYOK, #216). Never an input:
  // inputs are recorded, so the key would be stored. Held in memory until the seat's last connection closes, so the
  // client sends it again on reconnect. `clearModel` drops it.
  | { type: "setModel"; provider: ModelProvider; model: string; apiKey: string }
  | { type: "clearModel" }
  // Development only: the server refuses it unless cheats are enabled (cheats.ts).
  | { type: "cheat"; cheat: Cheat; on: boolean }
  | { type: "roleCheat"; role: RoleCheat }
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
  | { type: "error"; message: string };

export function parseMatchmakerMessage(raw: string): MatchmakerClientMessage | null {
  const msg = parseJson(raw);
  if ((msg?.type !== "queue" && msg?.type !== "singlePlayer") || typeof msg.name !== "string" || !isCharacterId(msg.character)) return null;
  const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  return { type: msg.type, name, character: msg.character };
}

export function parseGameMessage(raw: string): GameClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type === "chat") {
    // Generous bound here; moderation and the rules enforce the real limit.
    const channel = (msg.channel === MUSH_CHANNEL ? MUSH_CHANNEL : msg.channel === GRAVEYARD_CHANNEL ? GRAVEYARD_CHANNEL : undefined) ?? CHAT_CHANNELS.find((c) => c === msg.channel) ?? privateChannelId(msg.channel) ?? threadId(msg.channel) ?? sharedPlanetId(msg.channel);
    if (!channel || typeof msg.text !== "string" || msg.text.length > MAX_CHAT_LENGTH * 4) return null;
    return { type: "chat", channel, text: msg.text };
  }
  if (msg?.type === "toggleCheckbox") {
    const { message, line } = msg;
    return Number.isSafeInteger(message) && Number.isSafeInteger(line) && (line as number) >= 0
      ? { type: "toggleCheckbox", message: message as number, line: line as number }
      : null;
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
    return Number.isSafeInteger(msg.from) ? { type: "createThread", name: msg.name, from: msg.from as number } : null;
  }
  if (msg?.type === "sharePlanet") {
    // Generous bound here, as for chat; moderation and the rules enforce the real limit.
    if (typeof msg.planet !== "string" || msg.planet.length > 64 || typeof msg.text !== "string" || msg.text.length > MAX_SHARED_PLANET_LENGTH * 4) return null;
    return { type: "sharePlanet", planet: msg.planet, text: msg.text };
  }
  if (msg?.type === "invite") {
    const channel = privateChannelId(msg.channel);
    return channel && typeof msg.player === "string" ? { type: "invite", channel, player: msg.player } : null;
  }
  if (msg?.type === "leaveChannel") {
    const channel = privateChannelId(msg.channel);
    return channel ? { type: "leaveChannel", channel } : null;
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
  if (msg?.type !== "action" || !isRecord(msg.action)) return null;
  const a = msg.action;
  // `hasOwn`, not `in` or a lookup: those would find "constructor" and the like on the prototype.
  if (typeof a.type !== "string" || !Object.hasOwn(ACTIONS, a.type)) return null;
  const action = ACTIONS[a.type as ActionType].parse(a);
  return action && { type: "action", action };
}

function privateChannelId(value: unknown): PrivateChannelId | null {
  return typeof value === "string" && /^pc-\d{1,9}$/.test(value) ? (value as PrivateChannelId) : null;
}

function threadId(value: unknown): ThreadId | null {
  return typeof value === "string" && /^th-\d{1,9}$/.test(value) ? (value as ThreadId) : null;
}

function sharedPlanetId(value: unknown): SharedPlanetId | null {
  return typeof value === "string" && /^sp-\d{1,9}$/.test(value) ? (value as SharedPlanetId) : null;
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
