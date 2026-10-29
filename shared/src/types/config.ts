import type { PlanetDirection } from "../planets.ts";
import type { PlantState, RoomId } from "../types.ts";
import type { StatusId } from "../statuses.ts";

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
  allDisorders: string [],
  allInjuries: StatusId[],
  allDiseaseStats: DiseaseStats[],
  allDisorderStats: DiseaseStats[],
  allInjuryStats: DiseaseStats[],
}

export interface DiseaseStats {
  type: string,
  durationMin?: number,
  durationMax?: number,
  resistance?: number,
}


/** One weapon's numbers (owner, 2026-10-22, from the English wiki; "??" values were set to 12%). */
export interface WeaponStats {
  damage: [min: number, max: number]; // HP a hit removes, rolled uniformly, both ends included.
  mushDamage?: [min: number, max: number]; // Replaces `damage` when the target is a Mush (Natamy rifle).
  accuracy: number; // Chance to hit, 0 to 1.
  expoStrength: number; // Strength on expeditions. Recorded for later; nothing reads it yet.
  charges?: number; // Charges it holds and starts with; each use spends one, and it can't be used at 0. Absent: unlimited.
  area?: { selfDamage: [min: number, max: number] }; // Hits everyone in the room instead of one target; the attacker takes `selfDamage`.
  consumed?: boolean; // Used up by using it (grenade).
  dirtyChance: number; // Chance of getting dirty from using it.
  repairChance: number | null; // Breakable, with this repair chance; null: it can't break. Breaking and repair aren't built.
}

/**
 * Pre-selection (docs/rules-design.md, "Joining and Mush selection"): the ship launches with nobody Mush, players join
 * it, and Mush are chosen when it fills or when the deadline cycle begins, whichever comes first.
 */
export interface PreselectionRules {
  seats: number; // The ship is full, and Mush are chosen, at this many players.
  endsOn: { day: number; cycle: number }; // Mush are chosen when this cycle begins, if the ship hasn't filled.
  twoMushAbove: number; // More players than this get 2 Mush; this many or fewer get 1.
  minPlayers: number; // Stopgap (owner, 2026-10-24): fewer players than this at selection and every human dies at once.
}

/**
 * The only ways a game may differ from `DEFAULT_CONFIG` (`resolveConfig`). A stored game keeps these instead of its
 * config, so it picks up balance changes on its next load. Anything per game that must survive a reload lives here,
 * and config fields derived from it are recomputed by `resolveConfig`. Changing this shape, or what `resolveConfig`
 * derives from a key, bumps `STATE_VERSION` (server/src/GameRoom.ts): a renamed key would silently fall back to the
 * default in live games.
 */
export interface ConfigOverrides {
  mushCount?: number; // Single player: 1.
  manualCycles?: boolean; // Single player, and wherever the server allows cheats.
  // A ship's rules, whole, frozen at launch: an edit to `PRESELECTION` would otherwise move a live ship's deadline or
  // seat count away from the matchmaker's. Absent: `DEFAULT_CONFIG`'s (`null`).
  preselection?: PreselectionRules;
}

export interface GameConfig {
  mushCount: number; // Mush picked at launch. Unused with `preselection`, where the player count decides.
  // Null: everyone is seated at launch and Mush are picked then (tests, single player later).
  preselection: PreselectionRules | null;
  startAp: number;
  startMp: number; // MP each player wakes up with. Capped by `movement.mpCap` like any other gain.
  apPerCycle: number; // AP gained at the start of each cycle, before modifiers. Unspent AP carries over.
  cyclesPerDay: number; // Cycles in one day. The day ends with the last cycle; every living player then loses `dailyMoraleLoss` (modifiers.ts) morale.
  // Cycles change on the server's UTC clock (#24). With this on, `ready` is offered too and the cycle also ends once
  // every living player is ready: the dev server's manual End cycle, and later single player.
  manualCycles: boolean;

  // Roommates see where you stand and sit (spot.ts). Off: `walk` is refused and nobody's spot is sent; a game setting later.
  sharedSpots: boolean;
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
  };
  fungalCuisine: {
    cost: { ap: number }; // The Mush skill Fungal cuisine: 1 AP and 1 spore (owner, 2026-10-24).
  };
  bodyTransfer: {
    cost: { ap: number }; // The Mush skill Transfer: free (owner, 2026-10-24).
  };
  spores: {
    cost: { ap: number }; // AP spent to extract a spore (confirmed 2026-10-13).
    effect: { spores: number }; // Spores one extraction gives (confirmed 2026-10-13).
    cooldownCycles: number; // Cycles a Mush waits between their own extractions; a cooldown on the global cycle counter, not tied to days (confirmed 2026-10-14).
    perDay: number; // Spores the whole Mush faction may extract per day, before modifiers (confirmed 2026-10-14).
  };
  heal: {
    cost: {
      apOther: number; // AP a heal costs on someone else (confirmed 2026-10-15).
      apSelf: number; // AP a heal costs on yourself (confirmed 2026-10-15).
    };
    effect: {
      hp: number; // HP a heal restores before modifiers (confirmed 2026-10-15).
      medicBonusHp: number; // Extra HP a heal restores for a player with the medic skill (owner, 2026-10-15).
      nursePointsPerDay: number; // Care points the nurse skill (`first_aid`) grants at the start of each day and when picked (owner, 2026-10-15).
    };
    rooms: string[]; // Rooms where anyone can heal without a medikit (confirmed 2026-10-15: the sick bay).
    dirtyChance: number; // Chance of getting the dirty status after healing.
  };
  hide: { cost: { ap: number } }; // Hiding an item (owner, 2026-10-25, from the wiki: 1 AP).
  search: { cost: { ap: number } }; // Searching the room for hidden items (owner, 2026-10-25, from the wiki: 1 AP).
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
    dirtyChance: number; // Chance of getting the dirty status after punching (confirmed 2026-10-13).
  };
  pacifist: {
    aggressiveApSurcharge: number; // Extra AP for each aggressive action in a Pacifist's room, theirs too (owner, 2026-10-18).
  };
  botany: {
    // Owner, 2026-10-22 (docs/scratchpad/botany-plan.md, Pass 1).
    water: { cost: { ap: number } }; // Water one thirsty or dried plant.
    treat: { cost: { ap: number } }; // Treat one plant (clears sickness).
    sow: { cost: { ap: number } }; // Plant a carried fruit in an empty hydropot.
    dirtyChance: number; // Chance of getting dirty after watering, treating or sowing (the original's 15%).
    growCycles: Record<string, number>; // Cycles a young plant of each species needs before it becomes adult.
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
  oxygenCapsule: { cost: { ap: number }; dirtyChance: number; injuryChance: number }; // Taking an oxygen capsule from a tank and putting it back (owner, 2026-10-24: as fuel).
  fuel: { cost: { ap: number }; dirtyChance: number, injuryChance: number }; // Taking a capsule from a tank, loading it into the chamber, unloading it back.
  dispense: { dirtyChance: number }; // Chance of getting the dirty status after dispensing an item.
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
  sprinter: {
    extraMpPerConversion: number; // Extra MP the `sprint` skill gets from each AP-to-MP conversion (owner, 2026-10-24; eMushpedia).
  };
  anathema: {
    cost: { ap: number }; // AP the `juge` (Persecutor) skill's Anathema costs (owner, 2026-10-24; eMushpedia).
    successFactor: number; // An Outcast's chance on every action that rolls one is multiplied by this (owner, 2026-10-24: x0.8).
  };
  speech: {
    fiery: { ap: number; morale: number }; // The `leadership` skill's Fiery speech: AP cost, morale given to each other living person in the room (owner, 2026-10-24; eMushpedia). No daily limit.
    boring: { ap: number; mp: number }; // The `motivator` skill's Boring speech: AP cost, MP given to each other living person in the room, once a day (owner, 2026-10-24; eMushpedia).
  };
  chitchat: { cost: { ap: number }; morale: number }; // Confiding in a `confident` in your room: AP cost and the morale you gain; once a day (owner, 2026-10-24).
  comfort: { cost: { ap: number }; morale: number }; // The Shrink's Comfort: AP cost and the morale the roommate gains; no daily limit (owner, 2026-10-26).
  shrink: { lyingMorale: number }; // Morale a cycle for lying in a bed with a living Shrink (not yourself) in the room; doesn't stack (owner, 2026-10-26).
  interrogate: { cost: { ap: number }; damage: number; dirtyChance: number; injuryChance: number }; // The `torturer` skill's Interrogate: AP cost, guaranteed damage, dirt and injury odds; once a day (owner, 2026-10-24).
  research: {
    cost: { ap: number }; // AP spent to work on a research (decided 2026-10-16).
    // The relay formula (relay.ts, owner 2026-10-26), the one PILGRED uses; `mod` is the difficulty, 10 for every research for now.
    progress: { rate: number; mod: number; skillBoost: number; relayPenalty: number };
    dirtyChance: number; // Chance of getting the dirty status after working on a research (owner, 2026-10-20).
  };
  project: {
    cost: { ap: number }; // AP spent to work on a NERON project (decided 2026-10-18).
    progress: { rate: number; mod: number; skillBoost: number; relayPenalty: number }; // As research's (owner, 2026-10-26); no skill bonus for now.
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
    returnCost: { ap: number }; // AP spent to return to Sol at the Command terminal (owner, 2026-10-21; the original's SET_PILGRED_TO_SOL, 2).
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
      siriusRationAp: number; // Extra AP from a ration once Sirius is reached (the original, 1).
    };
    xyloph: {
      cost: { ap: number }; // AP spent to contact Xyloph (owner, 2026-10-21).
      qualityLoss: number; // Wireless infidelity takes this off the Sol chance (the original, 20).
      neronBoostPercent: number; // NERON's lost database moves the NERON update forward this much (the original, 25).
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
      chance: number; // Base success chance of a scan, 0 to 1 (owner, 2026-10-19; the original's 50%).
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
  lieDown: { cost: { ap: number } }; // AP spent to lie down in a bed (confirmed 2026-10-17).
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
  // Each cycle change after the first `safeCycles`, a `waveChance` roll spends it on one hunter per `points.perHunter`.
  hunters: {
    points: { start: number; perCycle: number; hardFromDay: number; hardBonus: number; veryHardFromDay: number; veryHardBonus: number; perHunter: number };
    waveChance: number;
    safeCycles: number;
    hp: number;
    damage: [number, number]; // Damage to the ship per hit, uniform.
    hitChance: number; // A hunter's chance to hit, 0 to 1, back to this after a hit.
    missBonus: number; // Added to the hunter's chance after each miss.
    followShare: number; // Share of the hunters that follow a jump (travel or leaving orbit), rounded up.
    patrolTargetChance: number; // Chance a hunter picking a target aims at a patrol ship in flight (one at random), when any is out.
    // What a destroyed hunter leaves in space: weights by piece count (index = count), and by item type for each piece.
    debris: { count: number[]; types: Record<string, number> };
  };
  // Turrets (owner, 2026-10-24, the wiki's Tourelle): 1 AP, a charge per shot, 30% to hit, x1.25 per miss in a row, reset by a hit.
  turrets: { cost: { ap: number }; chance: number; failureMultiplier: number; damage: [number, number]; charges: number; rechargePerCycle: number };
  // Patrol ships and the Pasiphae (owner, 2026-10-24, docs/patrol-plan.md): takeoff and landing cost 2 AP each; armor
  // 10 (Pasiphae 12); a manoeuvre is clean at `cleanChance` (a Pilot always), otherwise rough: hull and pilot hp
  // ranges, uniform, and a fixed armor loss. Phase 3 (owner, 2026-10-28): a patrol ship (not the Pasiphae) holds
  // `charges` shots, regaining `rechargePerCycle` a cycle only while docked; a shot is like a turret's, with its own
  // numbers, and a Pilot multiplies its chance by `pilotAccuracyFactor`.
  patrol: {
    takeoff: { cost: { ap: number } };
    land: { cost: { ap: number } };
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
    renovate: { cost: { ap: number }; chance: number; engineerFactor: number };
  };
  // The space capsule: opening it turns it into one of `contents`, each equally likely.
  spaceCapsule: { cost: { ap: number }; contents: string[] };
  // Hull repair (owner, 2026-10-24, the wiki's Armure et Bouclier): 1 AP, 25%, +5 hull, a metal scrap used up on a success.
  hullRepair: { cost: { ap: number }; chance: number; amount: number };
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
    successChance: number; // Chance of successfully dismantling an item (confirmed 2026-10-13).
    dirtyChance: number; // Chance of getting the dirty status after dismantling an item (confirmed 2026-10-13).
    injuryChance: number; // Chance of getting injured after dismantling an item.
    itemChance: Record<string, number>; // Per item type odds that replace `successChance` (owner, 2026-10-22: knife and blaster 50%).
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
  logistics: {
    ap: number; // AP the logistics skill gives a random roommate each cycle (confirmed 2026-10-16).
  };
  caffeinomaniac: {
    ap: number; // Extra AP the caffeinomaniac skill gives on consuming a coffee, capped at maxAp (confirmed 2026-10-16).
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
  characterModifiers: Record<string, string[]>; // Modifiers a character starts with, by character id (traits: Ian pacifist, owner 2026-10-18; Chun immunity and mankind_only_hope, owner 2026-10-18; Terrence wheelchair, owner 2026-10-19).
  mankindOnlyHope: { moraleLossCut: number }; // How much less morale the crew loses each day while a holder (Chun) is alive (owner, 2026-10-18).
  startItems: { type: string; room: RoomId; builds?: string; teaches?: string; plant?: PlantState }[]; // Items placed in rooms at the start of the game. Types come from ITEM_TYPES in items.ts.
  startInventory: string[]; // Item types every player starts carrying (one of each).
  rooms: Record<RoomId, RoomId[]>; // Adjacency list. Movement is only allowed along these edges.
  equipment: Record<RoomId, Equipment[]>; // Equipment in each room at launch, copied into `GameState.equipment`. Types come from EQUIPMENT_TYPES in equipment.ts.
  diseases: DiseaseCatagories;
}

export interface Equipment {
  id: string; // Unique across the ship, e.g. "REFECTORY:KITCHEN".
  type: string;
}
