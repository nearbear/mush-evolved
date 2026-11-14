import { roll } from "./rng.ts";
import { skillPicked } from "./modifiers.ts";
import { addStatus, removeStatus, type StatusId } from "./statuses.ts";
import type { GameState, PlayerState } from "./types.ts";
import { updateMaxValues } from "./adjustStats.ts";

export interface DiseaseTracker {
  name: StatusId;
  duration: number;
  resistance: number;
  complete: boolean;
  forever: boolean;
}

export function addDisease(state: GameState, player: PlayerState, name: StatusId){
    if(player.modifiers.includes(name)){
        return;
    }
    if(state.config.diseases.allInjuries.includes(name)){
    player.modifiers.push(name);
    skillPicked(state, player, name);
    addStatus(player, name);
    // const index = state.config.diseases.allInjuries.indexOf(name);
    // const stats = state.config.diseases.allInjuryStats.at(index);
    

    player.diseaseTrackers.push({ name, duration: 99, resistance: 8, complete: false, forever: true });
    return;
    }
    if(player.role == "mush"){
      return;
    }
    player.modifiers.push(name);
    skillPicked(state, player, name);
    addStatus(player, name);
    const index = state.config.diseases.allDiseases.indexOf(name);
    const stats = state.config.diseases.allDiseaseStats.at(index);
    const duration = roll(state, [stats?.durationMin || 1, stats?.durationMax || 2]);

    player.diseaseTrackers.push({ name, duration: duration, resistance: 8, complete: false, forever: false });
}

export function removeDisease(state: GameState, player: PlayerState, name: StatusId){
    if(!player.modifiers.includes(name)){
        return;
    }
    player.modifiers.splice(player.modifiers.indexOf(name), 1);
    removeStatus(player, name);
    removeStatus(player, treatedStatus(name));
    updateMaxValues(state, player)
    player.diseaseTrackers = player.diseaseTrackers.filter((d) => d.complete != true);
    //logPrivate(state, player.id, "diseaseCured", {name});
}

export function treatedStatus(name: StatusId): StatusId {
    return "treated_" + name;
}

/** Marks a disease the player has as treated: it then loses 1 extra duration per cycle. */
export function treatDisease(state: GameState, player: PlayerState, name: StatusId){
    if(!player.modifiers.includes(name)){
        return;
    }
    addStatus(player, treatedStatus(name));
}

/** Runs every onCycle hook of each living player, in seat order. Mutates a state the caller already cloned. */
export function diseaseTrackerCycleChange(next: GameState): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    for (const tracker of player.diseaseTrackers) {
      if (player.role == "mush" && !next.config.diseases.allInjuries.includes(tracker.name)){
      removeDisease(next, player, tracker.name);
      }
      tracker.duration -= 1;
      if (player.statuses.includes(treatedStatus(tracker.name))) tracker.duration -= 1;
      if (tracker.duration <= 0 && !tracker.forever){
        tracker.complete = true;
        removeDisease(next, player, tracker.name);
      } 
    }
  }
}
