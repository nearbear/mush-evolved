import type { Action } from "../types.ts";
import type { ActionTag } from "../actions/action.ts";

/**
 * Whether an action is a shot, for effects on every shot's success chance (Pink Eye, Busted Arm Joint): anything tagged
 * `shoot` (turrets), a patrol ship's shot, and a weapon attack that isn't melee (guns). Not a `shoot` tag on those two,
 * since that would hand them Gunner's bonus too.
 */
export function isShot(action: Readonly<Action>, tags: readonly ActionTag[]): boolean {
  return tags.includes("shoot") || action.type === "patrol_attack" || (action.type === "attack" && !tags.includes("melee"));
}
