import type { Modifier } from "../modifiers.ts";

// Chun's Mankind's Only Hope trait (owner, 2026-10-18; a skill in the original, a trait here): while she is
// alive the whole crew loses `mankindOnlyHope.moraleLossCut` less morale each day, so her death (as human or
// Mush) or her absence raises the loss. Shown as the public, permanent `mankind_only_hope` status.
export const mankind_only_hope: Modifier = {
  crewMoraleLoss: (loss, _holder, state) => loss - state.config.mankindOnlyHope.moraleLossCut,
};
