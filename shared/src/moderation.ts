// Basic chat moderation, run by the server before a message reaches the rules.
// Deliberately simple for the slice: normalize, cap length, remove links, and
// mask a word list. Not a substitute for real moderation tooling.

import { MAX_CHAT_LENGTH, MAX_CHAT_LINES } from "./chat.ts";

/**
 * Masked case-insensitively as whole words. A starter list only; replace with
 * a maintained list (or a moderation service) before a public launch.
 */
export const BLOCKED_WORDS: readonly string[] = ["fuck", "shit", "cunt", "bitch", "asshole"];

/** Error code (not a sentence) for a message with too many lines. */
export const TOO_MANY_LINES = "too_many_lines";

export type ModerationResult = { ok: true; text: string } | { ok: false; reason: string };

// Control and format characters (including zero-width and bidi overrides) are
// stripped so text can't be visually spoofed. Newlines are kept: messages are markdown.
const INVISIBLE = /[^\P{Cc}\n]|\p{Cf}/gu;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function moderateChat(raw: string, blocked: readonly string[] = BLOCKED_WORDS): ModerationResult {
  // Line breaks survive (CRLF folded to LF); runs of other whitespace collapse, trailing spaces go, and
  // blank lines are capped at one so a message can't be mostly empty space.
  let text = raw
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return { ok: false, reason: "empty_message" };
  if (text.length > MAX_CHAT_LENGTH) return { ok: false, reason: "message_too_long" };
  if (text.split("\n").length > MAX_CHAT_LINES) return { ok: false, reason: TOO_MANY_LINES };
  text = text.replace(LINK, "[link removed]");
  for (const word of blocked) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"), (m) => "*".repeat(m.length));
  }
  return { ok: true, text };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
