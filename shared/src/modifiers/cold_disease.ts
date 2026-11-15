import { updateMaxValues } from "../adjustStats.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollInt, rollFloat } from "../rng.ts";
import { changeMP } from "../adjustStats.ts";
import { addDisease, diseaseAffects, diseaseStats } from "../diseases.ts";

export const cold_disease: Modifier = {
  onCycle(next, player) {
    // Spread first: the MP roll below returns early. Each other living player in the room is a separate roll.
    const spread = diseaseStats(next, "cold_disease")?.cycleSpread;
    if (spread != null) {
      for (const other of next.players) {
        if (other.alive && other.id !== player.id && other.room === player.room && rollFloat(next) < spread) addDisease(next, other, "cold_disease");
      }
    }
    if (!diseaseAffects(player)) return; // a Mush spreads it but loses nothing
    if (rollInt(next, 3) !== 0 || player.mp <= 0) return;

  
    changeMP(next, player, -1);
    logPrivate(next, player.id, "coldDiseaseMpLost");
  },
  punchDamage: (damage, _player, state) => (damage -1 < 0) ? 1 : damage - 1,
  maxMorale: (damage, _player, state) => (damage -3 < 0) ? 1 : damage - 3,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onEncounter(next, player, other){
    let odds = diseaseStats(next, "cold_disease")?.roomSpread;
  
    if(odds != null && rollFloat(next) < odds){
      addDisease(next, other, "cold_disease");
    }
    
  },
};
