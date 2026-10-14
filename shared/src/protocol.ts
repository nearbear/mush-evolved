// Wire messages between clients and the server. Everything arriving from a
// client is untrusted: always go through the parse* functions.

import { MAX_CHAT_LENGTH } from "./rules.ts";
import { CHAT_CHANNELS, type Action, type ChannelId, type PlayerId, type PlayerView, type PrivateChannelId } from "./types.ts";

export const MAX_NAME_LENGTH = 24;

// Matchmaker ("matchmaker" party, room "global")
export type MatchmakerClientMessage = { type: "queue"; name: string };
export type MatchmakerServerMessage =
  | { type: "queued"; waiting: number; seats: number }
  | { type: "matched"; roomId: string; token: string }
  | { type: "error"; message: string };

// Game room ("game-room" party). The seat token goes in the connection URL (?token=).
export type GameClientMessage =
  | { type: "action"; action: Action }
  | { type: "chat"; channel: ChannelId; text: string }
  | { type: "createChannel"; name: string }
  | { type: "invite"; channel: PrivateChannelId; player: PlayerId }
  | { type: "leaveChannel"; channel: PrivateChannelId };
export type GameServerMessage =
  | { type: "view"; view: PlayerView }
  | { type: "error"; message: string };

export function parseMatchmakerMessage(raw: string): MatchmakerClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type !== "queue" || typeof msg.name !== "string") return null;
  const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
  return name ? { type: "queue", name } : null;
}

export function parseGameMessage(raw: string): GameClientMessage | null {
  const msg = parseJson(raw);
  if (msg?.type === "chat") {
    // Generous bound here; moderation and the rules enforce the real limit.
    const channel = CHAT_CHANNELS.find((c) => c === msg.channel) ?? privateChannelId(msg.channel);
    if (!channel || typeof msg.text !== "string" || msg.text.length > MAX_CHAT_LENGTH * 4) return null;
    return { type: "chat", channel, text: msg.text };
  }
  if (msg?.type === "createChannel") {
    return typeof msg.name === "string" && msg.name.length <= MAX_NAME_LENGTH * 4 ? { type: "createChannel", name: msg.name } : null;
  }
  if (msg?.type === "invite") {
    const channel = privateChannelId(msg.channel);
    return channel && typeof msg.player === "string" ? { type: "invite", channel, player: msg.player } : null;
  }
  if (msg?.type === "leaveChannel") {
    const channel = privateChannelId(msg.channel);
    return channel ? { type: "leaveChannel", channel } : null;
  }
  if (msg?.type !== "action" || !isRecord(msg.action)) return null;
  const a = msg.action;
  if (a.type === "ready") return { type: "action", action: { type: "ready" } };
  if (a.type === "move" && typeof a.to === "string") return { type: "action", action: { type: "move", to: a.to } };
  if ((a.type === "take" || a.type === "drop") && typeof a.item === "string") {
    return { type: "action", action: { type: a.type, item: a.item } };
  }
  if (a.type === "dispense" && typeof a.equipment === "string") {
    return { type: "action", action: { type: "dispense", equipment: a.equipment } };
  }
  if (a.type === "consume" && typeof a.item === "string") return { type: "action", action: { type: "consume", item: a.item } };
  if ((a.type === "bond" || a.type === "dtt" || a.type === "stt") && typeof a.target === "string") {
    return { type: "action", action: { type: a.type, target: a.target } };
  }
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
