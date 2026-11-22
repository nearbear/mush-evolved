import { updateMaxValues } from "../adjustStats.ts";
import { killPlayer } from "../death.ts";
import { catchIncidentDisease } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to catch one of `config.diseases.incidentDiseases` at each cycle change. */
const CYCLE_DISEASE_CHANCE = 0.03;
/** Max health lost to the 90% burn. */
const MAX_HP_LOSS_90 = 4;

// Third-degree burn covering 50% of the body (owner, 2026-11-21; eMushpedia's "Brûlure au 3e degré sur 50 %"):
// an injury, so it lasts until surgery and affects a Mush too. An action that already costs AP costs 1 more, with
// Burnt Hand's scope (free actions and moves unaffected); at each cycle change a 3% chance to catch a disease from
// `config.diseases.incidentDiseases` the player doesn't have yet, as with Rejuvenation.
export const third_degree_50_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + 1 } : cost),
  onCycle(next, player) {
    if (rollFloat(next) < CYCLE_DISEASE_CHANCE) catchIncidentDisease(next, player);
  },
};

// Third-degree burn covering 90% of the body (owner, 2026-11-21; eMushpedia's "Brûlure au 3e degré sur 90 %"): the 50%
// burn's upgrade (INJURY_UPGRADES, diseases.ts). The 50% burn's +1 AP and 3% disease roll, -4 max health, and becoming
// dirty (`onDirty`) kills by sepsis, as Open Air Brain does. Being dirty already when it is caught doesn't kill.
export const third_degree_90_injury: Modifier = {
  ...third_degree_50_injury,
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS_90),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onDirty: (next, player) => killPlayer(next, player, "sepsis"),
};
