import { updateMaxValues } from "../adjustStats.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollInt, rollFloat } from "../rng.ts";
import { addDisease, changeMP } from "../adjustStats.ts";

export const cold_disease: Modifier = {
  onCycle(next, player) {
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
    let odds = next.config.diseases.allDiseaseStats[next.config.diseases.allDiseases.indexOf("cold_disease")]?.roomSpread;
  
    if(odds != null && rollFloat(next) < odds){
      addDisease(next, other, "cold_disease");
    }
    
  },
};
