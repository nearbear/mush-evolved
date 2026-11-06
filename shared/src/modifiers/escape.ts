import type { Modifier } from "../modifiers.ts";

// Skill "escape" (shown as Elusive/Sneak; owner, 2026-11-06): a punch or a melee-weapon attack aimed at the holder
// has its success chance multiplied by `escape.meleeSuccessFactor` (0.75, a quarter off, relative). Interrogate is
// melee-tagged but not covered. A guardian (actions/guard.ts) never holds the holder back either (`isBlocked`). Skills are public inside a room, so the lower odds shown to the attacker leak nothing.
export const escape: Modifier = {
  targetedSuccessRate: (rate, ctx) =>
    ctx.tags.includes("melee") && (ctx.action.type === "punch" || ctx.action.type === "attack") ? rate * ctx.state.config.escape.meleeSuccessFactor : rate,
};
