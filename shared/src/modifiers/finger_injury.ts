import { updateMaxValues } from "../adjustStats.ts";
import { addDisease } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance that a Missing Finger brings a Haemorrhage when it appears. */
const HAEMORRHAGE_CHANCE = 0.2;

/** +1 AP on an action that already costs AP, with Burnt Hand's scope (free actions and moves unaffected). */
const fingerCost: Modifier["actionCost"] = (cost, { action }) =>
  action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + 1 } : cost;

// Broken Finger (owner, 2026-11-22; eMushpedia's "Doigt cassé"): +1 AP on actions. Missing Finger is its upgrade
// (INJURY_UPGRADES, diseases.ts).
export const broken_finger_injury: Modifier = { actionCost: fingerCost };

// Missing Finger (owner, 2026-11-22; eMushpedia's "Doigt manquant"): +1 AP on actions, -1 max health, and a 20% chance
// of a Haemorrhage when it appears.
export const missing_finger_injury: Modifier = {
  actionCost: fingerCost,
  maxHp: (value) => Math.max(1, value - 1),
  onPick(next, player) {
    updateMaxValues(next, player);
    if (rollFloat(next) < HAEMORRHAGE_CHANCE) addDisease(next, player, "haemorrhage_injury");
  },
};
