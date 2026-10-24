// NERON's BIOS (owner, 2026-10-21): ship-wide switches at the BIOS terminal in the Nexus. Only the NERON Admin can
// change them (`hasTitleAccess`), for free, and only the actor gets a log line. Anyone alive at the terminal can read
// them. Options from the original's `neronAdmin` table: ACTOPI, NERON's death announcements, and the plasma shield
// (owner, 2026-10-24).

import { hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export const BIOS_OPTIONS = ["actopi", "death_announcements", "plasma_shield"] as const;
export type BiosOption = (typeof BIOS_OPTIONS)[number];
export const isBiosOption = (value: unknown): value is BiosOption => BIOS_OPTIONS.some((o) => o === value);

/**
 * - `actopi`: while on, everyone sees who is in which room; while off, only how many people are in each other room.
 * - `death_announcements`: while on, a death is announced in global chat with the dead player's role. The room's
 *   own log line is written either way (death.ts).
 * - `plasma_shield`: while off, the shield absorbs nothing, doesn't regenerate and shows as 0; switched back on, it has
 *   the points it had (ship.ts, hunters.ts).
 */
export type BiosState = Record<BiosOption, boolean>;

/** All start on, as in the original (the shield: owner, 2026-10-24). */
export const newBios = (): BiosState => ({ actopi: true, death_announcements: true, plasma_shield: true });

/** BIOS terminals in the player's room. */
export function biosTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === "NERON_BIOS_TERM");
}

export const canChangeBios = (state: Readonly<GameState>, player: Readonly<PlayerState>) => hasTitleAccess(state, player, "neron_admin");
