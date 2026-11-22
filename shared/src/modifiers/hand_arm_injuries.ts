import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";
import { isShot } from "./shots.ts";

/** Success chance kept on a shot: 40% off, relative, as the shoulder injuries. */
const SHOT_FACTOR = 0.6;

/** `apSurcharge` more AP on an action that already costs AP (Burnt Hand's scope), -`maxHpLoss` max health, shots x0.6. */
function mangledLimb(apSurcharge: number, maxHpLoss: number): Modifier {
  return {
    actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + apSurcharge } : cost),
    actionSucessRate: (chance, { action, tags }) => (isShot(action, tags) ? chance * SHOT_FACTOR : chance),
    maxHp: (value) => Math.max(1, value - maxHpLoss),
    onPick: (next, player) => {
      updateMaxValues(next, player);
    },
  };
}

// Shredded Hand (owner, 2026-11-22; eMushpedia's "Main en charpie"): +2 AP, -2 max health, shots x0.6. Cancels Broken
// Finger, Missing Finger and Burnt Hand (INJURY_CANCELS, diseases.ts).
export const shredded_hand_injury: Modifier = mangledLimb(2, 2);

// Shattered Arm (owner, 2026-11-22; eMushpedia's "Bras en charpie"): +3 AP, -3 max health, shots x0.6. Cancels the
// finger and hand injuries, Shredded Hand and Busted Arm Joint; Shattered Shoulder cancels it (INJURY_CANCELS).
export const shattered_arm_injury: Modifier = mangledLimb(3, 3);
