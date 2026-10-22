// NERON's BIOS (owner, 2026-10-21): ship-wide switches at the BIOS terminal in the Nexus. Only the NERON Admin can
// change them (`hasTitleAccess`), for free, and only the actor gets a log line. Anyone alive at the terminal can read
// them. Two options so far, both from the original's `neronAdmin` table: ACTOPI and NERON's death announcements.

import { hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export const BIOS_OPTIONS = ["actopi", "death_announcements"] as const;
export type BiosOption = (typeof BIOS_OPTIONS)[number];
export const isBiosOption = (value: unknown): value is BiosOption => BIOS_OPTIONS.some((o) => o === value);

/**
 * - `actopi`: while on, everyone sees who is in which room; while off, only how many people are in each other room.
 * - `death_announcements`: while on, a death is announced in global chat with the dead player's role. The room's
 *   own log line is written either way (death.ts).
 */
export type BiosState = Record<BiosOption, boolean>;

/** Both start on, as in the original. */
export const newBios = (): BiosState => ({ actopi: true, death_announcements: true });

/** BIOS terminals in the player's room. */
export function biosTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === "NERON_BIOS_TERM");
}

export const canChangeBios = (state: Readonly<GameState>, player: Readonly<PlayerState>) => hasTitleAccess(state, player, "neron_admin");
