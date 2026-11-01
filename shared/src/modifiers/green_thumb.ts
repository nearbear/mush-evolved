import { TREE_POT_ITEM, produceItem } from "../items.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "green_thumb" (the original's Main Verte; owner, 2026-11-01): when picked, `config.greenThumb.pots` = 2 empty
// hydropots (`tree_pot`), into the inventory, or on the room floor if the inventory is full. Picking it again through a
// skill book gives them again, as on the wiki. Its other effect (grafts start one cycle older) waits for grafting.
// No log line (picking a skill writes none).
export const green_thumb: Modifier = {
  onPick: (next, player) => {
    for (let i = 0; i < next.config.greenThumb.pots; i++) produceItem(next, player, TREE_POT_ITEM);
  },
};
