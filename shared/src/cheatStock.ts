// The cheat room's items (#170): one of every item type, so a new type shows up there by itself. Apart from
// cheatRoom.ts because it reads ITEM_TYPES, which config.ts must not import.

import { BLUEPRINTS } from "./blueprints.ts";
import { CHEAT_ROOM } from "./cheatRoom.ts";
import { BOOK_ITEM } from "./itemIds.ts";
import { ITEM_TYPES } from "./items.ts";
import { SKILLS } from "./skills.ts";
import type { ItemState } from "./types.ts";

/**
 * One of each item type on the cheat room's floor, in `ITEM_TYPES` order. A blueprint and a skill book need a recipe
 * and a skill: they get the first of each. Charges are the caller's (`startCharges`), as for the ship's start items.
 */
export function cheatRoomStock(): Omit<ItemState, "id">[] {
  const blueprint = Object.keys(BLUEPRINTS)[0]!;
  return Object.keys(ITEM_TYPES).map((type) => ({
    type,
    at: { kind: "room", id: CHEAT_ROOM },
    ...(type === "blueprint" && { builds: blueprint }),
    ...(type === BOOK_ITEM && { teaches: SKILLS[0]! }),
  }));
}
