// Wire messages between clients and the server. Everything arriving from a
// client is untrusted: always go through the parse* functions.

import { isBiosOption } from "./bios.ts";
import { isActopiCheat, isCheat, isRoleCheat, type ActopiCheat, type Cheat, type RoleCheat } from "./cheats.ts";
import { isCharacterId, type CharacterId } from "./characters.ts";
import { MAX_CHAT_LENGTH } from "./chat.ts";
import { isSkill } from "./skills.ts";
import { MAX_SPOT_CELL } from "./spot.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type Action, type ChannelId, type PlayerId, type PlayerView, type PrivateChannelId, type ThreadId } from "./types.ts";

export const MAX_NAME_LENGTH = 24;

export const LOBBY_LANGUAGES = ["en", "fr", "es"] as const;
export type LobbyLanguage = (typeof LOBBY_LANGUAGES)[number];

// Matchmaker ("matchmaker" party). One room per language: "en", "fr", "es" (LOBBY_LANGUAGES).
// Any connection, joining or just watching, is sent `queued` on connect and whenever the count changes: `waiting` is
// how many are aboard the language's open ship (in pre-selection), out of `seats`. `queue` boards that ship at once
// (`matched`); `character` is the crew member picked in the lobby, refused if someone aboard already has it.
export type MatchmakerClientMessage = { type: "queue"; name: string; character: CharacterId };
export type MatchmakerServerMessage =
  | { type: "queued"; waiting: number; seats: number }
  | { type: "characterTaken" }
  | { type: "matched"; roomId: string; token: string }
  | { type: "error"; message: string };

// Game room ("game-room" party). The seat token goes in the connection URL (?token=).
export type GameClientMessage =
  | { type: "action"; action: Action }
  // Cancels your queued actions and the one under way (queue.ts).
  | { type: "clearQueue" }
  // Walk to a cell of your room, sitting if it's a chair (spot.ts). Free; not an action.
  | { type: "walk"; x: number; y: number; sitting: boolean }
  | { type: "chat"; channel: ChannelId; text: string }
  | { type: "toggleCheckbox"; message: number; line: number }
  | { type: "createChannel"; name: string }
  // A thread under global chat, started from global message `from` or on its own.
  | { type: "createThread"; name: string; from?: number }
  | { type: "invite"; channel: PrivateChannelId; player: PlayerId }
  | { type: "leaveChannel"; channel: PrivateChannelId }
  // Development only: the server refuses it unless cheats are enabled (cheats.ts).
  | { type: "cheat"; cheat: Cheat; on: boolean }
  | { type: "actopiCheat"; mode: ActopiCheat }
  | { type: "roleCheat"; role: RoleCheat };
export type GameServerMessage =
  // `cheatsAllowed` is the server's dev flag, so the client knows whether to offer cheats. It is not game state.
  // `now` is the server's clock when sent, so the client can draw action bars (server ms) against its own clock.
  // `nextCycleAt` is when the next cycle begins on the server's clock (the same for everyone, so not hidden).
  | { type: "view"; view: PlayerView; cheatsAllowed: boolean; now: number; nextCycleAt: number }
  | { type: "error"; message: string };

export function parseMatchmakerMessage(raw: string): MatchmakerClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type !== "queue" || typeof msg.name !== "string" || !isCharacterId(msg.character)) return null;
  const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  return { type: "queue", name, character: msg.character };
}

export function parseGameMessage(raw: string): GameClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type === "chat") {
    // Generous bound here; moderation and the rules enforce the real limit.
    const channel = (msg.channel === MUSH_CHANNEL ? MUSH_CHANNEL : msg.channel === GRAVEYARD_CHANNEL ? GRAVEYARD_CHANNEL : undefined) ?? CHAT_CHANNELS.find((c) => c === msg.channel) ?? privateChannelId(msg.channel) ?? threadId(msg.channel);
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
    return typeof msg.name === "string" && msg.name.length <= MAX_NAME_LENGTH * 4 ? { type: "createChannel", name: msg.name } : null;
  }
  if (msg?.type === "createThread") {
    if (typeof msg.name !== "string" || msg.name.length > MAX_NAME_LENGTH * 4) return null;
    if (msg.from === undefined) return { type: "createThread", name: msg.name };
    return Number.isSafeInteger(msg.from) ? { type: "createThread", name: msg.name, from: msg.from as number } : null;
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
  if (msg?.type === "clearQueue") return { type: "clearQueue" };
  if (msg?.type === "walk") {
    const { x, y, sitting } = msg;
    return [x, y].every((n) => Number.isInteger(n) && Math.abs(n as number) <= MAX_SPOT_CELL) && typeof sitting === "boolean"
      ? { type: "walk", x: x as number, y: y as number, sitting }
      : null;
  }
  if (msg?.type === "roleCheat") return isRoleCheat(msg.role) ? { type: "roleCheat", role: msg.role } : null;
  if (msg?.type === "actopiCheat") return isActopiCheat(msg.mode) ? { type: "actopiCheat", mode: msg.mode } : null;
  if (msg?.type !== "action" || !isRecord(msg.action)) return null;
  const a = msg.action;
  if (a.type === "fiery_speech" || a.type === "boring_speech") return { type: "action", action: { type: a.type } };
  if (a.type === "extract_spore") return { type: "action", action: { type: "extract_spore" } };
  if (a.type === "ready") return { type: "action", action: { type: "ready" } };
  if (a.type === "move" && typeof a.to === "string") return { type: "action", action: { type: "move", to: a.to } };
  if ((a.type === "take" || a.type === "drop") && typeof a.item === "string") {
    return { type: "action", action: { type: a.type, item: a.item } };
  }
  if (a.type === "get_up") return { type: "action", action: { type: "get_up" } };
  if (a.type === "lie_down" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "lie_down", equipment: a.equipment } };
  }
  if (a.type === "shower" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "shower", equipment: a.equipment } };
  }
  if (a.type === "access" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "access", equipment: a.equipment } };
  }
  if (a.type === "research" && typeof a.equipment === "string" && typeof a.research === "string") {
    return { type: "action", action: { type: "research", equipment: a.equipment, research: a.research } };
  }
  if (a.type === "repair_pilgred" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "repair_pilgred", equipment: a.equipment } };
  }
  if (a.type === "return_to_sol" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "return_to_sol", equipment: a.equipment } };
  }
  if (a.type === "turn_ship" && typeof a.equipment === "string" && (a.side === "left" || a.side === "right")) {
    return { type: "action", action: { type: "turn_ship", equipment: a.equipment, side: a.side } };
  }
  if ((a.type === "travel" || a.type === "leave_orbit" || a.type === "take_fuel" || a.type === "load_fuel" || a.type === "unload_fuel" || a.type === "return_fuel" || a.type === "check_combustion") && typeof a.equipment === "string") {
    return { type: "action", action: { type: a.type, equipment: a.equipment } };
  }
  if ((a.type === "contact_sol" || a.type === "contact_xyloph" || a.type === "update_neron") && typeof a.equipment === "string") {
    return { type: "action", action: { type: a.type, equipment: a.equipment } };
  }
  if (a.type === "set_bios" && typeof a.equipment === "string" && isBiosOption(a.option) && typeof a.value === "boolean") {
    return { type: "action", action: { type: "set_bios", equipment: a.equipment, option: a.option, value: a.value } };
  }
  if (a.type === "decode_rebel" && typeof a.equipment === "string" && typeof a.base === "string") {
    return { type: "action", action: { type: "decode_rebel", equipment: a.equipment, base: a.base } };
  }
  if (a.type === "project" && typeof a.equipment === "string" && typeof a.project === "string") {
    return { type: "action", action: { type: "project", equipment: a.equipment, project: a.project } };
  }
  if (a.type === "scan_planet" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "scan_planet", equipment: a.equipment } };
  }
  if (a.type === "analyze_planet" && typeof a.equipment === "string" && typeof a.planet === "string") {
    return { type: "action", action: { type: "analyze_planet", equipment: a.equipment, planet: a.planet } };
  }
  if (a.type === "delete_planet" && typeof a.planet === "string") {
    return { type: "action", action: { type: "delete_planet", planet: a.planet } };
  }
  if (a.type === "dispense" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "dispense", equipment: a.equipment } };
  }
  if (a.type === "dismantle" && typeof a.item === "string") return { type: "action", action: { type: "dismantle", item: a.item } };
  if (a.type === "dismantle" && typeof a.equipment === "string") return { type: "action", action: { type: "dismantle", equipment: a.equipment } };
  if (a.type === "uninstall" && typeof a.equipment === "string") return { type: "action", action: { type: "uninstall", equipment: a.equipment } };
  if (a.type === "consume" && typeof a.item === "string") return { type: "action", action: { type: "consume", item: a.item } };
  if (a.type === "cook" && typeof a.item === "string") return { type: "action", action: { type: "cook", item: a.item } };
  if ((a.type === "water" || a.type === "treat") && typeof a.item === "string") return { type: "action", action: { type: a.type, item: a.item } };
  if (a.type === "sow" && typeof a.item === "string" && typeof a.fruit === "string") return { type: "action", action: { type: "sow", item: a.item, fruit: a.fruit } };
  if (a.type === "express_cook" && typeof a.item === "string") return { type: "action", action: { type: "express_cook", item: a.item } };
  if (a.type === "build" && typeof a.item === "string") return { type: "action", action: { type: "build", item: a.item } };
  if (a.type === "install" && typeof a.item === "string") return { type: "action", action: { type: "install", item: a.item } };
  if (a.type === "jettison" && typeof a.item === "string") return { type: "action", action: { type: "jettison", item: a.item } };
  if ((a.type === "bond" || a.type === "dtt" || a.type === "stt" || a.type === "heal" || a.type === "punch" || a.type === "anathema" || a.type === "spike" || a.type === "accommodate" || a.type === "accept_accommodation" || a.type === "stop_accommodation") && typeof a.target === "string") {
    return { type: "action", action: { type: a.type, target: a.target } };
  }
  if (a.type === "attack" && typeof a.weapon === "string") {
    if (typeof a.target === "string") return { type: "action", action: { type: "attack", weapon: a.weapon, target: a.target } };
    if (a.target === undefined) return { type: "action", action: { type: "attack", weapon: a.weapon } };
  }
  if (a.type === "read_book" && typeof a.item === "string") return { type: "action", action: { type: "read_book", item: a.item } };
  if (a.type === "pick_skill" && isSkill(a.skill)) return { type: "action", action: { type: "pick_skill", skill: a.skill } };
  if (a.type === "examine" && isRecord(a.target) && typeof a.target.id === "string") {
    const { kind, id } = a.target;
    if (kind === "player" || kind === "equipment" || kind === "item") {
      return { type: "action", action: { type: "examine", target: { kind, id } } };
    }
  }
  return null;
}

function privateChannelId(value: unknown): PrivateChannelId | null {
  return typeof value === "string" && /^pc-\d{1,9}$/.test(value) ? (value as PrivateChannelId) : null;
}

function threadId(value: unknown): ThreadId | null {
  return typeof value === "string" && /^th-\d{1,9}$/.test(value) ? (value as ThreadId) : null;
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
