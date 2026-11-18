import type { Modifier } from "../modifiers.ts";
import { isShot } from "./shots.ts";

/** Success chance kept on a shot: a quarter off, relative. */
const SHOT_SUCCESS_FACTOR = 0.75;

// Pink Eye (owner, 2026-11-15): lasts 8-12 cycles (config.ts). Every shot's success chance (`isShot`, shots.ts) is
// multiplied by 0.75. The blur on your iTrackie and action buttons is client-side, from your own view (`blurredVision`, diseases.ts). The fold never reaches a Mush's diseases.
export const pink_eye_disease: Modifier = {
  actionSucessRate: (chance, { action, tags }) => (isShot(action, tags) ? chance * SHOT_SUCCESS_FACTOR : chance),
};
