import type { Modifier } from "../modifiers.ts";

// Terrence's wheelchair (owner, 2026-10-19): others can offer to push him (accommodate.ts), which checks for this
// id. It has no hooks of its own; while pushed he moves with his pusher instead of by MP.
export const wheelchair: Modifier = {};
