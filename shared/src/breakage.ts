// Broken equipment (owner, 2026-10-25, #184): which equipment can break, breaking it, and what broken equipment still
// does. Broken equipment does nothing: `Action.check` refuses every action on it but Repair and Examine, and
// `equipmentHere`, `hasCamera` and the turrets skip it. The exceptions the owner kept from the wiki: a broken oxygen
// tank leaks oxygen each cycle, a broken Com center cuts the link to Sol, and a broken turret shows 0 charges and
// gets its own back when repaired. Repairing is actions/repair.ts.

import { getUp } from "./actions/lie_down.ts";
import { pushChat } from "./chat.ts";
import { loseLink } from "./comms.ts";
import { ITEM_TYPES, removeItem } from "./items.ts";
import type { Equipment, GameState, ItemState, RoomId } from "./types.ts";

/** Whether equipment of this type can break: only types with a repair chance in `config.repair.chance`. */
export const isBreakable = (state: Readonly<GameState>, type: string): boolean => state.config.repair.chance[type] !== undefined;

/** The breakable equipment in a room that still works. */
export const workingBreakable = (state: Readonly<GameState>, room: RoomId): Equipment[] =>
  (state.equipment[room] ?? []).filter((equipment) => !equipment.broken && isBreakable(state, equipment.type));

/**
 * Breaks a piece of equipment, if it can break and isn't broken yet. NERON names the equipment, not the room, in global
 * chat (owner, 2026-10-25) unless `announce` is false (sabotage is silent). Whoever lies on it gets up. Mutates a state the caller already cloned.
 */
export function breakEquipment(state: GameState, equipment: Equipment, announce = true): void {
  if (equipment.broken || !isBreakable(state, equipment.type)) return;
  equipment.broken = true;
  for (const p of state.players) if (p.lyingIn === equipment.id) getUp(p);
  if (equipment.type === "COM_CENTER") loseLink(state);
  if (announce) pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "equipmentBroken", params: { equipment: equipment.type } } });
}

/**
 * Breaks an item, if its type can break and it isn't broken yet: it is destroyed when its type says so
 * (`isDestroyedWhenBroken`), else flagged `broken`. Nothing calls it yet. Mutates a state the caller already cloned.
 */
export function breakItem(state: GameState, item: ItemState): void {
  const type = ITEM_TYPES[item.type];
  if (item.broken || !type?.canBreak) return;
  if (type.isDestroyedWhenBroken) removeItem(state, item.id);
  else item.broken = true;
}

/** At each cycle change: every broken oxygen tank leaks `config.repair.oxygenLeak` oxygen. */
export function leakOxygen(state: GameState): void {
  const leaking = Object.values(state.equipment).flat().filter((e) => e.type === "OXYGEN_TANK" && e.broken).length;
  state.ship.oxygen = Math.max(0, state.ship.oxygen - leaking * state.config.repair.oxygenLeak);
}
