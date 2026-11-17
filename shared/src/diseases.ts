import { roll, rollFloat, rollInt } from "./rng.ts";
import { apGain, skillPicked } from "./modifiers.ts";
import { addStatus, removeStatus, type StatusId } from "./statuses.ts";
import type { DiseaseStats, GameState, PlayerState } from "./types.ts";
import { updateMaxValues } from "./adjustStats.ts";
import { hasSkill } from "./skills.ts";
import { damage } from "./death.ts";
import { soil } from "./dirt.ts";
import { logPublic } from "./log.ts";

export interface DiseaseTracker {
  name: StatusId;
  duration: number;
  resistance: number;
  complete: boolean;
  forever: boolean;
}

/**
 * Injury upgrades: getting a lower-tier injury again (or getting its upgraded form directly) replaces
 * the lower-tier injury with the higher-tier one; getting a lower-tier injury while already holding
 * its higher-tier form is a no-op.
 */
export const INJURY_UPGRADES: Readonly<Record<string, StatusId>> = {
  damaged_ears: "destroyed_ears",
  head_trauma: "open_air_brain",
  haemorrhage: "critical_haemorrhage",
  bruised_shoulder: "broken_shoulder",
};

/** A disease's numbers, found by its `label` (config.ts), not by its place in the list. */
export function diseaseStats(state: Readonly<GameState>, name: string): DiseaseStats | undefined {
  return state.config.diseases.allDiseaseStats.find((stats) => stats.label === name);
}

export function addDisease(state: GameState, player: PlayerState, name: StatusId){
    const upgradeTo = INJURY_UPGRADES[name];
    if (upgradeTo) {
      if (player.modifiers.includes(upgradeTo)) return;
      if (player.modifiers.includes(name)) {
        removeDisease(state, player, name);
        name = upgradeTo;
      }
    } else {
      for (const [lower, higher] of Object.entries(INJURY_UPGRADES)) {
        if (higher === name && player.modifiers.includes(lower)) {
          removeDisease(state, player, lower);
        }
      }
    }
    if(player.modifiers.includes(name)){
        return;
    }
    if (
      player.role === "human" &&
      state.config.diseases.allDiseases.includes(name) &&
      hasSkill(player, "strong_skin") &&
      rollFloat(state) < state.config.strongSkin.resistOdds
    ) {
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
    const stats = diseaseStats(state, name);
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
    player.diseaseTrackers = player.diseaseTrackers.filter((d) => !d.complete && d.name !== name);
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
    for (const tracker of [...player.diseaseTrackers]) {
      tracker.duration -= 1;
      if (player.statuses.includes(treatedStatus(tracker.name))) tracker.duration -= 1;
      if (
        player.treatDiseaseUntil !== undefined &&
        next.cycle <= player.treatDiseaseUntil &&
        next.config.diseases.allDiseases.includes(tracker.name)
      ) {
        tracker.duration -= 1;
      }
      if (tracker.duration <= 0 && !tracker.forever){
        tracker.complete = true;
        removeDisease(next, player, tracker.name);
      } 
    }
    if (player.pendingDiseases?.length) {
      const remaining = [];
      for (const pending of player.pendingDiseases) {
        if (pending.atCycle <= next.cycle) addDisease(next, player, pending.id);
        else remaining.push(pending);
      }
      if (remaining.length > 0) player.pendingDiseases = remaining;
      else delete player.pendingDiseases;
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

/**
 * `gain` without what the bed adds to a lying player's AP refill (the bed's +1 and Lethargy's bonus): for diseases that
 * sometimes spoil the rest (Rejuvenation, Migraine).
 */
export function withoutBedBonus(gain: number, state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  const awake = { ...player, modifiers: player.modifiers.filter((m) => m !== "lying_down"), lyingSince: undefined };
  return gain - Math.max(0, apGain(state, player) - apGain(state, awake));
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

/** Logs "(Player) scratches themselves repeatedly" in the player's room, when the player can have special logs. */
export function itchy(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  logPublic(state, player.room, "scratches", { name: player.character });
}

/** Health a bite takes from its victim. */
const BITE_DAMAGE = 2;

/** Logs "(Player) foams from the mouth" in the player's room, when the player can have special logs. */
export function foaming(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  logPublic(state, player.room, "foams", { name: player.character });
}

/**
 * Logs that the player starts chewing on a random other living player's arm, who loses 2 health, when the player can
 * have special logs. Does nothing when they are alone.
 */
export function bite(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  const others = state.players.filter((p) => p.alive && p.id !== player.id && p.room === player.room);
  if (others.length === 0) return;
  const other = others[rollInt(state, others.length)]!;
  logPublic(state, player.room, "bites", { name: player.character, target: other.character });
  damage(state, other, BITE_DAMAGE, "injury");
}

/** Logs "(Player) does seem very energetic" in the player's room, when the player can have special logs. */
export function weakness(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  logPublic(state, player.room, "weakness", { name: player.character });
}

/** Logs publicly that the player's stomach grumbles (Tapeworm), when they can have special logs. */
export function rumble(state: GameState, player: PlayerState): void {
  if (!canHaveSpecialLogs(player)) return;
  logPublic(state, player.room, "rumble", { name: player.character });
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
    p.modifiers.filter((id) => diseaseStats(state, id)?.spreadByDTT);
  const fromA = spreading(a);
  const fromB = spreading(b);
  for (const id of fromA) addDisease(state, b, id as StatusId);
  for (const id of fromB) addDisease(state, a, id as StatusId);
}

/**
 * Whether your screen's text is blurred (Pink Eye, owner 2026-11-15): the iTrackie and the action buttons. Read from
 * your own view only (your statuses carry your diseases); a Mush carries it without suffering it.
 */
export function blurredVision(view: { statuses: readonly string[]; you: { role: string } }): boolean {
  return view.you.role !== "mush" && view.statuses.includes("pink_eye_disease");
}
