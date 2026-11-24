// NERON's BIOS (owner, 2026-10-21): ship-wide switches at the BIOS terminal in the Nexus. Only the NERON Admin can
// change them (`hasTitleAccess`), for free, and only the actor gets a log line. Anyone alive at the terminal can read
// them. Options from the original's `neronAdmin` table: ACTOPI, NERON's death announcements, and the plasma shield
// (owner, 2026-10-24).

import { hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export const BIOS_OPTIONS = ["actopi", "death_announcements", "plasma_shield"] as const;
export type BiosOption = (typeof BIOS_OPTIONS)[number];
export const isBiosOption = (value: unknown): value is BiosOption => BIOS_OPTIONS.some((o) => o === value);

export const CPU_PRIORITIES = ["none", "astronavigation", "projects", "research"] as const;
export type CpuPriority = (typeof CPU_PRIORITIES)[number];
export const isCpuPriority = (value: unknown): value is CpuPriority => CPU_PRIORITIES.some((p) => p === value);

export const CREW_LOCKS = ["piloting", "projects", "research"] as const;
export type CrewLock = (typeof CREW_LOCKS)[number];
export const isCrewLock = (value: unknown): value is CrewLock => CREW_LOCKS.some((l) => l === value);

/**
 * - `actopi`: while on, everyone sees who is in which room; while off, only how many people are in each other room.
 * - `death_announcements`: while on, a death is announced in global chat with the dead player's role. The room's
 *   own log line is written either way (death.ts).
 * - `plasma_shield`: starts off (owner, 2026-11-23). While off or while the `PLASMA_SHIELD` equipment is broken, the
 *   shield absorbs nothing, doesn't regenerate and shows as 0 (ship.ts, hunters.ts). Toggling it off preserves stored
 *   points; breaking the equipment resets them to 0 (breakage.ts).
 * - `cpu_priority`: boosts astronavigation, NERON projects, or lab research (owner, 2026-11-21). Visible ship-wide to
 *   living players (`PlayerView.cpuPriority`).
 * - `crew_lock`: restricts piloting, NERON projects, or lab research to qualified crew (owner, 2026-11-21).
 */
export type BiosState = Record<BiosOption, boolean> & {
  cpu_priority: CpuPriority;
  crew_lock: CrewLock;
};

/** ACTOPI and death announcements start on, plasma shield starts off (owner, 2026-11-23), CPU priority none, crew lock piloting. */
export const newBios = (): BiosState => ({
  actopi: true,
  death_announcements: true,
  plasma_shield: false,
  cpu_priority: "none",
  crew_lock: "piloting",
});

/** BIOS terminals in the player's room. */
export function biosTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === "NERON_BIOS_TERM");
}

export const canChangeBios = (state: Readonly<GameState>, player: Readonly<PlayerState>) => hasTitleAccess(state, player, "neron_admin");

/** Bonus added to `tokenBase` when BIOS CPU priority matches `"projects"` or `"research"` (owner, 2026-11-21). */
export const cpuPriorityBonus = (state: Readonly<GameState>, target: "projects" | "research"): number =>
  state.bios.cpu_priority === target ? state.config.bios.cpuPriorityBonus : 0;
