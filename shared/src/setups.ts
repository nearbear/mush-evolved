// ---- Setups ------------------------------------------------------------------
// Decided 2026-10-24/25 (docs/rules/rules-design.md, "Setups and ship voting"; #226, #227). A setup is a few coarse knobs
// that players post and vote on for their language's next ship. Everything in a setup is public by design. This
// module is the schema: strict validation, the `ConfigOverrides` a setup gives a game, the moderation of a setup's
// text, and the shapes of the setup routes. Storage and posting live in the server (`server/src/setupStore.ts` and
// `setupRoutes.ts`, #233); voting is #236.
//
// A setup made for an older rules version drops off the ballot when it no longer validates; `rulesVersion` is stored
// for display only (`RULES_VERSION` is "dev" for now).
//
// Every knob reaches the game through `setupOverrides`: seats, pre-selection length, Mush count (#229), cycle length
// (#230) and shared positions (#231).

import { MAX_THREAD_NAME_LENGTH } from "./chat.ts";
import { PRESELECTION } from "./config.ts";
import { isRecord } from "./helpers.ts";
import { BLOCKED_WORDS, moderateChat } from "./moderation.ts";
import { LOBBY_LANGUAGES, type LobbyLanguage, MAX_NAME_LENGTH } from "./protocol.ts";
import type { ConfigOverrides } from "./types.ts";

export const MIN_SEATS = 4;
export const MAX_SEATS = 16;
export const MIN_PRESELECTION_DAYS = 1;
export const MAX_PRESELECTION_DAYS = 5;
export const MUSH_COUNTS = ["auto", 1, 2, 3] as const;
/** Each divides 24, so cycles change on the UTC clock and a day is always 24 hours from 00:00 GMT (#230). */
export const CYCLE_HOURS = [1, 2, 3, 4, 6] as const;
/** A fixed Mush count is at most the seats minus this (owner, 2026-10-24: 3 Mush of 4 is a deathmatch). */
export const MUSH_SEAT_MARGIN = 2;

// Lengths for the free-text fields; their content goes through moderation when posted (#48, #233).
export const MAX_SETUP_NAME_LENGTH = MAX_THREAD_NAME_LENGTH;
export const MAX_SETUP_DESCRIPTION_LENGTH = 500;
export const MAX_SETUP_ID_LENGTH = 64;
export const MAX_RULES_VERSION_LENGTH = 32;

export type SetupMushCount = (typeof MUSH_COUNTS)[number];
export type CycleHours = (typeof CYCLE_HOURS)[number];

export interface SetupKnobs {
  seats: number; // MIN_SEATS..MAX_SEATS.
  preselectionDays: number; // Pre-selection ends at the last cycle of this day, or earlier if the ship fills.
  mushCount: SetupMushCount; // "auto": the player-count rule (`PreselectionRules.twoMushAbove`).
  cycleHours: CycleHours;
  sharedSpots: boolean; // Off: where you stand or sit is only on your own screen.
}

/** A setup's name and description in one language. The description may be empty. */
export interface SetupText {
  name: string;
  description: string;
}

/** A name and description per language, at least one (owner, 2026-10-29). Adding one later is a new version. */
export type SetupTexts = Partial<Record<LobbyLanguage, SetupText>>;

export interface Setup {
  id: string;
  text: SetupTexts;
  ownerName: string; // The owner's current display name, joined in when read (#233). Never the account ID.
  version: number; // 1 for a new setup; each new version follows the newest by the same owner (#233).
  previousId?: string; // The version this one follows. Present exactly when `version` > 1.
  rulesVersion: string; // `RULES_VERSION` when posted. Display only.
  createdAt: number; // Epoch milliseconds.
  knobs: SetupKnobs;
}

export const STANDARD_KNOBS: Readonly<SetupKnobs> = Object.freeze({
  seats: 16,
  preselectionDays: 3,
  mushCount: "auto",
  cycleHours: 3,
  sharedSpots: true,
});

export const STANDARD_SETUP_ID = "standard";

/** Always on the ballot, and what a ship gets when nobody voted. It has no text or owner: the client names it (#237). */
export const STANDARD_SETUP: Readonly<Setup> = Object.freeze({
  id: STANDARD_SETUP_ID,
  text: {},
  ownerName: "",
  version: 1,
  rulesVersion: "",
  createdAt: 0,
  knobs: STANDARD_KNOBS,
});

const KNOB_KEYS = ["seats", "preselectionDays", "mushCount", "cycleHours", "sharedSpots"] as const;
const SETUP_KEYS = ["id", "text", "ownerName", "version", "previousId", "rulesVersion", "createdAt", "knobs"];

const hasOnly = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const oneOf = <T>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

/** The knobs, copied, if every one is present and in range and there are no others; otherwise null. */
export function parseSetupKnobs(value: unknown): SetupKnobs | null {
  if (!isRecord(value) || !hasOnly(value, KNOB_KEYS)) return null;
  const { seats, preselectionDays, mushCount, cycleHours, sharedSpots } = value;
  if (!intIn(seats, MIN_SEATS, MAX_SEATS)) return null;
  if (!intIn(preselectionDays, MIN_PRESELECTION_DAYS, MAX_PRESELECTION_DAYS)) return null;
  if (!oneOf(MUSH_COUNTS, mushCount)) return null;
  if (mushCount !== "auto" && mushCount > seats - MUSH_SEAT_MARGIN) return null;
  if (!oneOf(CYCLE_HOURS, cycleHours)) return null;
  if (typeof sharedSpots !== "boolean") return null;
  return { seats, preselectionDays, mushCount, cycleHours, sharedSpots };
}

/** The texts, copied, if every present language has a non-blank name and both fit their caps; otherwise null. */
export function parseSetupTexts(value: unknown): SetupTexts | null {
  if (!isRecord(value) || !hasOnly(value, LOBBY_LANGUAGES)) return null;
  const texts: SetupTexts = {};
  for (const lang of LOBBY_LANGUAGES) {
    const entry = value[lang];
    if (entry === undefined) continue;
    if (!isRecord(entry) || !hasOnly(entry, ["name", "description"])) return null;
    const { name, description } = entry;
    if (!text(name, MAX_SETUP_NAME_LENGTH) || name.trim() === "") return null;
    if (!text(description, MAX_SETUP_DESCRIPTION_LENGTH)) return null;
    texts[lang] = { name, description };
  }
  return texts;
}

/** The setup, copied, if it is well formed; otherwise null. A stored setup that fails this drops off the ballot. */
export function validateSetup(value: unknown): Setup | null {
  if (!isRecord(value) || !hasOnly(value, SETUP_KEYS)) return null;
  const { id, ownerName, version, previousId, rulesVersion, createdAt } = value;
  if (!text(id, MAX_SETUP_ID_LENGTH) || id === "") return null;
  const texts = parseSetupTexts(value.text);
  // Only the standard setup has no text: the client names it.
  if (!texts || (id !== STANDARD_SETUP_ID && Object.keys(texts).length === 0)) return null;
  if (!text(ownerName, MAX_NAME_LENGTH)) return null;
  if (!intIn(version, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (version === 1 ? previousId !== undefined : !text(previousId, MAX_SETUP_ID_LENGTH) || previousId === "") return null;
  if (previousId !== undefined && typeof previousId !== "string") return null; // Narrows the type; the line above checked it.
  if (!text(rulesVersion, MAX_RULES_VERSION_LENGTH)) return null;
  if (!intIn(createdAt, 0, Number.MAX_SAFE_INTEGER)) return null;
  const knobs = parseSetupKnobs(value.knobs);
  if (!knobs) return null;
  // The client shows the id "standard" as the standard ruleset (#237), so a setup claiming it must have its knobs.
  if (id === STANDARD_SETUP_ID && knobsDiff(knobs).length > 0) return null;
  return { id, text: texts, ownerName, version, ...(previousId !== undefined && { previousId }), rulesVersion, createdAt, knobs };
}

/** Cycles in a day of this cycle length: a day is always 24 hours (owner, 2026-10-25). */
export const cyclesPerDayFor = (cycleHours: CycleHours): number => 24 / cycleHours;

/** How a game with this setup differs from `DEFAULT_CONFIG`, for `resolveConfig`. */
export function setupOverrides(knobs: Readonly<SetupKnobs>): ConfigOverrides {
  return {
    cycleHours: knobs.cycleHours,
    sharedSpots: knobs.sharedSpots,
    preselection: {
      ...PRESELECTION,
      seats: knobs.seats,
      mushCount: knobs.mushCount,
      endsOn: { day: knobs.preselectionDays, cycle: cyclesPerDayFor(knobs.cycleHours) },
    },
  };
}

/** The knobs that differ from the standard, in display order, for the editor, ballot and in-game panel. */
export function knobsDiff(knobs: Readonly<SetupKnobs>): (keyof SetupKnobs)[] {
  return KNOB_KEYS.filter((k) => knobs[k] !== STANDARD_KNOBS[k]);
}

// ---- Posting (#233)
//
// Each piece of text is moderated as chat is: invisible characters stripped, links removed, and the word list
// (`BLOCKED_WORDS`, one list for every language) masked in every field whatever its language. A name is folded onto one
// line. Masking or link removal can lengthen text, so the caps are checked again on the result.

/** Why a setup's text was refused. Error codes, translated by the client. */
export type SetupTextError = "no_text" | "name_empty" | "name_too_long" | "description_too_long";

export type SetupTextsResult = { ok: true; text: SetupTexts } | { ok: false; reason: SetupTextError; lang?: LobbyLanguage };

/**
 * The texts as they would be stored, moderated, or why they are refused. The server checks every post with this; the
 * client may call it too, for feedback before sending. The input must already be shaped like `SetupTexts`.
 */
export function moderateSetupTexts(raw: SetupTexts): SetupTextsResult {
  const texts: SetupTexts = {};
  for (const lang of LOBBY_LANGUAGES) {
    const entry = raw[lang];
    if (!entry) continue;
    const name = moderateChat(entry.name.replace(/\s+/g, " "), BLOCKED_WORDS, { length: MAX_SETUP_NAME_LENGTH, lines: 1 });
    if (!name.ok) return { ok: false, reason: name.reason === "empty_message" ? "name_empty" : "name_too_long", lang };
    if (name.text.length > MAX_SETUP_NAME_LENGTH) return { ok: false, reason: "name_too_long", lang };
    // No line cap of its own beyond the length: blank lines are already folded to one.
    const description = moderateChat(entry.description, BLOCKED_WORDS, {
      length: MAX_SETUP_DESCRIPTION_LENGTH,
      lines: MAX_SETUP_DESCRIPTION_LENGTH,
    });
    let descriptionText = "";
    if (description.ok) descriptionText = description.text;
    else if (description.reason !== "empty_message") return { ok: false, reason: "description_too_long", lang };
    if (descriptionText.length > MAX_SETUP_DESCRIPTION_LENGTH) return { ok: false, reason: "description_too_long", lang };
    texts[lang] = { name: name.text, description: descriptionText };
  }
  if (Object.keys(texts).length === 0) return { ok: false, reason: "no_text" };
  return { ok: true, text: texts };
}

/** `POST /api/setups`. `previousId` posts a new version of that setup; without it, a new setup. */
export interface PostSetupRequest {
  text: SetupTexts;
  knobs: SetupKnobs;
  previousId?: string;
}

/** The request, copied, if it is shaped right and has no other fields; otherwise null. The text is not moderated yet. */
export function parsePostSetup(value: unknown): PostSetupRequest | null {
  if (!isRecord(value) || !hasOnly(value, ["text", "knobs", "previousId"])) return null;
  const knobs = parseSetupKnobs(value.knobs);
  if (!knobs) return null;
  // Shape only here: the caps and moderation are moderateSetupTexts's, so they come back as their own reasons.
  if (!isRecord(value.text) || !hasOnly(value.text, LOBBY_LANGUAGES)) return null;
  const texts: SetupTexts = {};
  for (const lang of LOBBY_LANGUAGES) {
    const entry = value.text[lang];
    if (entry === undefined) continue;
    if (!isRecord(entry) || !hasOnly(entry, ["name", "description"])) return null;
    const { name, description } = entry;
    if (typeof name !== "string" || typeof description !== "string") return null;
    texts[lang] = { name, description };
  }
  const { previousId } = value;
  if (previousId !== undefined && (!text(previousId, MAX_SETUP_ID_LENGTH) || previousId === "")) return null;
  return { text: texts, knobs, ...(typeof previousId === "string" && { previousId }) };
}

/** At most this many setups per account; new versions don't count (owner, 2026-10-31). */
export const MAX_SETUPS_PER_ACCOUNT = 50;
/** At most this many posts per account in all, new setups and new versions alike (owner, 2026-10-31). */
export const MAX_SETUP_POSTS_PER_ACCOUNT = 500;

/**
 * Why a post was refused. `invalid`: a malformed body or knobs. `setup_cap` and `post_cap`: the two caps above.
 * `not_found`: no setup `previousId`. `not_owner`: it belongs to another account. `not_latest`: it already has a newer
 * version (only the newest gets one).
 */
export type PostSetupError =
  | SetupTextError
  | "invalid"
  | "signed_out"
  | "rate_limited"
  | "setup_cap"
  | "post_cap"
  | "not_found"
  | "not_owner"
  | "not_latest";

export type PostSetupResponse = { ok: true; setup: Setup } | { ok: false; reason: PostSetupError; lang?: LobbyLanguage };

/** The signed-in account's own setups and how much of each cap is used. */
export interface MySetups {
  /** Its setups in the list (each one's newest version). */
  ids: string[];
  /** New setups posted, toward MAX_SETUPS_PER_ACCOUNT. */
  setups: number;
  /** Posts in all, toward MAX_SETUP_POSTS_PER_ACCOUNT. */
  posts: number;
}

/**
 * `GET /api/setups`: the newest version of every setup that validates, newest first, in every language (the client
 * filters by language). `mine` is null when signed out.
 */
export interface SetupListResponse {
  setups: Setup[];
  mine: MySetups | null;
}

/**
 * A setup found by ID (`GET /api/setups/<id>`), any version, even one that no longer validates: `knobs` is null then.
 * Only the display fields are read leniently; `latest` is whether it is its setup's newest version.
 */
export interface SetupRecord extends Omit<Setup, "knobs"> {
  knobs: SetupKnobs | null;
  latest: boolean;
}

/** `GET /api/setups/<id>`; 404 with `{ error: "not_found" }` for an unknown ID. */
export interface SetupLookupResponse {
  setup: SetupRecord;
}
