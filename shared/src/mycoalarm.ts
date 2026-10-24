// Myco alarms (issue 159, decided 2026-10-14 and 2026-10-17). An alarm item lying in a room's inventory rings when
// an action tagged `spore` resolves there, success or failure (owner, 2026-10-18; performAction in rules.ts calls
// ringMycoAlarms); carried by a player it does nothing. The ring is a public room-log
// entry with no actor in it, so the crew learns that a Mush acted, not who.

import { logPublic } from "./log.ts";
import type { GameState, RoomId } from "./types.ts";

export const MYCO_ALARM_ITEM = "myco_alarm";

/** What the completed MYCO_ALARM research yields, placed in the lab's room (owner, 2026-10-17). */
export const MYCO_ALARM_YIELD = 3;

// The Mush abilities that ring an alarm (owner, 2026-10-17), so they get the `spore` tag when built: spike and transfer (built),
// mutate, punching, infectious_cuddles, fungal_kitchen, trapper, nightmarish, bacterophiliac, radio_pirate.
// Extracting a spore never rings it, so it has no tag.

/** Rings once if any alarm is on the floor of `room`, however many there are. Mutates a state the caller already cloned. */
export function ringMycoAlarms(state: GameState, room: RoomId): void {
  if (state.items.some((i) => i.type === MYCO_ALARM_ITEM && i.at.kind === "room" && i.at.id === room)) logPublic(state, room, "mycoAlarmRang", undefined, "warning");
}

/** Mutates a state the caller already cloned. */
export function dropMycoAlarms(state: GameState, room: RoomId): void {
  for (let i = 0; i < MYCO_ALARM_YIELD; i++) state.items.push({ id: `item-${state.nextItemId++}`, type: MYCO_ALARM_ITEM, at: { kind: "room", id: room } });
}
