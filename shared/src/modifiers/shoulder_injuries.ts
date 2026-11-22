import { updateMaxValues } from "../adjustStats.ts";
import { ITEM_TYPES, itemsIn } from "../items.ts";
import { logPublic } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { isShot } from "./shots.ts";

// Bruised Shoulder (owner, 2026-11-18): -1 max health, and every shot's success chance (`isShot`, shots.ts) x0.9.
export const bruised_shoulder_injury: Modifier = {
  actionSucessRate: (chance, { action, tags }) => (isShot(action, tags) ? chance * 0.9 : chance),
  maxHp: (value) => Math.max(1, value - 1),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};

/**
 * A shoulder too hurt for heavy items: `maxHpLoss` max health, every shot's success chance x`shotFactor`, `apSurcharge`
 * more AP on an action that already costs AP (Burnt Hand's scope: free actions and moves unaffected), and no heavy items
 * (`noHeavy`): taking one is refused (TransferAction), and any carried when it starts drop into the room, each with the
 * usual public "dropped" line. An item that can't be dropped (`canDrop: false`) stays.
 */
function heavyBlockingShoulder({ maxHpLoss, shotFactor, apSurcharge = 0 }: { maxHpLoss: number; shotFactor: number; apSurcharge?: number }): Modifier {
  return {
    noHeavy: true,
    actionSucessRate: (chance, { action, tags }) => (isShot(action, tags) ? chance * shotFactor : chance),
    ...(apSurcharge > 0 && {
      actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + apSurcharge } : cost),
    }),
    maxHp: (value) => Math.max(1, value - maxHpLoss),
    onPick: (next, player) => {
      updateMaxValues(next, player);
      for (const item of itemsIn(next, { kind: "player", id: player.id })) {
        const type = ITEM_TYPES[item.type];
        if (!type?.heavy || type.canDrop === false) continue;
        item.at = { kind: "room", id: player.room };
        logPublic(next, player.room, "dropped", { name: player.character, item: item.type });
      }
    },
  };
}

// Broken Shoulder (owner, 2026-11-18), Bruised Shoulder's upgrade: -2 max health, every shot x0.8, and no heavy items.
export const broken_shoulder_injury: Modifier = heavyBlockingShoulder({ maxHpLoss: 2, shotFactor: 0.8 });

// Shattered Shoulder (owner, 2026-11-22; eMushpedia's "Épaule pulvérisée"), Broken Shoulder's upgrade
// (INJURY_UPGRADES, diseases.ts): +2 AP on actions, -3 max health, every shot x0.6 (40% off, relative, as the other
// shoulders), and no heavy items.
export const shattered_shoulder_injury: Modifier = heavyBlockingShoulder({ maxHpLoss: 3, shotFactor: 0.6, apSurcharge: 2 });
