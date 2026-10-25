import { DEFAULT_CONFIG } from "./config.ts";
import { logPrivate } from "./log.ts";
import { maxMorale, skillPicked } from "./modifiers.ts";
import { addStatus, removeStatus, type StatusId } from "./statuses.ts";
import type { ChannelId, GameState, PlayerState } from "./types.ts";

export function loseMorale(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  if (player.cheats.includes("infiniteMorale")) {
    player.morale = player.maxMorale;
    return;
  }
  player.morale = Math.max(0, player.morale-amount);  
}

export function gainMorale(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.morale = Math.min(player.maxMorale, player.morale + amount); 
  player.morale = Math.max(0, player.morale);

}

export function updateMaxValues(state: GameState, player: PlayerState){
    player.maxMorale = maxMorale(state, player, DEFAULT_CONFIG.maxMorale);
    if(player.morale > player.maxMorale){
        player.morale = player.maxMorale;
    }
}

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
    player.modifiers.push(name);
    skillPicked(state, player, name);
    addStatus(player, name);
    player.diseaseTrackers.push({ name, duration: 8, resistance: 8, complete: false, forever: false });
}

export function removeDisease(state: GameState, player: PlayerState, name: StatusId){
    if(!player.modifiers.includes(name)){
        return;
    }
    player.modifiers.splice(player.modifiers.indexOf(name), 1);
    removeStatus(player, name);
    updateMaxValues(state, player)
    player.diseaseTrackers = player.diseaseTrackers.filter((d) => d.complete != true);
}

/** Runs every onCycle hook of each living player, in seat order. Mutates a state the caller already cloned. */
export function diseaseTrackerCycleChange(next: GameState): void {
  for (const player of next.players) {
    if (!player.alive) continue;
    for (const tracker of player.diseaseTrackers) {
      tracker.duration -= 1;
      if (tracker.duration <= 0){
        tracker.complete = true;
        removeDisease(next, player, tracker.name);
      } 
    }
  }
}