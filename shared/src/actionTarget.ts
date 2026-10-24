// What an action is done to. The client walks you up to it in the room view (useActingOn), and acting in public on
// equipment or another person ends a wheelchair push you're part of (accommodate.ts), since that walk takes you away.

import type { ActionVisibility } from "./actions/action.ts";
import type { Action, PlayerId, Target } from "./types.ts";

/** What an action is done to, for walking up to it in the room view; null for actions on nothing in particular. */
export function actionTarget(a: Action): Target | null {
  if (a.type === "examine") return a.target;
  if ("equipment" in a) return { kind: "equipment", id: a.equipment };
  if ("item" in a) return { kind: "item", id: a.item };
  if (a.type === "bond" || a.type === "dtt" || a.type === "stt" || a.type === "heal" || a.type === "punch" || a.type === "anathema" || a.type === "spike" || a.type === "body_transfer" || a.type === "accommodate" || a.type === "accept_accommodation") {
    return { kind: "player", id: a.target };
  }
  if (a.type === "attack") return "target" in a ? { kind: "player", id: a.target } : { kind: "item", id: a.weapon };
  return null;
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
  return target?.kind === "equipment" || (target?.kind === "player" && target.id !== by);
}
