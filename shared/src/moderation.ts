// Basic chat moderation, run by the server before a message reaches the rules.
// Deliberately simple for the slice: normalize, cap length, remove links, and
// mask a word list. Not a substitute for real moderation tooling.

import { MAX_CHAT_LENGTH } from "./rules.ts";

/**
 * Masked case-insensitively as whole words. A starter list only; replace with
 * a maintained list (or a moderation service) before a public launch.
 */
export const BLOCKED_WORDS: readonly string[] = ["fuck", "shit", "cunt", "bitch", "asshole"];

export type ModerationResult = { ok: true; text: string } | { ok: false; reason: string };

// Control and format characters (including zero-width and bidi overrides) are
// stripped so text can't be visually spoofed.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function moderateChat(raw: string, blocked: readonly string[] = BLOCKED_WORDS): ModerationResult {
  let text = raw.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "Empty message" };
  if (text.length > MAX_CHAT_LENGTH) return { ok: false, reason: `Messages are limited to ${MAX_CHAT_LENGTH} characters` };
  text = text.replace(LINK, "[link removed]");
  for (const word of blocked) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"), (m) => "*".repeat(m.length));
  }
  return { ok: true, text };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
