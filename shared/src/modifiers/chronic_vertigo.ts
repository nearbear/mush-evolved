import type { Modifier } from "../modifiers.ts";

// Eleesha's Chronic Vertigo trait (owner, 2026-11-22): a permanent trait here, not eMush's curable disorder. A pure
// marker with no hooks: `groundedBy` (patrol.ts) checks for it, so she can't take off in a patrol ship or the
// Pasiphae, launch the Icarus, or set a ship down on a planet, Mush or human. She can still ride the Icarus as a
// passenger. Shown as the public, permanent `chronic_vertigo` trait status (statuses.ts).
export const chronic_vertigo: Modifier = {};
