import { gainMorale } from "../adjustStats.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

const EXTINGUISH_ACTIONS: readonly string[] = ["extinguish", "extinguish_manually"];

// Pyromania (owner, 2026-11-27): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`; a calmed compulsion is paused: no countdown, no roll, no Ignite). -`maxMoraleLoss` max morale, and
// extinguishing (extinguisher or by hand) succeeds x`extinguishFactor`. At each cycle change a holder who is neither
// compelled nor in their hidden grace rolls `compelChance` to become compelled (`PlayerState.compelledCycles`, told
// privately): for `compelledCycles` cycle changes Ignite is offered at `igniteAp` AP (actions/ignite.ts). Igniting
// ends it; running out costs `moraleLoss` morale and ends it. Either way `graceCycles` cycle changes pass without a
// roll (`PlayerState.compulsionGrace`, never sent).
export const pyromania_disorder: Modifier = {
  maxMorale: (value, _player, state) => Math.max(1, value - state.config.pyromania.maxMoraleLoss),
  actionSucessRate: (chance, { state, action }) => (EXTINGUISH_ACTIONS.includes(action.type) ? chance * state.config.pyromania.extinguishFactor : chance),
  onCycle(next, player) {
    const rules = next.config.pyromania;
    if (player.compelledCycles !== undefined) {
      player.compelledCycles -= 1;
      if (player.compelledCycles > 0) return;
      delete player.compelledCycles;
      player.compulsionGrace = rules.graceCycles;
      gainMorale(next, player, -rules.moraleLoss, "pyromaniaMoraleLoss");
      return;
    }
    if (player.compulsionGrace !== undefined) {
      player.compulsionGrace -= 1;
      if (player.compulsionGrace <= 0) delete player.compulsionGrace;
      return;
    }
    if (rollFloat(next) < rules.compelChance) {
      player.compelledCycles = rules.compelledCycles;
      logPrivate(next, player.id, "pyromaniaCompelled", { cycles: rules.compelledCycles });
    }
  },
};
