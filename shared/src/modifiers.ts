// Rule modifiers: the extension point for items, skills, and statuses that
// change how the rules work. A player's state lists modifier ids; the code for
// each id lives in this registry, so state stays plain JSON and rules stay pure.
//
// To add one (e.g. a skill that makes conversions yield 4 MP), register it:
//   MODIFIERS["sprinter"] = { movement: (r) => ({ ...r, mpPerConversion: 4 }) };
// and put "sprinter" in the player's `modifiers`.

import type { GameState, MovementRules, PlayerState } from "./types.ts";

export interface Modifier {
  /** Adjusts how a player's moves are paid for. Must be pure. */
  movement?: (rules: MovementRules, player: Readonly<PlayerState>) => MovementRules;
}

export type ModifierRegistry = Readonly<Record<string, Modifier>>;

/** No real items or skills exist yet; they will register here. */
export const MODIFIERS: Record<string, Modifier> = {};

/** Base movement rules folded through the player's modifiers, in list order. */
export function movementRules(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  registry: ModifierRegistry = MODIFIERS,
): MovementRules {
  let rules = { ...state.config.movement };
  for (const id of player.modifiers) {
    const hook = registry[id]?.movement;
    if (hook) rules = hook(rules, player);
  }
  return rules;
}

/**
 * What a move would cost: AP spent and MP afterwards, or null if the player
 * can't afford it. If MP is short, converts AP once (1 AP -> 3 MP by default),
 * then spends MP. Conversion never pushes MP past the cap.
 */
export function moveCost(
  rules: MovementRules,
  player: Readonly<Pick<PlayerState, "ap" | "mp">>,
): { ap: number; mpAfter: number } | null {
  if (player.mp >= rules.mpPerMove) return { ap: 0, mpAfter: player.mp - rules.mpPerMove };
  if (player.ap < rules.apPerConversion) return null;
  const converted = Math.min(rules.mpCap, player.mp + rules.mpPerConversion);
  if (converted < rules.mpPerMove) return null;
  return { ap: rules.apPerConversion, mpAfter: converted - rules.mpPerMove };
}
