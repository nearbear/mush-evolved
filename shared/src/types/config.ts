import type { RoomId } from "../types.ts";

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

export interface GameConfig {
  mushCount: number;
  startAp: number;
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
  punch: {
    cost: { ap: number }; // Issue 29.
    effect: {
      damage: number; // HP a landing punch removes (placeholder until combat is designed).
      sturdyBonusDamage: number; // Extra punch damage from the sturdy skill (confirmed 2026-10-16).
    };
    successChance: number; // Chance a punch lands, 0 to 1 (confirmed 2026-10-15: it misses 40% of the time).
    dirtyChance: number; // Chance of getting the dirty status after punching (confirmed 2026-10-13).
  };
  pacifist: {
    aggressiveApSurcharge: number; // Extra AP for each aggressive action in a Pacifist's room, theirs too (owner, 2026-10-18).
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
  dispense: { dirtyChance: number }; // Chance of getting the dirty status after dispensing an item.
  computer: {
    capPoints: number; // Most Computer points (`resources.comp`) a player can hold (owner, 2026-10-16; the original skill's IncrMaxPA(COMP, 4)).
    pointsPerDay: number; // Computer points the `computer` skill grants at the start of each day and when picked (owner, 2026-10-16; the original +2).
  };
  research: {
    cost: { ap: number }; // AP spent to work on a research (decided 2026-10-16).
    effect: { progressPercent: number }; // Percent a research advances per action (decided 2026-10-16).
    dirtyChance: number; // Chance of getting the dirty status after working on a research (owner, 2026-10-20).
  };
  project: {
    cost: { ap: number }; // AP spent to work on a NERON project (decided 2026-10-18).
    effect: { progressPercent: number }; // Percent a project advances per action (decided 2026-10-18).
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
    analyze: { cost: { ap: number } }; // AP spent to reveal one sector of one of your planets (owner, 2026-10-19; the original's remote analysis, 2).
    maxPlanets: number; // Most planets one player can hold (owner, 2026-10-19).
  };
  accommodate: { cost: { ap: number }; offerMs: number }; // AP spent to offer to push someone's wheelchair, and how long (server ms) the offer waits to be accepted (owner, 2026-10-19: free, 5 minutes).
  lieDown: { cost: { ap: number } }; // AP spent to lie down in a bed (confirmed 2026-10-17).
  shower: {
    cost: {
      ap: number; // AP spent to shower, before the soap discount (confirmed 2026-10-14).
      soapDiscountAp: number; // AP off a shower when soap is in your inventory (confirmed 2026-10-14).
    };
    effect: { mushDamage: number }; // HP a Mush loses by showering (confirmed 2026-10-14).
    injuryChance: number; // Chance of getting injured after showering.
  };
  transfer: {
    injuryChance: number; // Chance of getting injured when taking or dropping an item.
  };
  ship: {
    oxygen: { start: number; max: number; perCycle: number }; // Oxygen the ship burns each cycle; at 0 one random living crew member dies per cycle (owner, 2026-10-19).
    fuel: { start: number; max: number }; // Nothing burns it yet (owner, 2026-10-19).
    hull: { start: number; max: number }; // Nothing damages it yet except through `damageShip` (owner, 2026-10-19).
    plasmaShield: { start: number; max: number; absorbPercent: number }; // Takes this percent of incoming damage, out of its own points; at 0 the hull takes it all (owner, 2026-10-19).
  };
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
    durationMs: number; // Server time every timed action takes (owner, 2026-10-17: 2 seconds).
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
  startItems: { type: string; room: RoomId; builds?: string; teaches?: string }[]; // Items placed in rooms at the start of the game. Types come from ITEM_TYPES in items.ts.
  startInventory: string[]; // Item types every player starts carrying (one of each).
  rooms: Record<RoomId, RoomId[]>; // Adjacency list. Movement is only allowed along these edges.
  equipment: Record<RoomId, Equipment[]>; // Fixed equipment in each room. Types come from EQUIPMENT_TYPES in equipment.ts.
}

export interface Equipment {
  id: string; // Unique across the ship, e.g. "REFECTORY:KITCHEN".
  type: string;
}
