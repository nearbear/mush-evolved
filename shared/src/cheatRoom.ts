// The cheat room (#170, dev mode only): a room off the map, with no doors, holding only the Superkube (owner,
// 2026-11-14: no items, no coffee machine; the Superkube spawns what a test needs). Only a ship launched while the
// server allowed cheats has it (`ConfigOverrides.cheatRoom`, set by GameRoom.launch). Test tooling, not a game rule.
// Data only, so config.ts can import it. Its layout is Mush/derived/cheat-room.json, loaded by the client on entry.

import type { Equipment, RoomId } from "./types.ts";

export const CHEAT_ROOM: RoomId = "CHEAT_ROOM";

/** The cheat room's testing machine. Its options are cheat inputs, never actions. */
export const SUPERKUBE = "SUPERKUBE";

/** The equipment in the cheat room. Adding a testing machine is one entry here. */
const CHEAT_ROOM_EQUIPMENT: readonly string[] = [SUPERKUBE];

/** The cheat room's equipment, for `config.equipment`, with ids like the map's (`ROOM:TYPE`). */
export const cheatRoomEquipment = (): Equipment[] => CHEAT_ROOM_EQUIPMENT.map((type) => ({ id: `${CHEAT_ROOM}:${type}`, type }));
