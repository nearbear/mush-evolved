import type { Modifier } from "../modifiers.ts";

// Skill "antic_perfume", confirmed 2026-10-16: each shower makes you immune to infection for
// `anticPerfume.immuneCycles` cycles. A new shower resets the count; it does not stack.
export const antic_perfume: Modifier = {
  onShower(next, player) {
    player.immuneUntil = next.cycle + next.config.anticPerfume.immuneCycles;
  },
};
