// Fire (owner, 2026-10-25, #184; the original's FIRE_* numbers in Gameplay.hx and eMush's DifficultyConfigData.php).
// `GameState.fires` lists the burning rooms. A new fire is always announced in global chat, without the room (owner,
// 2026-11-01); only the living in a burning room see that it burns (`PlayerView.roomOnFire`). Fire burns no oxygen.
// Putting one out is actions/extinguish.ts.

import { breakEquipment, breakItem, workingBreakable } from "./breakage.ts";
import { isFireproof } from "./drones.ts";
import { ITEM_TYPES, isWorking, itemsIn } from "./items.ts";
import { CHEAT_ROOM } from "./cheatRoom.ts";
import { shipInvincible } from "./cheats.ts";
import { pushChat } from "./chat.ts";
import { damage } from "./death.ts";
import { destroyShip } from "./hunters.ts";
import { logPublic } from "./log.ts";
import { projectDone } from "./projects.ts";
import { forgetReports } from "./reports.ts";
import { inCraft } from "./patrol.ts";
import { roll, rollFloat, rollInt } from "./rng.ts";
import type { GameState, RoomId } from "./types.ts";

/** The Daedalus's own rooms: every room but the patrol ships' (incidents and fire stay aboard). */
export const daedalusRooms = (state: Readonly<GameState>): RoomId[] => Object.keys(state.config.rooms).filter((room) => !inCraft(room) && room !== CHEAT_ROOM);

export const isOnFire = (state: Readonly<GameState>, room: RoomId): boolean => state.fires.includes(room);

/** At a cycle change, before incidents and fires act: lights each room a Pyromaniac set (actions/ignite.ts). */
export function ignitePending(state: GameState): void {
  const rooms = state.pendingFires;
  state.pendingFires = [];
  for (const room of rooms) startFire(state, room);
}

/** Sets a room on fire, if it isn't already, and NERON announces it. Mutates a state the caller already cloned. */
export function startFire(state: GameState, room: RoomId): void {
  if (isOnFire(state, room)) return;
  state.fires.push(room);
  forgetReports(state, { room }); // A relit fire starts unreported (#444).
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "fireStarted" } });
}

/**
 * At each cycle change, after incidents (so a fire acts in the cycle it starts): each room that was burning either
 * spreads to a neighbour not on fire (`spreadChance`, at most `maxSpreads` a cycle; a fire it starts acts from the next
 * cycle) or does damage: each breakable piece of equipment and each breakable item on the floor (with a room log line) breaks with `breakChance`, the hull loses `hullDamage` with
 * `hullChance`, and everyone present loses `damage` HP. Mutates a state the caller already cloned.
 */
export function fireCycle(state: GameState): void {
  if (projectDone(state, "AUTO_WATERING")) {
    const chance = state.config.project.autoWatering.extinguishChance;
    state.fires = state.fires.filter((room) => {
      if (rollFloat(state) >= chance) return true;
      pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "fireExtinguishedSprinklers" } });
      return false;
    });
  }
  const config = state.config.fire;
  let spreads = 0;
  for (const room of [...state.fires]) {
    if (state.phase !== "playing") return;
    const neighbours = (state.config.rooms[room] ?? []).filter((r) => !isOnFire(state, r) && !inCraft(r));
    if (rollFloat(state) < config.spreadChance && spreads < config.maxSpreads && neighbours.length > 0) {
      spreads += 1;
      startFire(state, neighbours[rollInt(state, neighbours.length)]!);
      continue;
    }
    for (const equipment of workingBreakable(state, room)) if (rollFloat(state) < config.breakChance) breakEquipment(state, equipment);
    // Owner, 2026-11-07: the same chance for each working item that can break and lies on the floor (not what people
    // carry); public room line `fireBrokeItem`, or `fireDestroyedItem` for one that is destroyed when broken. A
    // Firefighter drone is never broken by fire, so it doesn't roll (#412, owner, 2026-11-12).
    for (const item of itemsIn(state, { kind: "room", id: room }).filter((i) => isWorking(i) && ITEM_TYPES[i.type]?.canBreak && !isFireproof(i))) {
      if (rollFloat(state) >= config.breakChance) continue;
      breakItem(state, item);
      logPublic(state, room, ITEM_TYPES[item.type]!.isDestroyedWhenBroken ? "fireDestroyedItem" : "fireBrokeItem", { item: item.type });
    }
    if (rollFloat(state) < config.hullChance) {
      const loss = roll(state, config.hullDamage);
      if (!shipInvincible(state)) state.ship.hull = Math.max(0, state.ship.hull - loss);
      if (state.ship.hull === 0) {
        destroyShip(state);
        return;
      }
    }
    const present = state.players.filter((p) => p.alive && p.room === room);
    if (present.length > 0) logPublic(state, room, "fireBurns");
    for (const p of present) damage(state, p, config.damage, "burnt");
  }
}
