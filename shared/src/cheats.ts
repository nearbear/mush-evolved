// Development cheats (issue #148). Per-player toggles that hold a stat at its
// maximum. Test tooling, not a game rule: the server refuses the `cheat` input
// unless ALLOW_CHEATS is set, and the flags only ever appear in your own view.

import { startCharges } from "./charges.ts";
import { removeStatus } from "./statuses.ts";
import type { GameState, PlayerState } from "./types.ts";

export const CHEATS = ["infiniteAp", "infiniteMp", "infiniteMorale", "infiniteHp", "infiniteSpores", "infiniteCharges", "instantActions", "noRelayPenalty", "freeHacking", "anySkill", "alwaysClean", "easyTravel", "invincible", "fastExpeditions", "swapCharacter"] as const;
export type Cheat = (typeof CHEATS)[number];

/** Instant role switches (one-shot buttons, not toggles). */
export const ROLE_CHEATS = ["mush", "human"] as const;
export type RoleCheat = (typeof ROLE_CHEATS)[number];

export const isRoleCheat = (value: unknown): value is RoleCheat => ROLE_CHEATS.some((r) => r === value);

/** What infiniteSpores holds a Mush's spore count at: more than anyone can spend. */
export const CHEAT_SPORES = 99;

export const isCheat = (value: unknown): value is Cheat => CHEATS.some((c) => c === value);

/**
 * Where each cheat refills its stat to. Adding a cheat means adding it to
 * CHEATS and one line here (the UI lists CHEATS).
 */
const REFILL: Record<Cheat, (p: PlayerState, state: GameState) => void> = {
  infiniteAp: (p, { config }) => void (p.ap = p.maxAp),
  infiniteMp: (p, { config }) => void (p.mp = p.maxMp),
  infiniteMorale: (p, { config }) => void (p.morale = p.maxMorale),
  infiniteHp: (p, { config }) => void (p.hp = p.maxHp),
  infiniteSpores: (p) => void (p.role === "mush" && (p.spores = CHEAT_SPORES)),
  infiniteCharges: (p, state) => {
    for (const item of state.items) {
      if (item.at.kind !== "player" || item.at.id !== p.id) continue;
      const full = startCharges(state.config, item.type);
      if (full !== undefined) item.charges = full;
    }
  },
  instantActions: () => {}, // no stat to refill; queue.ts reads the flag
  noRelayPenalty: () => {}, // relay.ts reads the flag
  freeHacking: () => {}, // titles.ts, actions/research.ts and projectEffects.ts read the flag
  anySkill: () => {}, // actions/pick_skill.ts reads the flag
  alwaysClean: (p) => removeStatus(p, "dirty"), // dirt is added mid-action; this runs after it
  easyTravel: () => {}, // actions/warp_to_planet.ts and leave_orbit.ts read the flag
  invincible: () => {}, // see shipInvincible: death.ts, adjustStats.ts, ship.ts and rules.ts read the flag
  // Switched on mid-expedition: the next step comes FAST_EXPEDITION_STEP_MS from now, not up to 10 minutes later.
  fastExpeditions: (_p, state) => {
    if (state.expedition) state.expedition.nextAt = Math.min(state.expedition.nextAt, state.now + FAST_EXPEDITION_STEP_MS);
  },
  swapCharacter: () => {}, // actions/swap_character.ts reads the flag
};

/** The time between expedition steps while anyone has fastExpeditions on. */
export const FAST_EXPEDITION_STEP_MS = 2000;

/** True while anyone has the fastExpeditions cheat on. Ship-wide, like invincible: expeditions.ts reads it. */
export const fastExpeditions = (state: Readonly<GameState>): boolean => state.players.some((p) => p.cheats.includes("fastExpeditions"));

/**
 * True while anyone has the invincible cheat on. It is ship-wide: the hull, plasma shield and oxygen never drop, and
 * no one's HP or morale ever goes down (the guards are in damage, gainMorale, damageShip, burnOxygen and the daily morale loss).
 */
export const shipInvincible = (state: Readonly<GameState>): boolean => state.players.some((p) => p.cheats.includes("invincible"));

/**
 * Tops up every stat the player has a cheat for. Mutates a state (and its player) the
 * caller already cloned. Called after anything that could spend or lose a stat.
 */
export function applyCheats(state: GameState, p: PlayerState): void {
  if (!p.alive) return; // nothing brings the dead back
  for (const cheat of p.cheats) REFILL[cheat](p, state);
}

/** Turns a player human at once (the reverse of infection). Mutates a player the caller already cloned. */
export function makeHuman(p: PlayerState, cycle: number): void {
  if (p.role === "human") return;
  p.role = "human";
  p.alpha = false;
  p.spores = 0;
  p.satiety = 0;
  p.satietyZeroSince = cycle; // humans start hungry-counting from now
  p.mushSkills = []; // Mush skills belong to the Mush (rules-design.md, Transfer)
  removeStatus(p, "nimble");
  removeStatus(p, "ninja");
}
