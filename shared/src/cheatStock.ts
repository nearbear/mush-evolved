// The Superkube's spawned items (#170). Apart from cheatRoom.ts because it reads the blueprint and skill tables, which
// config.ts must not import.

import { BLUEPRINTS } from "./blueprints.ts";
import { BOOK_ITEM } from "./itemIds.ts";
import { SKILLS } from "./skills.ts";
import type { ItemState, RoomId } from "./types.ts";

/**
 * One item of the type on a room's floor, without its id. A blueprint and a skill book need a recipe and a skill:
 * they get the first of each. Charges are the caller's (`startCharges`), as for the ship's start items.
 */
export function cheatItem(type: string, room: RoomId): Omit<ItemState, "id"> {
  return {
    type,
    at: { kind: "room", id: room },
    ...(type === "blueprint" && { builds: Object.keys(BLUEPRINTS)[0]! }),
    ...(type === BOOK_ITEM && { teaches: SKILLS[0]! }),
  };
}
