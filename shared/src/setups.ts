// ---- Setups ------------------------------------------------------------------
// Decided 2026-10-24/25 (docs/rules-design.md, "Setups and ship voting"; #226, #227). A setup is a few coarse knobs
// that players post and vote on for their language's next ship. Everything in a setup is public by design. This
// module is the schema: strict validation, and the `ConfigOverrides` a setup gives a game. Storage, posting and
// voting live in the server (#233, #236).
//
// A setup made for an older rules version drops off the ballot when it no longer validates; `rulesVersion` is stored
// for display only (`RULES_VERSION` is "dev" for now).
//
// Every knob reaches the game through `setupOverrides`: seats, pre-selection length, Mush count (#229), cycle length
// (#230) and shared positions (#231).

import { MAX_THREAD_NAME_LENGTH } from "./chat.ts";
import { PRESELECTION } from "./config.ts";
import { MAX_NAME_LENGTH } from "./protocol.ts";
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

export interface Setup {
  id: string;
  name: string;
  description: string;
  author: string; // The display name the poster chose; never their browser token or its hash.
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

/** Always on the ballot, and what a ship gets when nobody voted. Its name is its id: the client translates it. */
export const STANDARD_SETUP: Readonly<Setup> = Object.freeze({
  id: STANDARD_SETUP_ID,
  name: STANDARD_SETUP_ID,
  description: "",
  author: "",
  version: 1,
  rulesVersion: "",
  createdAt: 0,
  knobs: STANDARD_KNOBS,
});

const KNOB_KEYS = ["seats", "preselectionDays", "mushCount", "cycleHours", "sharedSpots"] as const;
const SETUP_KEYS = ["id", "name", "description", "author", "version", "previousId", "rulesVersion", "createdAt", "knobs"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
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

/** The setup, copied, if it is well formed; otherwise null. A stored setup that fails this drops off the ballot. */
export function validateSetup(value: unknown): Setup | null {
  if (!isRecord(value) || !hasOnly(value, SETUP_KEYS)) return null;
  const { id, name, description, author, version, previousId, rulesVersion, createdAt } = value;
  if (!text(id, MAX_SETUP_ID_LENGTH) || id === "") return null;
  if (!text(name, MAX_SETUP_NAME_LENGTH) || name.trim() === "") return null;
  if (!text(description, MAX_SETUP_DESCRIPTION_LENGTH)) return null;
  if (!text(author, MAX_NAME_LENGTH)) return null;
  if (!intIn(version, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (version === 1 ? previousId !== undefined : !text(previousId, MAX_SETUP_ID_LENGTH) || previousId === "") return null;
  if (previousId !== undefined && typeof previousId !== "string") return null; // Narrows the type; the line above checked it.
  if (!text(rulesVersion, MAX_RULES_VERSION_LENGTH)) return null;
  if (!intIn(createdAt, 0, Number.MAX_SAFE_INTEGER)) return null;
  const knobs = parseSetupKnobs(value.knobs);
  if (!knobs) return null;
  // The client shows the id "standard" as the standard ruleset (#237), so a setup claiming it must have its knobs.
  if (id === STANDARD_SETUP_ID && knobsDiff(knobs).length > 0) return null;
  return { id, name, description, author, version, ...(previousId !== undefined && { previousId }), rulesVersion, createdAt, knobs };
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
