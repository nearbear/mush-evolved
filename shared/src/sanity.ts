// ---- Sanity ----------------------------------------------------------------
// Owner, 2026-11-25. Every player has a private sanity, from `config.sanity.start` (100), floored at 0. When a human
// dies (not traded away, not with the ship), every living player loses `deathLoss`; those in the victim's room also lose
// `witnessLoss` and are marked as witnesses; the one who dealt the fatal blow (a punch, an attack or an interrogation)
// also loses `killLoss` and is marked as the killer, on top of being a witness when in the room.
// At each cycle change a living human rolls, one roll per condition, each giving a random disorder they don't have:
//   witnessed a death since the last cycle change: (100 - sanity)%;
//   killed a human since the last cycle change:    (100 - sanity) × `killChanceFactor`%;
//   morale below `lowMorale`:                      (100 - sanity)%.
// Mush never develop disorders this way (they don't roll), and every mark clears at the cycle change.

import { addDisease } from "./diseases.ts";
import { logPrivate } from "./log.ts";
import { rollFloat, rollInt } from "./rng.ts";
import type { GameState, PlayerState } from "./types.ts";

/** Lowers a player's sanity by `amount`, never below 0. */
function loseSanity(player: PlayerState, amount: number): void {
  player.sanity = Math.max(0, player.sanity - amount);
}

/**
 * A human `victim` has just died (death.ts), by `killer`'s blow if anyone's. Costs the living their sanity and marks the
 * witnesses and the killer. Mutates a state the caller already cloned.
 */
export function humanDied(state: GameState, victim: Readonly<PlayerState>, killer?: Readonly<PlayerState>): void {
  const { deathLoss, witnessLoss, killLoss } = state.config.sanity;
  for (const p of state.players) {
    if (!p.alive || p.id === victim.id) continue;
    loseSanity(p, deathLoss);
    if (p.room === victim.room) {
      loseSanity(p, witnessLoss);
      p.witnessedDeath = true;
    }
    if (killer !== undefined && p.id === killer.id) {
      loseSanity(p, killLoss);
      p.killedHuman = true;
    }
  }
}

/** The chances, 0 to 1 each, of a disorder this cycle change: one entry per condition the player meets. */
export function disorderChances(state: Readonly<GameState>, player: Readonly<PlayerState>): number[] {
  const { killChanceFactor, lowMorale } = state.config.sanity;
  const base = (100 - player.sanity) / 100;
  return [
    ...(player.witnessedDeath ? [base] : []),
    ...(player.killedHuman ? [base * killChanceFactor] : []),
    ...(player.morale < lowMorale ? [base] : []),
  ];
}

/** The cycle change's disorder rolls (see the header), then every mark clears. Mutates a state the caller already cloned. */
export function sanityCycle(state: GameState): void {
  for (const p of state.players) {
    if (p.alive && p.role === "human") {
      for (const chance of disorderChances(state, p)) {
        if (chance <= 0 || rollFloat(state) >= chance) continue;
        const options = state.config.diseases.allDisorders.filter((d) => !p.modifiers.includes(d));
        if (options.length === 0) break;
        const disorder = options[rollInt(state, options.length)]!;
        addDisease(state, p, disorder);
        if (p.modifiers.includes(disorder)) logPrivate(state, p.id, "disorderGained", { status: disorder });
      }
    }
    delete p.witnessedDeath;
    delete p.killedHuman;
  }
}
