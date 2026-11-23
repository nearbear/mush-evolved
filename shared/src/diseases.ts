import { roll, rollFloat, rollInt } from "./rng.ts";
import type { CurseId } from "./curses.ts";
import { skillPicked } from "./modifiers.ts";
import { addStatus, removeStatus, type StatusId } from "./statuses.ts";
import type { DiseaseStats, GameState, PlayerState } from "./types.ts";
import { updateMaxValues } from "./adjustStats.ts";
import { hasSkill } from "./skills.ts";
import { damage } from "./death.ts";
import { soil } from "./dirt.ts";
import { logPrivate, logPublic } from "./log.ts";

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
 * any higher tier of it is a no-op. Tiers chain (Broken Foot → Mashed Foot → Unusable Legs).
 */
export const INJURY_UPGRADES: Readonly<Record<string, StatusId>> = {
  damaged_ears_injury: "destroyed_ears_injury",
  head_trauma_injury: "open_air_brain_injury",
  haemorrhage_injury: "critical_haemorrhage_injury",
  bruised_shoulder_injury: "broken_shoulder_injury",
  broken_shoulder_injury: "shattered_shoulder_injury",
  burnt_hand_injury: "burned_arm_injury",
  third_degree_50_injury: "third_degree_90_injury",
  broken_foot_injury: "mashed_foot_injury",
  mashed_foot_injury: "unusable_legs_injury",
  broken_leg_injury: "unusable_legs_injury",
  broken_finger_injury: "missing_finger_injury",
};

/**
 * Injuries that cancel others without being their upgrade (eMushpedia's "Annulé par"; owner, 2026-11-22): getting the
 * key removes every listed injury held, and getting a listed injury while holding the key (or anything above it) is a
 * no-op, as with an upgrade. Getting a listed injury twice still upgrades it through INJURY_UPGRADES.
 */
export const INJURY_CANCELS: Readonly<Record<string, readonly StatusId[]>> = {
  shredded_hand_injury: ["broken_finger_injury", "missing_finger_injury", "burnt_hand_injury"],
  shattered_arm_injury: ["broken_finger_injury", "missing_finger_injury", "burnt_hand_injury", "shredded_hand_injury", "busted_arm_joint_injury"],
  shattered_shoulder_injury: ["broken_finger_injury", "missing_finger_injury", "burnt_hand_injury", "shredded_hand_injury", "shattered_arm_injury", "busted_arm_joint_injury"],
};

/** The injuries directly above `name`: its upgrade and every injury that cancels it. */
function directlyAbove(name: string): StatusId[] {
  const up = INJURY_UPGRADES[name];
  const cancellers = Object.keys(INJURY_CANCELS).filter((key) => INJURY_CANCELS[key]!.includes(name));
  return up ? [up, ...cancellers] : cancellers;
}

/** Every injury above `name`, through upgrades and cancels, however many steps up. */
function tiersAbove(name: string): StatusId[] {
  const out: StatusId[] = [];
  const queue = directlyAbove(name);
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (out.includes(next)) continue;
    out.push(next);
    queue.push(...directlyAbove(next));
  }
  return out;
}

/** A disease's numbers, found by its `label` (config.ts), not by its place in the list. */
export function diseaseStats(state: Readonly<GameState>, name: string): DiseaseStats | undefined {
  return state.config.diseases.allDiseaseStats.find((stats) => stats.label === name);
}

export function addDisease(state: GameState, player: PlayerState, name: StatusId){
    if (tiersAbove(name).some((higher) => player.modifiers.includes(higher))) return;
    const upgradeTo = INJURY_UPGRADES[name];
    if (upgradeTo && player.modifiers.includes(name)) {
      removeDisease(state, player, name);
      name = upgradeTo;
    }
    for (const held of [...player.modifiers]) {
      if (tiersAbove(held).includes(name)) removeDisease(state, player, held);
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
    // An injury lasts until surgery, unless its stats give it a duration (Stiff Neck, owner 2026-11-20).
    const stats = diseaseStats(state, name);
    if (stats?.durationMin !== undefined) {
      const duration = roll(state, [stats.durationMin, stats.durationMax ?? stats.durationMin]);
      player.diseaseTrackers.push({ name, duration, resistance: 8, complete: false, forever: false });
      return;
    }
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

/**
 * Curses a player (curses.ts): a new curse goes through `addDisease`; one they already have gets a fresh duration,
 * rolled again from its stats (owner, 2026-11-22: recursing refreshes it).
 */
export function addCurse(state: GameState, player: PlayerState, name: CurseId): void {
  const tracker = player.diseaseTrackers.find((t) => t.name === name && !t.complete);
  if (!player.modifiers.includes(name) || !tracker) {
    addDisease(state, player, name);
    return;
  }
  const stats = diseaseStats(state, name);
  tracker.duration = roll(state, [stats?.durationMin || 1, stats?.durationMax || 2]);
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

/** The diseases `p` carries that spread in the room, with their chance (`roomSpread` or `cycleSpread` in config.ts). */
function spreadOdds(state: Readonly<GameState>, p: Readonly<PlayerState>, key: "roomSpread" | "cycleSpread"): [StatusId, number][] {
  return p.modifiers.flatMap((id): [StatusId, number][] => {
    const odds = diseaseStats(state, id)?.[key];
    return odds != null ? [[id, odds]] : [];
  });
}

/**
 * A cycle change: each disease the carrier has with a `cycleSpread` chance rolls once for each other living player in
 * their room (Cold, Flu, Rubella, Gastroenteritis, Skin inflammation). Called for each living player in seat order
 * (`cycleChanged`), so someone who catches it earlier in the same cycle change spreads it on their turn. A Mush spreads too.
 */
export function spreadAtCycle(state: GameState, carrier: PlayerState): void {
  for (const [id, odds] of spreadOdds(state, carrier, "cycleSpread")) {
    for (const other of state.players) {
      if (other.alive && other.id !== carrier.id && other.room === carrier.room && rollFloat(state) < odds) addDisease(state, other, id);
    }
  }
}

/**
 * Two players meet as one walks into the other's room (`enterRoom`): each disease either carries with a `roomSpread`
 * chance rolls once to reach the other, `a`'s first. Both lists are read first, as in `spreadByTouch`. A Mush spreads too.
 */
export function spreadOnEncounter(state: GameState, a: PlayerState, b: PlayerState): void {
  const fromA = spreadOdds(state, a, "roomSpread");
  const fromB = spreadOdds(state, b, "roomSpread");
  for (const [id, odds] of fromA) if (rollFloat(state) < odds) addDisease(state, b, id);
  for (const [id, odds] of fromB) if (rollFloat(state) < odds) addDisease(state, a, id);
}

/**
 * Whether your screen's text is blurred (Pink Eye, owner 2026-11-15): the iTrackie and the action buttons. Read from
 * your own view only (your statuses carry your diseases); a Mush carries it without suffering it.
 */
export function blurredVision(view: { statuses: readonly string[]; you: { role: string } }): boolean {
  return view.you.role !== "mush" && view.statuses.includes("pink_eye_disease");
}

/**
 * Whether Rubella keeps the player from cooking (Cook, Express Cook) and repairing (Repair, Repair Hull, Repair
 * PILGRED, Renovate): a human with it (owner, 2026-11-17). A Mush carries it without effect.
 */
export function rubellaBlocks(player: Readonly<PlayerState>): boolean {
  return player.role === "human" && player.modifiers.includes("rubella_disease");
}

/** Catches one of `config.diseases.incidentDiseases` the player doesn't have yet, told privately like the incident. */
export function catchIncidentDisease(state: GameState, player: PlayerState): void {
  const catchable = state.config.diseases.incidentDiseases.filter((d) => !player.modifiers.includes(d));
  if (catchable.length === 0) return;
  addDisease(state, player, catchable[rollInt(state, catchable.length)]! as StatusId);
  logPrivate(state, player.id, "incidentDisease");
}
