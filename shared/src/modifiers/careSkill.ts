import type { GameState } from "../types.ts";
import type { Modifier } from "../modifiers.ts";

/**
 * A skill that grants care points: `config.heal.effect[key]` at the start of every day (the `carePointsPerDay` fold) and the
 * same amount once when it is picked. Skills that work like this are built from a factory, not a base class, so
 * a skill can combine several (hooks fold over the modifier registry).
 */
export function careSkill(key: "nursePointsPerDay"): Modifier {
  const gain = (state: Readonly<GameState>) => state.config.heal.effect[key];
  return {
    carePointsPerDay: (sum, _player, state) => sum + gain(state),
    onPick: (next, player) => {
      player.resources.heal += gain(next);
    },
  };
}
