// Development cheats (issue #148). Per-player toggles that hold a stat at its
// maximum. Test tooling, not a game rule: the server refuses the `cheat` input
// unless ALLOW_CHEATS is set, and the flags only ever appear in your own view.

import type { GameConfig, PlayerState } from "./types.ts";

export const CHEATS = ["infiniteAp", "infiniteMp", "infiniteMorale", "infiniteHp"] as const;
export type Cheat = (typeof CHEATS)[number];

/** Whether a player sees through ACTOPI as the ship has it ("default"), or always ("on") or never ("off"). */
export const ACTOPI_CHEATS = ["default", "on", "off"] as const;
export type ActopiCheat = (typeof ACTOPI_CHEATS)[number];

export const isActopiCheat = (value: unknown): value is ActopiCheat => ACTOPI_CHEATS.some((c) => c === value);

export const isCheat = (value: unknown): value is Cheat => CHEATS.some((c) => c === value);

/**
 * Where each cheat refills its stat to. Adding a cheat means adding it to
 * CHEATS and one line here (the UI lists CHEATS).
 */
const REFILL: Record<Cheat, (p: PlayerState, config: GameConfig) => void> = {
  infiniteAp: (p, c) => void (p.ap = c.maxAp),
  infiniteMp: (p, c) => void (p.mp = c.movement.mpCap),
  infiniteMorale: (p, c) => void (p.morale = c.maxMorale),
  infiniteHp: (p, c) => void (p.hp = c.maxHp),
};

/**
 * Tops up every stat the player has a cheat for. Mutates a player the caller
 * already cloned. Called after anything that could spend or lose a stat.
 */
export function applyCheats(p: PlayerState, config: GameConfig): void {
  if (!p.alive) return; // nothing brings the dead back
  for (const cheat of p.cheats) REFILL[cheat](p, config);
}
