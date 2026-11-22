// The Gravity Simulator (owner, 2026-11-08 and 2026-11-22, eMush's `NO_GRAVITY` and `NO_GRAVITY_REPAIRED` statuses).
// While one is broken, everyone gains `config.gravitySimulator.brokenMpPenalty` less MP at each cycle change and from
// each AP-to-MP conversion (modifiers.ts `mpGain`, `movementRules`). Repairing it (by anyone: Repair, a drone) doesn't
// bring gravity back at once: it restarts (`GameState.gravityRestarting`), conversions keep the penalty, and gravity
// returns at the next cycle change, which NERON announces in global chat. While gravity is down (broken or
// restarting), a heavy item costs no extra MP to carry and a tremor sends objects flying instead (`tremorNoGravity`).
// Its state is public: it is never reported, and the alert bar shows it to every living player (reports.ts).

import { pushChat } from "./chat.ts";
import type { Equipment, GameState } from "./types.ts";

export const GRAVITY_SIMULATOR = "GRAVITY_SIMULATOR";

/** Whether any Gravity Simulator is broken. */
export const gravityBroken = (state: Readonly<GameState>): boolean =>
  Object.values(state.equipment).some((list) => list.some((e) => e.type === GRAVITY_SIMULATOR && e.broken));

/** Whether there is no gravity aboard: a Gravity Simulator broken, or restarting after a repair. */
export const noGravity = (state: Readonly<GameState>): boolean => gravityBroken(state) || state.gravityRestarting;

/** The alert bar's gravity row (`Alerts.gravity`). */
export const gravityAlert = (state: Readonly<GameState>): "broken" | "restarting" | null =>
  gravityBroken(state) ? "broken" : state.gravityRestarting ? "restarting" : null;

/**
 * Clears a repaired piece of equipment's `broken` flag; a Gravity Simulator starts restarting. Every repair of
 * equipment goes through here (actions/repair.ts, drones.ts). Mutates a state the caller already cloned.
 */
export function repairEquipment(state: GameState, equipment: Equipment): void {
  delete equipment.broken;
  if (equipment.type === GRAVITY_SIMULATOR) state.gravityRestarting = true;
}

/** Called when a Gravity Simulator breaks: a restart under way is over, and the ordinary broken penalty applies. */
export function gravityLost(state: GameState): void {
  state.gravityRestarting = false;
}

/** At each cycle change: a restarting Gravity Simulator is back, and NERON says so. Mutates a state the caller already cloned. */
export function gravityCycle(state: GameState): void {
  if (!state.gravityRestarting) return;
  state.gravityRestarting = false;
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "gravityRestarted" } });
}
