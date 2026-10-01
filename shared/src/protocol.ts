// Wire messages between clients and the server. Everything arriving from a
// client is untrusted: always go through the parse* functions.

import type { Action, PlayerView } from "./types.ts";

export const MAX_NAME_LENGTH = 24;

// Matchmaker ("matchmaker" party, room "global")
export type MatchmakerClientMessage = { type: "queue"; name: string };
export type MatchmakerServerMessage =
  | { type: "queued"; waiting: number; seats: number }
  | { type: "matched"; roomId: string; token: string }
  | { type: "error"; message: string };

// Game room ("game-room" party). The seat token goes in the connection URL (?token=).
export type GameClientMessage = { type: "action"; action: Action };
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
  if (msg?.type !== "action" || !isRecord(msg.action)) return null;
  const a = msg.action;
  if (a.type === "ready") return { type: "action", action: { type: "ready" } };
  if (a.type === "move" && typeof a.to === "string") return { type: "action", action: { type: "move", to: a.to } };
  return null;
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
