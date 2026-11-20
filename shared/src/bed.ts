import type { PlayerState } from "./types.ts";

/**
 * Gets you out of bed. Any other character action does it (owner, 2026-10-17), from the moment it is queued
 * (owner, 2026-10-18); ending your cycle is not one. So does the bed going away (a dismantled sofa).
 */
export function getUp(actor: PlayerState): void {
  actor.modifiers = actor.modifiers.filter((m) => m !== "lying_down");
  delete actor.lyingIn;
  delete actor.lyingSince;
}
