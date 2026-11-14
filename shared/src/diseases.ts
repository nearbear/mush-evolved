import { roll, rollInt } from "./rng.ts";
import { skillPicked } from "./modifiers.ts";
import { addStatus, removeStatus, type StatusId } from "./statuses.ts";
import type { GameState, PlayerState } from "./types.ts";
import { updateMaxValues } from "./adjustStats.ts";
import { hasSkill } from "./skills.ts";
import { soil } from "./dirt.ts";
import { logPublic } from "./log.ts";

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
      tracker.duration -= 1;
      if (player.statuses.includes(treatedStatus(tracker.name))) tracker.duration -= 1;
      if (tracker.duration <= 0 && !tracker.forever){
        tracker.complete = true;
        removeDisease(next, player, tracker.name);
      } 
    }
  }
}

/**
 * Whether a disease's stat effects (MP, health, morale, dirt and the like) apply to the player: not to a Mush, who can
 * catch diseases but is not hurt by them. Every event hook of a disease guards its stat effects with this, since a
 * Mush's diseases still run those hooks (modifiers.ts, `eventIds`) for spreading and special logs.
 */
export function diseaseAffects(player: PlayerState): boolean {
  return player.role !== "mush";
}

/** Special disease logs are for humans, and for anyone with the bacterial_contact skill. */
export function canHaveSpecialLogs(player: PlayerState): boolean {
  return player.role !== "mush" || hasSkill(player, "bacterial_contact");
}

/** Logs "(Player) sneezes" in the player's room, when the player can have special logs. */
export function sneeze(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  logPublic(state, player.room, "sneezes", { name: player.character });
}

/**
 * Logs that the player vomits, when they can have special logs. Alone, they throw up on themselves; otherwise a random
 * other living player in the room is the target. Whoever is hit gets dirty (soil: an apron or Stickler can block it).
 */
export function vomit(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  const others = state.players.filter((p) => p.alive && p.id !== player.id && p.room === player.room);
  if (others.length === 0) {
    logPublic(state, player.room, "vomitSelf", { name: player.character });
    soil(state, player);
    return;
  }
  const other = others[rollInt(state, others.length)]!;
  logPublic(state, player.room, "vomitOther", { name: player.character, target: other.character });
  soil(state, other);
}

/**
 * Two players STT or DTT: each gives the other every disease they carry whose stats have `spreadByDTT`. Both lists are
 * read first, so a disease cannot hop on twice. A Mush spreads too (they only don't suffer, `diseaseAffects`).
 */
export function spreadByTouch(state: GameState, a: PlayerState, b: PlayerState): void {
  const spreading = (p: PlayerState) =>
    p.modifiers.filter((id) => state.config.diseases.allDiseaseStats[state.config.diseases.allDiseases.indexOf(id)]?.spreadByDTT);
  const fromA = spreading(a);
  const fromB = spreading(b);
  for (const id of fromA) addDisease(state, b, id as StatusId);
  for (const id of fromB) addDisease(state, a, id as StatusId);
}
