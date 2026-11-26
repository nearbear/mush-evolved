// Combat damage reduction: Plastenite Armor and the Hard-boiled Mush skill.

import { isWorking, itemsIn } from "./items.ts";
import { hasSkill } from "./skills.ts";
import type { GameState, PlayerState } from "./types.ts";

/** `amount` less `reduction`, never below `combatDamageFloor` (owner, 2026-11-22), and never raised by it. */
function reduced(state: Readonly<GameState>, amount: number, reduction: number): number {
  if (amount <= 0 || reduction <= 0) return amount;
  return Math.max(Math.min(amount, state.config.combatDamageFloor), amount - reduction);
}

const armored = (state: Readonly<GameState>, target: Readonly<PlayerState>): boolean =>
  itemsIn(state, { kind: "player", id: target.id }).some((i) => i.type === "plastenite_armor" && isWorking(i));

/**
 * Combat damage after Plastenite Armor (owner, 2026-11-17): a working armor in the target's inventory takes
 * `plasteniteArmor.absorb` off a non-critical punch or weapon hit, or an expedition fight, never below
 * `combatDamageFloor` (1; owner, 2026-11-22). Several armors absorb no more than one; a broken one does nothing. The
 * callers leave out crits, instant kills, self-damage and every non-combat damage.
 */
export function afterArmor(state: Readonly<GameState>, target: Readonly<PlayerState>, amount: number): number {
  return reduced(state, amount, armored(state, target) ? state.config.plasteniteArmor.absorb : 0);
}

/**
 * A non-critical punch or weapon hit after Plastenite Armor and the Hard-boiled Mush skill (`tough`), which stack
 * (owner, 2026-11-22, eMushpedia), together never below `combatDamageFloor`. Expedition fights use `afterArmor`:
 * Hard-boiled doesn't apply there.
 */
export function afterProtection(state: Readonly<GameState>, target: Readonly<PlayerState>, amount: number): number {
  const armor = armored(state, target) ? state.config.plasteniteArmor.absorb : 0;
  return reduced(state, amount, armor + (hasSkill(target, "tough") ? state.config.tough.absorb : 0));
}
