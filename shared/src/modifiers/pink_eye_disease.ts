import type { Modifier } from "../modifiers.ts";

/** Success chance kept on a shot: a quarter off, relative. */
const SHOT_SUCCESS_FACTOR = 0.75;

// Pink Eye (owner, 2026-11-15): lasts 8-12 cycles (config.ts). Every shot's success chance is multiplied by 0.75:
// anything tagged `shoot` (turrets), a patrol ship's shot, and a weapon attack that isn't melee (guns). Not a `shoot`
// tag on those two, since that would hand them Gunner's bonus too. The blur on your iTrackie and action buttons is
// client-side, from your own view (`blurredVision`, diseases.ts). The fold never reaches a Mush's diseases.
export const pink_eye_disease: Modifier = {
  actionSucessRate: (chance, { action, tags }) => {
    const shot = tags.includes("shoot") || action.type === "patrol_attack" || (action.type === "attack" && !tags.includes("melee"));
    return shot ? chance * SHOT_SUCCESS_FACTOR : chance;
  },
};
