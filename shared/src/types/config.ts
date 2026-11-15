import type { IncidentId } from "../incidents.ts";
import type { PlanetDirection } from "../planets.ts";
import type { PlantState, RoomId } from "../types.ts";
import type { StatusId } from "../statuses.ts";
import type { HunterType } from "./state.ts";

/** One kind of hunter (owner, 2026-11-12, #388; eMush's `HunterConfigData`). */
export interface HunterTypeConfig {
  hp: number;
  damage: [number, number]; // Damage per hit, uniform.
  hitChance: number; // Its chance to hit, 0 to 1, back to this after a hit.
  actions: number; // Actions each cycle change (pick a target, or shoot); 0 for the asteroid, which only counts down.
  armor: number; // Taken off each hit it receives, down to 0.
  cost: number; // Pool points a wave spends on it.
  weight: number; // Its weight in a wave's draw.
  fromDay: number; // The first day a wave can draw it.
  maxPerWave: number | null; // At most this many in one wave; null: no cap.
  follows: "share" | "all" | "never"; // On a jump: part of the `followShare` draw, always, or never.
  countdown: number | null; // Cycle changes before it hits the Daedalus for its hp and is gone (the asteroid); null: never.
}

/** `T` with every field read-only, all the way down. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/**
 * How moving between rooms is paid for. These are base values; modifiers from
 * items and skills can change them per player (see modifiers.ts).
 */
export interface MovementRules {
  mpPerMove: number; // MP spent per move.
  apPerConversion: number; // When MP is short, this much AP is converted...
  mpPerConversion: number; // ...into this much MP.
  mpCap: number; // MP can never exceed this.
}

export interface DiseaseCatagories {
  allDiseases: string [],
  /** The diseases the disease incident (incidents.ts) picks from. */
  incidentDiseases: string[],
  allDisorders: string [],
  allInjuries: StatusId[],
  allDiseaseStats: DiseaseStats[],
  allDisorderStats: DiseaseStats[],
  allInjuryStats: DiseaseStats[],
}

export interface DiseaseStats {
  /** The disease these numbers belong to: its id (an entry of `allDiseases`). `diseaseStats` (diseases.ts) finds a disease's numbers by it. */
  label?: string,
  type: string,
  durationMin?: number,
  durationMax?: number,
  resistance?: number,
  roomSpread?: number,
  /** Chance to spread to each other living player in the room at a cycle change. */
  cycleSpread?: number,
  /** Spreads to the other player whenever two players STT or DTT (share.ts). */
  spreadByDTT?: boolean,
  dttSpread?: number,
}


/** One weapon's numbers (owner, 2026-10-22, from the English wiki; "??" values were set to 12%). */
export interface WeaponStats {
  damage: [min: number, max: number]; // HP a hit removes, rolled uniformly, both ends included.
  mushDamage?: [min: number, max: number]; // Replaces `damage` when the target is a Mush (Natamy rifle).
  accuracy: number; // Chance to hit, 0 to 1.
  expoStrength: number; // Strength in an expedition fight (expeditions.ts).
  charges?: number; // Charges it holds and starts with; each use spends one, and it can't be used at 0. Absent: unlimited.
  area?: { selfDamage: [min: number, max: number] }; // Hits everyone in the room instead of one target; the attacker takes `selfDamage`.
  melee?: boolean; // Used in person, so the attack is tagged `melee` (knife).
  gun?: boolean; // A gun: neither melee nor thrown (not the knife or grenade). Counts for Shooter in expeditions.
  consumed?: boolean; // Used up by using it (grenade).
  dirtyChance: number; // Chance of getting dirty from using it.
  repairChance: number | null; // Breakable, with this repair chance; null: it can't break. Breaking and repair aren't built.
}

/** What can happen in one expedition sector (expeditions.ts, owner 2026-10-31). */
export type ExpeditionEventKind =
  | "nothing"
  | "fatigue"
  | "accident"
  | "catastrophe"
  | "oxygen"
  | "fuel"
  | "harvest"
  | "provision"
  | "artifact"
  | "fight"
  // Phases 3 and 4 (owner, 2026-11-08, #357).
  | "again"
  | "back"
  | "lostItem"
  | "kill"
  | "killAll"
  | "disease"
  | "mushTrap"
  | "starmap"
  | "lost"
  // Phase 3, slice B (owner, 2026-11-08, #357): the Lost sector's events.
  | "found"
  | "foundDead"
  // Phase 3, slice C (owner, 2026-11-08, #357): never drawn. A member without a needed spacesuit stays in the Icarus
  // (`noSpacesuit`); nobody has one, so the expedition ends at takeoff (`grounded`).
  | "noSpacesuit"
  | "grounded"
  // Phase 4, slice D (owner, 2026-11-08, #358): never drawn. A U-turn holder ended the expedition (`who`).
  | "uTurn";

/**
 * One line of a sector's event table: drawn by `weight`. `amount` is the oxygen or fuel gained, or the fruits or
 * rations found; `creature` is a fight's opponent (`expedition.creatures`). `negative` marks the lines a Traitor's
 * sabotage keeps (owner, 2026-11-08, #358): a sabotaged expedition draws only those.
 */
export interface ExpeditionEventRule {
  kind: ExpeditionEventKind;
  weight: number;
  amount?: number;
  creature?: string;
  negative?: boolean;
}

/** What a won fight brings back: rations (steaks), random artifacts, starmap fragments. */
export interface CreatureLoot {
  provision?: number;
  artifact?: number;
  starmap?: number;
}

/**
 * Pre-selection (docs/rules/rules-design.md, "Joining and Mush selection"): the ship launches with nobody Mush, players join
 * it, and Mush are chosen when it fills or when the deadline cycle begins, whichever comes first.
 */
export interface PreselectionRules {
  seats: number; // The ship is full, and Mush are chosen, at this many players.
  endsOn: { day: number; cycle: number }; // Mush are chosen when this cycle begins, if the ship hasn't filled.
  // "auto": more than `twoMushAbove` players get 2 Mush, otherwise 1. A fixed count is lowered to the players aboard
  // minus 2, with at least 1 (owner, 2026-10-24, #229).
  mushCount: "auto" | number;
  twoMushAbove: number; // More players than this get 2 Mush; this many or fewer get 1.
  minPlayers: number; // Stopgap (owner, 2026-10-24): fewer players than this at selection and every human dies at once.
}

/**
 * The only ways a game may differ from `DEFAULT_CONFIG` (`resolveConfig`). A stored game keeps these instead of its
 * config, so it picks up balance changes on its next load. Anything per game that must survive a reload lives here,
 * and config fields derived from it are recomputed by `resolveConfig`. A new key is listed in `normalizeOverrides` (the compiler asks);
 * renaming or removing one, or changing what `resolveConfig` derives from a key, needs an upgrade step and a
 * `STATE_VERSION` bump (shared/src/normalizeState.ts): a renamed key would silently fall back to the default in live games.
 */
export interface ConfigOverrides {
  mushCount?: number; // Single player: 1.
  manualCycles?: boolean; // Single player, and wherever the server allows cheats.
  instantExpeditions?: boolean; // Single player: an expedition resolves at takeoff (owner, 2026-11-07, #356).
  cycleHours?: number; // A setup's cycle length (#230): one of `CYCLE_HOURS` (setups.ts). Also sets `cyclesPerDay`.
  sharedSpots?: boolean; // A setup's shared positions (#231).
  setupId?: string; // The setup the ship launched with (#232). Its knobs are already in the keys above.
  cheatRoom?: boolean; // The cheat room (#170, cheatRoom.ts): set at launch wherever the server allows cheats.
  // A ship's rules, whole, frozen at launch: an edit to `PRESELECTION` would otherwise move a live ship's deadline or
  // seat count away from the matchmaker's. Absent: `DEFAULT_CONFIG`'s (`null`).
  preselection?: PreselectionRules;
}

export interface FruitsConfig {
  valueRange: [number, number]; // Inclusive target budget [min, max] when rolling each species at launch.
  maxAttempts: number; // Cap on full-fruit re-rolls before failing loudly.
  growCyclesPerPoint: number; // Grow time per point of value (value 3..6 -> 12..24 cycles).
  ap: { ap: number; value: number }[]; // Single-slot AP options (plus "none" at equal odds).
  morale: { morale: number; value: number }[]; // Single-slot morale options (plus "none" at equal odds).
  hp: { hp: number; value: number }[]; // Single-slot HP options (plus "none" at equal odds).
  maxSpecials: number; // Max distinct special buffs rolled (0..maxSpecials).
  buffs: {
    treat_disease: { value: number; cycles: number }; // Extra -1 duration per cycle on every disease.
    energize: { value: number; cycles: number; extraMpPerConversion: number }; // Extra MP per AP-to-MP conversion.
    resistance: { value: number; cycles: number }; // Immune to spores.
    perception: { value: number; cycles: number; factor: number }; // Relative success chance factor on actions.
  };
  maxDiseases: number; // Max distinct diseases rolled (0..min(maxDiseases, eligible.length)).
  diseaseOdds: [number, number]; // Inclusive integer percent [min, max] divided by 100 -> 0.30..0.80.
  diseaseValueDivisor: number; // Disease value divisor: -Math.max(1, Math.round(cost * odds / divisor)).
  diseaseDelay: [number, number]; // Delay in cycles rolled per meal [min, max].
  diseases: Record<string, number>; // Pool of alien fruit disease ids -> cost; cold is never included.
}

export interface GameConfig {
  mushCount: number; // Mush picked at launch. Unused with `preselection`, where the player count decides.
  // Null: everyone is seated at launch and Mush are picked then (tests, single player later).
  preselection: PreselectionRules | null;
  startAp: number;
  failureMultiplier: number; // Each failed try in a row at an action with a chance to fail multiplies its next chance by this, until a success (owner, 2026-11-05; the original's fail_coef 1.25). An action may set its own (scan, turrets, patrol shot, manual extinguish).
  startMp: number; // MP each player wakes up with. Capped by `movement.mpCap` like any other gain.
  apPerCycle: number; // AP gained at the start of each cycle, before modifiers. Unspent AP carries over.
  mpPerCycle: number; // MP gained at the start of each cycle, capped by `movement.mpCap`. Unspent MP carries over.
  // Hours per cycle on the server's UTC clock (#230). The rules never read it; the server clock and the record do.
  cycleHours: number;
  cyclesPerDay: number; // 24 / `cycleHours`: a day is always 24 hours from 00:00 GMT. Cycles in one day. The day ends with the last cycle; every living player then loses `dailyMoraleLoss` (modifiers.ts) morale.
  // Cycles change on the server's UTC clock (#24). With this on, `ready` is offered too and the cycle also ends once
  // every living player is ready: the dev server's manual End cycle, and later single player.
  manualCycles: boolean;
  // The ship has the cheat room (#170, cheatRoom.ts): in `rooms` and `equipment`, and stocked at launch. Dev ships only.
  cheatRoom: boolean;
  // An expedition resolves at takeoff instead of one step every `expedition.stepMs` (single player; owner, 2026-11-07, #356).
  instantExpeditions: boolean;

  // Roommates see where you stand and sit (spot.ts). Off: `walk` is refused and nobody's spot is sent. A setup knob (#231).
  sharedSpots: boolean;
  // The setup a ship launched with (#232), public; its name and author are looked up by id (#237). Null: no setup
  // (single player, tests). The rules never read it: the setup's knobs are already in the fields above.
  setupId: string | null;
  moralePerDay: number; // Morale lost by each living player at the end of a day, before modifiers (Mankind's Only Hope cuts it).
  maxAp: number; // AP never exceeds this.
  movement: MovementRules;
  maxHp: number;
  startHp: number;
  /** HP every living player heals at the start of each day, up to their max. */
  dailyHeal: number;
  maxMorale: number;
  startMorale: number;
  startRoom: RoomId;
  inventorySlots: number; // Private inventory slots per player, before modifiers.
  channelLimit: number; // Private channels a player may belong to, before modifiers.
  // How many cycles of room log a seat sees (#365): the current cycle plus the ones before it, whole cycles, so a
  // number of cycles, never hours. `tracker` is the window with the Tracker skill (`hunt`). Ship-wide lines and chat
  // have no window. The rules drop room lines older than the longer of the two (`pruneLog`).
  logWindow: { cycles: number; tracker: number };
  /**
   * Per-feature tuning. Actions group their numbers into `cost` (what the player pays) and `effect` (what happens),
   * so a cost in morale or MP can sit next to an effect without being confused with it. Conditions (rooms, odds,
   * cooldowns) stay beside them.
   */
  bond: {
    cost: { ap: number }; // Confirmed 2026-10-14.
  };
  share: {
    cost: { ap: number }; // Paid by the one who starts a DTT or STT (confirmed 2026-10-14).
    effect: { morale: number }; // What each of the two gets from a DTT or STT (confirmed 2026-10-14).
  };
  infection: {
    capacity: number; // Contamination a human reaches before converting to Mush, before modifiers (confirmed 2026-10-14).
    mushophageBonus: number; // Capacity the completed MUSHOPHAGE_BACTERIA research adds for every human (decided 2026-10-17).
  };
  spike: {
    cost: { ap: number }; // Confirmed 2026-10-15.
    cooldownCycles: number; // Cycles a Mush waits between their own spikes, on the global cycle counter (owner, 2026-11-03).
  };
  fungalCuisine: {
    cost: { ap: number }; // The Mush skill Fungal cuisine: 1 AP and 1 spore (owner, 2026-10-24).
  };
  consumeSpore: {
    cost: { ap: number }; // The Mush skill Phagocytosis: 0 AP, 1 spore (owner, 2026-11-04).
    effect: { hp: number; ap: number }; // HP healed and AP gained (owner, 2026-11-04).
  };
  tubeTransfer: {
    cost: { ap: number }; // Sending an item down the pneumatic tube: free (owner, 2026-11-04).
  };
  apprenticeship: {
    cost: { ap: number }; // The Apprentice skill: 1 AP (owner, 2026-11-05).
  };
  bodyTransfer: {
    cost: { ap: number }; // The Mush skill Transfer: free (owner, 2026-10-24).
  };
  resetSkills: {
    cost: { ap: number }; // The Mush skill Epigenetics: 2 AP (owner, 2026-11-13).
  };
  massMouldering: {
    cost: { ap: number }; // The Mush skill Mass Mouldering: 2 AP, 0 spores (owner, 2026-11-14).
  };
  spores: {
    cost: { ap: number }; // AP spent to extract a spore (confirmed 2026-10-13).
    effect: { spores: number }; // Spores one extraction gives (confirmed 2026-10-13).
    perDay: number; // Spores the whole Mush faction may extract per day, before modifiers (confirmed 2026-10-14).
    max: number; // Spores one Mush may hold; extraction is refused at it (owner, 2026-11-10, balance review decision 8).
    constipasporeExtraAp: number; // Extra AP added to extract_spore once CONSTIPASPORE_SERUM completes (owner, 2026-11-14).
    antisporeReduction: number; // Daily spore extraction cap reduction once ANTISPORE_GAZ completes (2026-11-14).
  };
  heal: {
    cost: {
      apOther: number; // AP a heal costs on someone else (confirmed 2026-10-15).
      apSelf: number; // AP a heal costs on yourself (confirmed 2026-10-15).
    };
    effect: {
      hp: number; // HP a heal restores before modifiers (confirmed 2026-10-15).
      medicBonusHp: number; // Extra HP a heal restores for a player with the medic skill (owner, 2026-10-15).
      ointmentBonusHp: number; // Extra HP heal and bandage restore once HEALING_OINTMANT completes (owner, 2026-11-14).
      nursePointsPerDay: number; // Care points the nurse skill (`first_aid`) grants at the start of each day and when picked (owner, 2026-10-15).
      mycologistSpores: number; // Contamination removed per heal/bandage by a human Mycologist (owner, 2026-11-14).
    };
    rooms: string[]; // Rooms where anyone can heal without a medikit (confirmed 2026-10-15: the sick bay).
    dirtyChance: number; // Chance of getting the dirty status after healing.
  };
  hide: { cost: { ap: number } }; // Hiding an item (owner, 2026-10-25, from the wiki: 1 AP).
  search: { cost: { ap: number } }; // Searching the room for hidden items (owner, 2026-10-25, from the wiki: 1 AP).
  /** The Drug Dispenser (owner, 2026-11-11): the cycles of the day it resets on (new list, unused), and what taking a drug costs. */
  drugDispenser: { cost: { ap: number }; resetCycles: number[] };
  checkSpores: { cost: { ap: number } }; // The MycoScan's spore check (owner, 2026-11-01).
  snoop: { cost: { ap: number }; dirtyChance: number; injuryChance: number; rooms: string[]; items: Record<string, number> }; // The Scrapper's Snoop: cost, its dirt and injury odds, the storage rooms it works in, the items it makes by weight (owner, 2026-11-01).
  bandage: {
    cost: { ap: number }; // AP using a bandage costs, on anyone (owner, 2026-11-07, #397).
    effect: { hp: number }; // HP a bandage restores before `healAmount` modifiers (owner, 2026-11-07).
  };
  vaccine: {
    cost: { ap: number }; // AP the anti-Mush serum costs to use (owner, 2026-10-25, from the wiki).
  };
  punch: {
    cost: { ap: number }; // Issue 29.
    effect: {
      damage: [number, number]; // Inclusive HP range a landing punch removes, rolled uniformly (owner, 2026-10-24, eMushpedia "Mains nues": 1 to 2).
      sturdyBonusDamage: number; // Extra punch damage from the sturdy skill (confirmed 2026-10-16).
    };
    crit: { chance: number; damage: [number, number] }; // A landing punch is critical with this chance and then rolls this range instead (owner, 2026-10-24, eMushpedia: 5 of 25 hit weight, 2 to 3; the wiki's broken-nose injury waits for #238).
    successChance: number; // Chance a punch lands, 0 to 1 (confirmed 2026-10-15: it misses 40% of the time).
    inactiveTargetSuccessChance: number; // The same on an inactive target (owner, 2026-10-31, eMush: 90%).
    dirtyChance: number; // Chance of getting the dirty status after punching (confirmed 2026-10-13).
  };
  pacifist: {
    aggressiveApSurcharge: number; // Extra AP for each aggressive action in a Pacifist's room, theirs too (owner, 2026-10-18).
  };
  bodyguard: {
    cost: { ap: number }; // AP to Protect a crewmate (owner, 2026-11-14).
    aggressiveApSurcharge: number; // Extra AP for each aggressive action targeting the VIP while both are alive in the same room, theirs too (owner, 2026-11-14).
  };
  antenna: {
    brokenApSurcharge: number; // Extra AP for contacting Sol, decoding a rebel base, contacting Xyloph and updating NERON while the Stellar antenna (Motor Room) is broken (owner, 2026-11-08).
  };
  gravitySimulator: {
    brokenMpPenalty: number; // MP lost per cycle change and per AP-to-MP conversion for everyone while a Gravity Simulator is broken (owner, 2026-11-08). Never takes either below 0.
  };
  escape: {
    meleeSuccessFactor: number; // Multiplies the success chance of a punch or melee weapon attack aimed at an Escape holder (owner, 2026-11-06: 0.75).
  };
  botany: {
    // Owner, 2026-10-22 (docs/scratchpad/botany-plan.md, Pass 1).
    water: { cost: { ap: number } }; // Water one thirsty or dried plant.
    treat: { cost: { ap: number }, injuryChance: number }; // Treat one plant (clears sickness).
    sow: { cost: { ap: number } }; // Plant a carried fruit in an empty hydropot.
    dirtyChance: number; // Chance of getting dirty after watering, treating or sowing (the original's 15%).
    growCycles: Record<string, number>; // Cycles a young plant of each species needs before it becomes adult.
    fruits: FruitsConfig; // Seeded alien fruit rules (fruits.ts, #437).
    sickChancePerCycle: number; // PLACEHOLDER: each healthy plant's chance of falling sick at each cycle change.
    oxygenPerPlant: number; // Oxygen each producing plant gives at day start.
    gardenRoom: RoomId; // Garden points pay for an action only on a plant here.
    pointsPerDay: number; // Garden points the Botanist gains at each day start.
    capPoints: number; // Garden points held at most.
  };
  cook: {
    cost: { ap: number }; // AP spent to cook an uncooked ration (confirmed 2026-10-16).
    rooms: RoomId[]; // Rooms where food can be cooked (confirmed 2026-10-16).
    dirtyChance: number; // Chance of getting the dirty status after cooking.
    injuryChance: number; // Chance of getting the injured status after cooking (owner, 2026-10-16: 25%).
    capPoints: number; // Most Cook points (`resources.cook`) a player can hold (owner, 2026-11-14: 8).
    pointsPerDay: number; // Cook points the `cook` (Chef) skill grants at the start of each day (owner, 2026-11-14: 4).
    pointsOnPick: number; // Cook points it grants when picked (owner, 2026-11-14: 4).
  };
  expressCook: {
    cost: { ap: number }; // AP spent to express cook a ration with a reachable microwave (owner, 2026-10-19: 0).
    charges: { start: number; max: number; perDay: number }; // Microwave charges: one per express cook, regained at each day start (owner, 2026-10-19).
    dirtyChance: number; // Chance of getting the dirty status after express cooking.
  };
  readBook: {
    cost: { ap: number }; // AP spent to read a skill book (owner, 2026-10-21: 2).
  };
  build: {
    cost: { ap: number }; // AP spent to build from a blueprint (decided 2026-10-16: 3, the original game's value).
    dirtyChance: number; // Chance of getting the dirty status after building.
    injuryChance: number; // Chance of getting injured after building.
  };
  jettison: {
    cost: { ap: number }; // AP spent to jettison a carried corpse (decided 2026-10-16: free).
    rooms: RoomId[]; // Rooms where a corpse can be jettisoned: the four bays (decided 2026-10-16).
    dirtyChance: number; // Chance of getting the dirty status after jettisoning.
    injuryChance: number; // Chance of getting injured after jettisoning.
  };
  install: {
    cost: { ap: number }; // AP spent to install a carried camera in the room (approved 2026-10-17: 1).
    dirtyChance: number; // Chance of getting the dirty status after installing.
    injuryChance: number;
  };
  uninstall: {
    cost: { ap: number }; // AP spent to uninstall the room's camera back into an item (placeholder 2026-10-17: 1, like install).
    dirtyChance: number; // Chance of getting the dirty status after uninstalling.
    injuryChance: number;
  };
  consume: { dirtyChance: number }; // Chance of getting the dirty status after consuming an item.
  oxygenCapsule: { cost: { ap: number }; injuryChance: number }; // Taking an oxygen capsule from a tank and putting it back (owner, 2026-10-24: as fuel).
  fuel: { cost: { ap: number }; dirtyChance: number, injuryChance: number }; // Taking a capsule from a tank, loading it into the chamber, unloading it back.
  dispense: {
    dirtyChance: number; // Chance of getting the dirty status after dispensing an item.
    coffeeCycles: number[]; // Base coffee regeneration cycles of each day (owner, 2026-11-02; the original's C1).
  };
  computer: {
    capPoints: number; // Most Computer points (`resources.comp`) a player can hold (owner, 2026-10-16; the original skill's IncrMaxPA(COMP, 4)).
    pointsPerDay: number; // Computer points the `computer` skill grants at the start of each day and when picked (owner, 2026-10-16; the original +2).
  };
  gunman: {
    capPoints: number; // Most Shoot points (`resources.shoot`) a player can hold (owner, 2026-10-25; the original skill's IncrMaxPA(SHOOT, 4)).
    pointsPerDay: number; // Shoot points the `gunman` skill grants at the start of each day and when picked (owner, 2026-10-25; the original +2). One makes a turret shot free.
  };
  astrophysicist: {
    scanApDiscount: number; // AP the `astrophysician` skill takes off the Scan for planets action (owner, 2026-10-27; the original 1).
    extraSectors: number; // Sectors the skill reveals on top of one per remote analysis (owner, 2026-10-27; the original 1).
  };
  paranoid: {
    cameras: number; // Camera items the `paranoid` skill gives when picked (owner, 2026-10-27; the original gives 2).
  };
  observant: {
    searchApDiscount: number; // AP the `observant` skill takes off Search, never below 0 (owner, 2026-11-14; the original 1).
    revealChance: number; // Each living Observant in the room (not the actor) rolls this to reveal a covert action (owner, 2026-11-14; the original 25%).
  };
  drones: {
    failureMultiplier: number; // Each failed try in a row at a drone task multiplies its next chance by this; a success resets it (#411, owner, 2026-11-11; eMushpedia's 1.25).
    maxChance: number; // A drone's chance never goes above this (eMushpedia: 99%).
    // Owner, 2026-11-12 (#412): a Robotics Expert's Upgrade costs `cost.ap` and `scraps` metal scraps, with the original's dirt and injury chances.
    upgrade: { cost: { ap: number }; scraps: number; dirtyChance: number; injuryChance: number };
    turboChance: number; // A Turbo drone's chance of a second action each cycle change, never a third (eMushpedia: 80%).
  };
  greenThumb: {
    pots: number; // Empty hydropots the `green_thumb` skill gives when picked (owner, 2026-11-01; the original's 2).
  };
  gunner: {
    accuracyFactor: number; // The `gunner` skill multiplies the chance to hit from a turret by this (owner, 2026-10-24; the data's MulActionOdd 2.0).
    damageFactor: number; // ...and the damage of a hit (owner, 2026-10-24).
  };
  persistent: {
    failureMultiplier: number; // The `persistent` skill's per-miss multiplier on a failure streak (turret, astro scan), replacing the usual one when higher (owner, 2026-10-25).
  };
  spaceTactics: {
    chance: number; // Chance, while a `space_tactics` holder is alive, that a hunter wave comes smaller (owner, 2026-10-25; the original's 50%).
    shrink: number; // Share of the wave's hunters that does not come, rounded down (owner, 2026-10-25; the original's 33%).
  };
  polymath: {
    channels: number; // Extra private channels the `polymath` skill allows (owner, 2026-10-25; the original +2).
    computerPointsPerDay: number; // Computer points it grants each day and when picked (owner, 2026-10-25; the original +1).
    computerCapBonus: number; // Extra room for Computer points (owner, 2026-10-25; the original IncrMaxPA(COMP, 2)).
  };
  designer: {
    capPoints: number; // Most Designer points (`resources.core`) a player can hold (owner, 2026-10-24; the original skill's IncrMaxPA(CORE, 4)).
    pointsPerDay: number; // Designer points the `designer` skill grants at the start of each day and when picked (owner, 2026-10-24; the original +2).
  };
  engineer: {
    capPoints: number; // Most Engineer points (`resources.eng`) a player can hold (owner, 2026-11-09).
    pointsPerDay: number; // Engineer points the `engineer` skill grants at the start of each day.
    pointsOnPick: number; // Engineer points it grants when picked.
  };
  maintenanceAgent: {
    pointsPerDay: { eng: number; garden: number; cook: number }; // Points the `maintenance_agent` skill grants at the start of each day (owner, 2026-11-14).
    pointsOnPick: { eng: number; garden: number; cook: number }; // Points it grants when picked (owner, 2026-11-14).
  };
  sprinter: {
    extraMpPerConversion: number; // Extra MP the `sprint` skill gets from each AP-to-MP conversion (owner, 2026-10-24; eMushpedia).
  };
  anathema: {
    cost: { ap: number }; // AP the `juge` (Persecutor) skill's Anathema costs (owner, 2026-10-24; eMushpedia).
    successFactor: number; // An Outcast's chance on every action that rolls one is multiplied by this (owner, 2026-10-24: x0.8).
  };
  coup: {
    cost: { ap: number }; // AP the `politician` skill's Coup costs (owner, 2026-11-12).
    dirtyChance: number; // Chance the actor gets dirty (owner, 2026-11-12: 50%).
  };
  speech: {
    fiery: { ap: number; morale: number }; // The `leadership` skill's Fiery speech: AP cost, morale given to each other living person in the room (owner, 2026-10-24; eMushpedia). No daily limit.
    boring: { ap: number; mp: number }; // The `motivator` skill's Boring speech: AP cost, MP given to each other living person in the room, once a day (owner, 2026-10-24; eMushpedia).
  };
  premonition: { moraleCost: number }; // The `premonition` skill's action: the morale it costs (owner, 2026-11-13).
  chitchat: { cost: { ap: number }; morale: number }; // Confiding in a `confident` in your room: AP cost and the morale you gain; once a day (owner, 2026-10-24).
  comfort: { cost: { ap: number }; morale: number }; // The Shrink's Comfort: AP cost and the morale the roommate gains; no daily limit (owner, 2026-10-26).
  shrink: { lyingMorale: number }; // Morale a cycle for lying in a bed with a living Shrink (not yourself) in the room; doesn't stack (owner, 2026-10-26).
  interrogate: { cost: { ap: number }; damage: number; dirtyChance: number; injuryChance: number }; // The `torturer` skill's Interrogate: AP cost, guaranteed damage, dirt and injury odds; once a day (owner, 2026-10-24).
  research: {
    cost: { ap: number }; // AP spent to work on a research (decided 2026-10-16).
    // The relay formula (relay.ts, owner 2026-10-26), the one PILGRED uses; `mod` is the difficulty, 10 for every research for now.
    progress: { rate: number; mod: number; skillBoost: number; relayPenalty: number };
    dirtyChance: number; // Chance of getting the dirty status after working on a research (owner, 2026-10-20).
    // Assays (assay.ts; owner, 2026-10-31, first guesses): where they happen, and the chance each uncontaminated pending sample spoils anyway.
    assayMarks: number[];
    spoilChance: number;
    contaminate: { cost: { ap: number } }; // Saboteur's Contaminate (owner, 2026-10-31: Sabotage's 1 AP).
    guaranaExtraAp: number; // Extra AP coffee gives humans once GUARANA_CAPUCCINO completes (1).
  };
  project: {
    offerCount: number; // Projects offered at NERON's core at a time (owner, 2026-11-14: 3).
    cost: { ap: number }; // AP spent to work on a NERON project (decided 2026-10-18).
    progress: { rate: number; mod: number; skillBoost: number; relayPenalty: number }; // As research's (owner, 2026-10-26); skill tags boost gain.
    // Noise Reducer (owner, 2026-11-01; eMushpedia *Isolateur phonique*): every player's AP cap +maxAp, added after Lethargy doubles it.
    noiseReducer: { maxAp: number };
    bricBroc: { preventChance: number };
    // Owner, 2026-11-04: completing it puts these item types on the floor of `room` (one item per list entry).
    foodRetailer: { room: RoomId; items: readonly string[] };
    // Quantum Sensors (owner, 2026-11-01; eMushpedia *Détecteur à ondes de probabilité*): each planet analysis reveals +extraSectors sectors.
    quantumSensors: { extraSectors: number };
    // CPU Overclocking (owner, 2026-11-01; eMushpedia *Accélération du processeur*): Scan for planets costs -scanApDiscount AP.
    chipsetAcceleration: { scanApDiscount: number };
    // Takeoff thruster (owner, 2026-11-14): patrol ship, Pasiphae, and Icarus takeoff cost -takeoffApDiscount AP.
    patrolShipLauncher: { takeoffApDiscount: number };
    // Teslatron reservoir (PATROLSHIP_EXTRA_AMMO; owner, 2026-11-14): patrol ships hold +extraCharges max charges and gain +extraCharges on completion (capped at new max; Pasiphae unaffected).
    patrolShipExtraAmmo: { extraCharges: number };
    // Blaster gun (PATROLSHIP_BLASTER_GUN; owner, 2026-11-14): patrol ship hits deal +extraDamage (stacks with Cygni).
    patrolShipBlasterGun: { extraDamage: number };
    // Inverted pulsator (TURRET_EXTRA_FIRERATE; owner, 2026-11-14): turrets recharge rechargeMultiplier times as fast each cycle.
    turretExtraFirerate: { rechargeMultiplier: number };
    // Armoured corridors (owner, 2026-11-14): every attack on the Daedalus (damageShip) is reduced by damageReduction before the shield, floor 0.
    armourCorridor: { damageReduction: number };
    // Fission Coffee Roaster (owner, 2026-11-02; eMushpedia *Torréfacteur à fission*): coffee machine regenerates at these cycles of each day (C1, C5; every cycle with PILGRED).
    fissionCoffeeRoaster: { cycles: number[] };
    // Dynarcade (CALL_OF_DIRTY; owner, 2026-11-14): spawns the Dynarcade in `room`, where anyone can play for `cost.ap` AP (`successChance` x`failureMultiplier` per miss for +`morale`, `injuryChance` of 2 HP injury).
    dynarcade: { room: RoomId; cost: { ap: number }; successChance: number; failureMultiplier: number; morale: number; injuryChance: number };
    // Extra hydropots (EXTRA_HYDROPONPOTS; owner, 2026-11-14): completing it puts `count` empty hydropots on the floor of `room`.
    extraHydropots: { room: RoomId; count: number };
    neronParticipation: { percent: number };
    // Automatic sprinklers (AUTO_WATERING; owner, 2026-11-14): each burning room has `extinguishChance` per cycle to go out before acting, announced in global chat without the room.
    autoWatering: { extinguishChance: number };
  };
  pilgred: {
    cost: { ap: number }; // AP spent to take part in repairing PILGRED (owner, 2026-10-21; the original's REPAIR_PILGRED, 2).
    dirtyChance: number; // Chance of getting the dirty status after a repair (owner, 2026-10-21; the original's 25).
    injuryChance: number; // Chance of getting injured after repairing PILGRED.
    // The original's slow formula (Solver.calcPilgredProgres, owner 2026-10-21): base = floor(rate * mod / 10), + skillBoost per
    // Engineer/Physicist skill, - relayPenalty per repair in a row by the same player.
    progress: { rate: number; mod: number; skillBoost: number; relayPenalty: number };
    capPoints: number; // Most PILGRED points (`resources.pilgred`) a player can hold (owner, 2026-10-21; the Physicist's IncrMaxPA(PILGRED, 2)).
    pointsPerDay: number; // PILGRED points the `physicist` skill grants at the start of each day (owner, 2026-10-21; the original +1).
    edenCost: { ap: number }; // AP shown on the Command terminal's Travel to Eden button; Eden is not reachable yet (owner, 2026-10-29: 2, as for Sol).
    returnCost: { ap: number }; // AP spent to return to Sol at the Command terminal (owner, 2026-10-21; the original's SET_PILGRED_TO_SOL, 2).
    // Coffee regeneration cycles of each day when PILGRED is repaired (owner, 2026-11-02; the original's C1, C3, C5, C7).
    coffeeCycles: number[];
  };
  comms: {
    sol: {
      cost: { ap: number }; // AP spent to try to establish the link with Sol (owner, 2026-10-19).
      startChance: number; // The ship's chance (percent) at the start, and its floor (owner, 2026-10-19 and 2026-10-21).
      chancePerFail: number; // Percent added to the ship's chance by each failed attempt (owner, 2026-10-19).
      radioExpertFactor: number; // A Radio Expert's own attempts multiply the chance by this (the skill's description, 2).
      radioExpertRoomFactor: number; // Anyone else's attempts in a room with a Radio Expert (the skill's description, 1.5).
    };
    rebel: {
      cost: { ap: number }; // AP spent to decode a rebel signal; a Computer point pays instead (owner, 2026-10-21).
      gainMax: number; // A decode gains the average of two draws in [1, gainMax] percent (the original, 40).
      windowMin: number; // A rebel call stays open between windowMin and windowMax cycles, rolled per base (owner, 2026-10-21).
      windowMax: number;
      rebelBonus: number; // The Rebel skill adds this many times the base gain (owner, 2026-10-21: +100%).
      kivancBonus: number; // Having contacted Kivanç Terzi adds this many times the base gain (owner, 2026-10-21: +100%).
      kaladaanMorale: number; // Morale every living player gains when Kaladaan is reached (the original, 6).
      cygniMorale: number; // Morale every living player gains when Cygni is reached (the original, 3).
      cygniPatrolDamage: number; // Extra damage on every patrol ship hit once Cygni is reached (the original, 1; owner, 2026-11-07).
      siriusRationAp: number; // Extra AP from a ration once Sirius is reached (the original, 1).
    };
    xyloph: {
      cost: { ap: number }; // AP spent to contact Xyloph (owner, 2026-10-21).
      qualityLoss: number; // Wireless infidelity takes this off the Sol chance (the original, 20).
      neronBoostPercent: number; // NERON's lost database moves the NERON update forward this much (the original, 25).
      lostAnalysisPerMush: number; // Finola's lost analysis marks floor(starting Mush × this) non-Mush characters negative (owner, 2026-11-13: 2.5; #394).
      schoolBooks: number; // Skill books printed by the school manuals, each for a random skill (the original, 2).
      workshopBlueprints: number; // Random blueprints printed by the workshop manuals (the original, 3).
    };
    neron: {
      cost: { ap: number }; // AP spent to work on NERON's update (owner, 2026-10-21).
      progressPercent: number; // Percent an update advances per action (owner, 2026-10-21).
    };
  };
  astro: {
    scan: {
      cost: { ap: number }; // AP spent to scan for a planet at the Astro terminal (owner, 2026-10-19; the original's 3).
      chance: number; // Base success chance of a scan, 0 to 1 (owner, 2026-11-08: 80%; the original's was 50%).
      brokenScannerChance: number; // The base chance while the Planet scanner in the Motor Room is broken (owner, 2026-11-08: 50%).
      failureMultiplier: number; // Each failed scan in a row multiplies the player's next chance by this (owner, 2026-10-19; the original's fail_coef 1.25).
    };
    analyze: { cost: { ap: number }; orbitCost: { ap: number }; orbitExtraSectors: number }; // AP spent to reveal one sector of one of your planets (owner, 2026-10-19; the original's remote analysis, 2). In orbit of that planet (deep analysis, owner 2026-10-27, the wiki) it costs `orbitCost` and reveals `orbitExtraSectors` more.
    maxPlanets: number; // Most planets one player can hold (owner, 2026-10-19).
    // Where a planet lies (owner, 2026-10-22, eMush's PlanetService): one of 4 directions at `min` to `max` fuel, a position no other
    // planet on the ship holds. The distance is two rolls over `min`..`nearMax` averaged (rounded down); `nearMax + 1` and up are
    // used one at a time, only once every nearer position is taken.
    distance: { min: number; nearMax: number; max: number };
    // Sector counts by day (owner, 2026-10-22, the wiki's eMush hard and very hard modes): the last entry whose `fromDay` has come.
    // Even sizes only, uniform from `min` to `max`.
    sizeByDay: { fromDay: number; min: number; max: number }[];
  };
  // Steering at the Command terminal (owner, 2026-10-22, the wiki's Terminal de Commandement). Travel goes 1 to
  // `astro.distance.max` fuel the way the ship faces; short of fuel, the AP is spent and the ship stays put.
  navigation: {
    turn: { cost: { ap: number } }; // AP spent to turn the ship a quarter left or right (the wiki's 1).
    travel: { cost: { ap: number } }; // AP spent to travel (the wiki's 1); fuel spent is the distance.
    leaveOrbit: { cost: { ap: number }; fuel: number }; // AP (the wiki's 1) and fuel (Claude's default, 1) to leave orbit.
    startHeading: PlanetDirection; // The heading at the start (Claude's default).
  };
  accommodate: { cost: { ap: number }; offerMs: number }; // AP spent to offer to push someone's wheelchair, and how long (server ms) the offer waits to be accepted (owner, 2026-10-19: free, 5 minutes).
  // Channel plans (docs/plans/on-call.md, owner 2026-10-30). A plan posted on day N expires at the end of day
  // N + `expiryDays` if still open; at most `slotsPerPlan` slots; each channel keeps its `finishedKept` latest finished plans.
  plans: { expiryDays: number; slotsPerPlan: number; finishedKept: number };
  guard: { cost: { ap: number } }; // AP spent to guard (owner, 2026-11-06).
  lieDown: { cost: { ap: number } }; // AP spent to lie down in a bed (confirmed 2026-10-17).
  report: { cost: { ap: number } }; // AP spent to report a fire or a breakdown (owner, 2026-11-14, #444: free).
  // Skill Lethargy (owner, 2026-11-01): from the `cyclesLying`th cycle change spent lying down on, each one gives
  // `bonusAp` more AP; the AP cap is multiplied by `maxApMultiplier`.
  lethargy: { cyclesLying: number; bonusAp: number; maxApMultiplier: number };
  // Skill Opportunist (owner, 2026-11-14): +ap the first time you gain each title, capped at maxAp.
  opportunist: { ap: number };
  shower: {
    cost: {
      ap: number; // AP spent to shower, before the soap discount (confirmed 2026-10-14).
      soapDiscountAp: number; // AP off a shower when soap is in your inventory (confirmed 2026-10-14).
      waterResistantAp: number; // AP a shower costs at most with the Water Resistant Mush skill (eMushpedia, 2026-10-27).
    };
    effect: { mushDamage: number }; // HP a Mush loses by showering (confirmed 2026-10-14).
    injuryChance: number; // Chance of getting injured after showering.
  };
  transfer: {
    injuryChance: number; // Chance of getting injured when taking or dropping an item.
  };
  ship: {
    oxygen: { start: number; max: number; perCycle: number }; // Oxygen the ship burns each cycle; at 0 one random living crew member dies per cycle (owner, 2026-10-19).
    fuel: { start: number; max: number }; // The tanks' stock; only capsules carried to the combustion chamber are burned (owner, 2026-10-23).
    combustion: { start: number; max: number }; // The combustion chamber (owner, 2026-10-23, the wiki): starts empty, holds 9. Travel and leaving orbit burn from it.
    hull: { start: number; max: number }; // Only hunters damage it, through `damageShip`; at 0 the ship explodes (owner, 2026-10-24).
    // Takes `absorbPercent` of each hit (rounded) out of its own points, `projectAbsorbPercent` once the Plasma Shield project
    // is done; at 0, or while the BIOS has it off, the hull takes it all. Regains `regen` a cycle while on (owner, 2026-10-24).
    plasmaShield: { start: number; max: number; absorbPercent: number; projectAbsorbPercent: number; regen: number };
  };
  // Hunters (owner, 2026-10-24, #208; eMush's numbers). A server-only pool starts at `points.start` when Mush are chosen and gains
  // day + `points.perCycle` each cycle change, + `hardBonus` from `hardFromDay`, + `veryHardBonus` instead from `veryHardFromDay`.
  // Each cycle change after the first `safeCycles`, a `waveChance` roll spends it on a wave: hunters drawn one at a time by
  // `types[*].weight` among the kinds it can still afford, the rest carried over (owner, 2026-11-12, #388).
  hunters: {
    points: { start: number; perCycle: number; hardFromDay: number; hardBonus: number; veryHardFromDay: number; veryHardBonus: number };
    waveChance: number;
    safeCycles: number;
    missBonus: number; // Added to the hunter's chance after each miss.
    followShare: number; // Share of the hunters whose kind `follows: "share"` that follow a jump (travel or leaving orbit), rounded up.
    patrolTargetChance: number; // Chance a hunter picking a target aims at a patrol ship in flight (one at random), when any is out.
    meridonScramblerChance: number; // Chance a hunter picking a target aims at a random shooting teammate when FUNGUS_SCRAMBLER is complete (owner, 2026-11-14).
    // What a destroyed hunter leaves in space: weights by piece count (index = count), and by item type for each piece.
    debris: { count: number[]; types: Record<string, number> };
    types: Record<HunterType, HunterTypeConfig>;
  };
  // Turrets (owner, 2026-10-24, the wiki's Tourelle): 1 AP, a charge per shot, 30% to hit, x1.25 per miss in a row, reset by a hit.
  turrets: { cost: { ap: number }; chance: number; failureMultiplier: number; damage: [number, number]; charges: number; rechargePerCycle: number };
  // Patrol ships and the Pasiphae (owner, 2026-10-24, docs/plans/patrol.md): takeoff and landing cost 2 AP each; armor
  // 10 (Pasiphae 12); a manoeuvre is clean at `cleanChance` (a Pilot always), otherwise rough: hull and pilot hp
  // ranges, uniform, and a fixed armor loss. Phase 3 (owner, 2026-10-28): a patrol ship (not the Pasiphae) holds
  // `charges` shots, regaining `rechargePerCycle` a cycle only while docked; a shot is like a turret's, with its own
  // numbers, and a Pilot multiplies its chance by `pilotAccuracyFactor`.
  patrol: {
    takeoff: { cost: { ap: number }, injuryChance: number };
    land: { cost: { ap: number }, injuryChance: number };
    armor: { patrol: number; pasiphae: number };
    charges: number;
    rechargePerCycle: number;
    shot: { cost: { ap: number }; chance: number; failureMultiplier: number; damage: [number, number]; pilotAccuracyFactor: number };
    cleanChance: number;
    rough: { hull: [number, number]; armor: number; hp: [number, number] };
    // Collect scrap: pieces per try as weights by count (index = count); while hunters remain, the ship's armor loss and
    // the pilot's hp loss (none at `noneChance`, else `range`).
    collect: { cost: { ap: number }; pieces: { patrol: number[]; pasiphae: number[] }; armor: [number, number]; hp: { noneChance: number; range: [number, number] } };
    // Renovate a docked, damaged ship: `chance` to bring it back to full armor, an Engineer's odds times `engineerFactor`.
    renovate: { cost: { ap: number }; chance: number; dirtyChance: number; injuryChance: number; engineerFactor: number };
  };
  // The space capsule: opening it turns it into one of `contents`, each equally likely.
  spaceCapsule: { cost: { ap: number }; dirtyChance: number; injuryChance: number; contents: string[] };
  // Hull repair (owner, 2026-10-24, the wiki's Armure et Bouclier): 1 AP, 25%, +5 hull, a metal scrap used up on a success.
  hullRepair: { cost: { ap: number }; chance: number; injuryChance: number; amount: number };
  // Incident points (owner, 2026-10-25, #184; eMushpedia "Embûches"): incidents.ts. Each cycle change adds
  // `budget.base[min(day, base.length) - 1]`, plus `tier1.bonus + (day - tier1.fromDay)` from `tier1.fromDay`, plus
  // `tier2.bonus + tier1's addition + (day - tier2.fromDay)` from `tier2.fromDay`. Incidents happen with chance
  // pool / `rollPoints`. `catalog` prices and weights the built incidents.
  incidents: {
    budget: { base: number[]; tier1: { fromDay: number; bonus: number }; tier2: { fromDay: number; bonus: number } };
    rollPoints: number;
    catalog: Record<IncidentId, { cost: number; weight: number }>;
    tremor: { damage: [number, number] };
    panicAttack: { morale: number };
    metalPlate: { damage: [number, number] };
    electricalOverload: { damage: number };
  };
  // Fire (owner, 2026-10-25, the original's FIRE_* numbers): fire.ts. Each burning room spreads (`spreadChance`, at most
  // `maxSpreads` a cycle) or does damage: each breakable piece of equipment breaks with `breakChance`, the hull takes
  // `hullDamage` with `hullChance`, and everyone present loses `damage` HP.
  fire: { spreadChance: number; maxSpreads: number; breakChance: number; hullChance: number; hullDamage: [number, number]; damage: number };
  // Extinguish (owner, 2026-10-25, eMushpedia "Extincteur"): 1 AP, 50%, with an extinguisher you can reach.
  // Firefighter (owner, 2026-11-01): the manual try's odds and its per-miss multiplier; `firefighterInjuryChance` is the chance of a random injury on any try.
  ignite: { cost: { ap: number } };
  // Owner, 2026-11-07: a Mush breaks equipment or an item (actions/sabotage.ts), at the target's repair chance or `defaultChance` for an item without one.
  sabotage: { cost: { ap: number }; defaultChance: number; sapperFactor: number };
  greenJelly: { cost: { ap: number }; maxCycles: number };
  // Owner, 2026-11-07: an Engineer reinforces equipment or an item (actions/reinforce.ts) with one scrap, `gain` by scrap type, up to `max`.
  reinforce: { cost: { ap: number }; chance: number; max: number; fortifiedAt: number; gain: Record<string, number> };
  extinguish: { cost: { ap: number }; chance: number; manual: { chance: number; failureMultiplier: number }; firefighterInjuryChance: number };
  // Breakage and Repair (owner, 2026-10-25): breakage.ts. `chance` is each breakable equipment type's base repair chance
  // (eMushpedia's `réparer=`); a type without one never breaks. A wrench multiplies it by `wrenchFactor`, the Technician
  // skill (`engineer`) by `engineerFactor`. A broken oxygen tank leaks `oxygenLeak` oxygen at each cycle change.
  repair: { cost: { ap: number }; chance: Record<string, number>; wrenchFactor: number; engineerFactor: number; oxygenLeak: number };
  // Owner, 2026-10-28: carrying the oscilloscope (eMush's Wavoscope) multiplies the odds of a hull repair and a patrol-ship renovation.
  oscilloscope: { repairFactor: number };
  hunger: {
    satietyPerCycle: number; // Satiety a human loses each cycle, before modifiers (confirmed 2026-10-14).
    fullBellyAt: number; // Satiety at which a human has the full belly status and can't eat (confirmed 2026-10-14).
    hungryAfterCycles: number; // Cycles after satiety reaches 0 before the hungry status starts (confirmed 2026-10-14).
    hpPerCycle: number; // HP a hungry human loses each cycle (confirmed 2026-10-14).
  };
  dismantle: {
    cost: { ap: number }; // AP spent to dismantle an item (confirmed 2026-10-13).
    successChance: number; // Chance of successfully dismantling an item, unless its type sets `dismantle.chance` (confirmed 2026-10-13).
    dirtyChance: number; // Chance of getting the dirty status after dismantling an item (confirmed 2026-10-13).
    injuryChance: number; // Chance of getting injured after dismantling an item.
  };
  // Expeditions, phases 1 and 2 (owner, 2026-10-31 and 2026-11-07, docs/plans/expedition.md): expeditions.ts and actions/icarus_takeoff.ts.
  expedition: {
    cost: { ap: number }; // AP the launcher pays (the original's ICARUS_TAKEOFF, 4); the rest of the crew pays nothing.
    room: RoomId; // Where the Icarus docks: launchers stand here, the crew is everyone living here, and the Icarus unloads here.
    craft: RoomId; // The Icarus itself while away: a door-less room off the map, like a patrol ship's (phase 2).
    stepMs: number; // Server time between steps: the landing, then each sector (owner, 2026-11-07: 10 real minutes in every game).
    dirtyChance: number; // Chance each living member comes back dirty (owner, 2026-11-07: 10%, a placeholder).
    maxCrew: number; // Most people aboard; the launcher always goes, the others are picked at random.
    largerBayCrew: number; // `maxCrew` once the Icarus hold extension (ICARUS_LARGER_BAY) is done (owner, 2026-11-09, #359).
    // A pilot's solo landing in a patrol ship (owner, 2026-11-09, #359): AP to land from flight, and the Icarus's sector
    // count (Sprinters included) is divided by `sectorDivisor`, rounded down.
    patrol: { cost: { ap: number }; sectorDivisor: number };
    sectors: number; // Most sectors explored after the landing, each one unexplored, drawn by its tag's `explo` weight.
    deadKeepItems: boolean; // Whether a member who dies brings their items back with the body (owner, 2026-10-31; the original: false).
    fatigue: number; // HP every living member loses.
    accident: [min: number, max: number]; // HP one random living member loses, uniform.
    catastrophe: [min: number, max: number]; // HP every living member loses, rolled for each.
    survivalReduction: number; // Taken off each damage a member with the Survival skill takes.
    botanistBonus: number; // Extra fruit per harvest with a living Botanist in the crew.
    // Item types found: alien fruits (picked uniformly by Harvest) and steaks (placeholders: uncooked rations), a starmap fragment, and the
    // artifacts an Artifact event or a fight's loot picks among, uniformly.
    loot: { harvest: string[]; provision: string; starmap: string; artifacts: string[] };
    survivalProvision: number; // Extra steaks per Provision for each living Survival holder in the crew.
    mushTrapChance: number; // Chance each human member gains a spore in a Mush trap.
    creatures: Record<string, { strength: number[]; loot: CreatureLoot }>; // Fight opponents: a strength drawn uniformly from the list.
    // Event tables by sector tag, plus LANDING (drawn first). A tag with no table explores with nothing happening. A
    // living Pilot in the crew or the Antigrav propeller makes the landing Nothing.
    events: Record<string, ExpeditionEventRule[]>;
    // Gear (owner, 2026-11-08, #357), by item type. One working copy carried by a member who explores counts; copies
    // don't stack; nothing is used up.
    gear: {
      spacesuit: string; // Needed to explore a planet with no Oxygen sector; never taken by Lost item.
      compass: string; // Cancels Again; its bearer can't get lost (Lost is cancelled when everyone has one).
      rope: { item: string; tags: string[] }; // Its bearer is spared an Accident in these sectors.
      drill: { item: string; fuelFactor: number }; // Multiplies the fuel from fuel events.
      finders: { item: string; tags: string[]; factor: number }[]; // Sectors with these tags are `factor` times as likely to be picked.
      babel: { item: string; tag: string; artifactFactor: number }; // Artifact is `artifactFactor` times as likely in this sector.
      whiteFlag: { item: string; tag: string }; // Cancels Fight in this sector.
    };
    // Skills (owner, 2026-11-08, #358). Diplomat and Polymath cancel Fight in `gear.whiteFlag.tag`, as the white flag.
    shooterBonus: number; // Strength each Shooter carrying a working gun adds, once each.
    sprinterSectors: number; // Extra sectors per Sprinter who explores, counted at takeoff.
    centauri: { item: string; bonus: number }; // With the Centauri rebel base contacted, each working copy adds `bonus` strength.
    uTurn: { cost: { ap: number } }; // The U-turn skill's action: end the expedition at once.
  };
  // Weapons (owner, 2026-10-22, from the English wiki). Using one is the `attack` action.
  weapons: {
    cost: { ap: number }; // AP spent per use, any weapon (the original's SHOOT and ATTACK: 1).
    types: Record<string, WeaponStats>; // By item type.
  };
  creative: {
    refundOdds: number; // Chance that the Creative skill refunds 1 AP after a failed action that cost AP (confirmed 2026-10-15).
  };
  anticPerfume: {
    immuneCycles: number; // Cycles of infection immunity the antic_perfume skill grants after each shower (confirmed 2026-10-16); a new shower resets it, no stacking.
  };
  strongSkin: {
    resistOdds: number; // Chance a human Hygienist resists a Mush contamination or physical disease (owner, 2026-11-14).
  };
  inactivity: {
    inactiveAfterHours: number; // Real hours without connecting (and a full AP gauge) before a player goes inactive at a cycle change (owner, 2026-10-31).
    superAfterHours: number; // Real hours since they last connected before an inactive player is super inactive (owner, 2026-10-31).
  };
  logistics: {
    ap: number; // AP the logistics skill gives a random roommate each cycle (confirmed 2026-10-16).
  };
  caffeinomaniac: {
    ap: number; // Extra AP the caffeinomaniac skill gives on consuming a coffee, capped at maxAp (confirmed 2026-10-16).
  };
  frugivore: {
    bananaAp: number; // Extra AP the frugivore skill gives a human on eating a banana, capped at maxAp (owner, 2026-11-14).
    alienFruitAp: number; // Extra AP the frugivore skill gives a human on eating an alien fruit, capped at maxAp (owner, 2026-11-14).
  };
  action: {
    durationMs: number; // Server time every timed action takes (owner: 2 seconds on 2026-10-17, 1.5 seconds since 2026-10-24).
    queueCap: number; // Actions that may wait behind the one under way (owner, 2026-10-17: 3).
    // When a timed action takes effect (owner, 2026-10-17: "end"). "end": when its bar runs out, cost checked again
    // and paid then. "start": at once, and the bar is a cooldown before the next one.
    resolveAt: "end" | "start";
  };
  heavy: {
    mpPenalty: number; // MP added to each move while carrying a heavy item, however many (confirmed 2026-10-16).
  };
  startSkills: string[]; // Skills every player starts with (none since 2026-10-15; players pick their own).
  characterModifiers: Record<string, string[]>; // Modifiers a character starts with, by character id (traits: Ian pacifist, owner 2026-10-18; Chun immunity and mankind_only_hope, owner 2026-10-18; Terrence wheelchair, owner 2026-10-19; Chao hyperactive, owner 2026-11-08).
  mankindOnlyHope: { moraleLossCut: number }; // How much less morale the crew loses each day while a holder (Chun) is alive (owner, 2026-10-18).
  hopeless: { deathMorale: number }; // Morale every living player loses for each human who dies Hopeless at a cycle's end (owner, 2026-11-11).
  startItems: { type: string; room: RoomId; builds?: string; teaches?: string; plant?: PlantState }[]; // Items placed in rooms at the start of the game. Types come from ITEM_TYPES in items.ts.
  startInventory: string[]; // Item types every player starts carrying (one of each).
  rooms: Record<RoomId, RoomId[]>; // Adjacency list. Movement is only allowed along these edges.
  equipment: Record<RoomId, Equipment[]>; // Equipment in each room at launch, copied into `GameState.equipment`. Types come from EQUIPMENT_TYPES in equipment.ts.
  diseases: DiseaseCatagories;
}

export interface Equipment {
  id: string; // Unique across the ship, e.g. "REFECTORY:KITCHEN".
  type: string;
  shield?: number; // Reinforce (actions/reinforce.ts): shielding points, up to `config.reinforce.max`. Engineers and Mush see it in views. No effect yet. Never set in the config.
  jelly?: number; // Green jelly (actions/green_jelly.ts): cycle changes left before it breaks. Mush-only in views.
  broken?: true; // Broken by an incident or a fire (breakage.ts) until repaired. Only the living in its room see it. Never set in the config.
}
