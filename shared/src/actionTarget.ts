// What an action is done to. The client walks you up to it in the room view (useActingOn), and acting in public on
// equipment or another person ends a wheelchair push you're part of (accommodate.ts), since that walk takes you away.

import type { ActionVisibility } from "./actions/action.ts";
import { isHostileId } from "./hostiles/hostile.ts";
import type { Action, PlayerId, Target } from "./types.ts";

/**
 * What an action's fields name it as done to, read from its shape: equipment, an item, a person (a `target` id, or
 * examine's whole `Target`), or the weapon of an area attack. Null for actions on nothing in particular.
 */
export function namedTarget(a: Action): Target | null {
  if ("equipment" in a) return { kind: "equipment", id: a.equipment };
  if ("item" in a) return { kind: "item", id: a.item };
  if ("door" in a) return { kind: "door", id: a.door };
  // Before `weapon`: an attack with a target is aimed at the person.
  // A hostile NPC's id starts `hostile:` (hostiles.ts), so it never reads as a person's.
  if ("target" in a) return typeof a.target === "string" ? { kind: isHostileId(a.target) ? "hostile" : "player", id: a.target } : a.target;
  if ("weapon" in a) return { kind: "item", id: a.weapon };
  return null;
}

/** What an action is done to, for walking up to it in the room view; null for actions on nothing in particular. */
export function actionTarget(a: Action): Target | null {
  // Stopping a push walks nobody: the pusher is already beside the person they push.
  return a.type === "stop_accommodation" ? null : namedTarget(a);
}

/**
 * Whether `by` doing `action` ends a push they are part of, pushing or pushed (owner, 2026-10-24): a public action on
 * equipment or on another person, which walks you up to it. Actions on items (taking, dropping, transferring), on
 * yourself, and the accommodation actions themselves don't; nor do private, secret or covert ones, since the push
 * ending is public and would give them away.
 */
export function endsAccommodation(action: Action, by: PlayerId, visibility: ActionVisibility): boolean {
  if (visibility !== "public" || action.type === "accommodate" || action.type === "accept_accommodation" || action.type === "stop_accommodation") return false;
  const target = actionTarget(action);
  // A hostile NPC counts as a person here: acting on it walks you up to it.
  return target?.kind === "equipment" || target?.kind === "door" || target?.kind === "hostile" || (target?.kind === "player" && target.id !== by);
}
