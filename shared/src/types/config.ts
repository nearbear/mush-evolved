import type { RoomId } from "../types.ts";

/**
 * How moving between rooms is paid for. These are base values; modifiers from
 * items and skills can change them per player (see modifiers.ts).
 */
export interface MovementRules {
  /** MP spent per move. */
  mpPerMove: number;
  /** When MP is short, this much AP is converted... */
  apPerConversion: number;
  /** ...into this much MP. */
  mpPerConversion: number;
  /** MP can never exceed this. */
  mpCap: number;
}

export interface GameConfig {
  mushCount: number;
  startAp: number;
  /** AP gained at the start of each cycle, before modifiers. Unspent AP carries over. */
  apPerCycle: number;
  /** Cycles in one day. The day ends with the last cycle; every living player then loses `moralePerDay` morale. */
  cyclesPerDay: number;
  /** Morale lost by each living player at the end of a day. */
  moralePerDay: number;
  /** AP never exceeds this. */
  maxAp: number;
  movement: MovementRules;
  maxHp: number;
  startHp: number;
  maxMorale: number;
  startMorale: number;
  startRoom: RoomId;
  /** Private inventory slots per player, before modifiers. */
  inventorySlots: number;
  /** Private channels a player may belong to, before modifiers. */
  channelLimit: number;
  /**
   * Per-feature tuning. Actions group their numbers into `cost` (what the player pays) and `effect` (what happens),
   * so a cost in morale or MP can sit next to an effect without being confused with it. Conditions (rooms, odds,
   * cooldowns) stay beside them.
   */
  bond: {
    cost: { /** Confirmed 2026-10-14. */ ap: number };
  };
  share: {
    cost: { /** Paid by the one who starts a DTT or STT (confirmed 2026-10-14). */ ap: number };
    /** What each of the two gets from a DTT or STT (confirmed 2026-10-14). */
    effect: { morale: number };
  };
  infection: {
    /** Contamination a human reaches before converting to Mush, before modifiers (confirmed 2026-10-14). */
    capacity: number;
  };
  spike: {
    cost: { /** Confirmed 2026-10-15. */ ap: number };
  };
  spores: {
    cost: { /** AP spent to extract a spore (confirmed 2026-10-13). */ ap: number };
    effect: { /** Spores one extraction gives (confirmed 2026-10-13). */ spores: number };
    /** Cycles a Mush waits between their own extractions; a cooldown on the global cycle counter, not tied to days (confirmed 2026-10-14). */
    cooldownCycles: number;
    /** Spores the whole Mush faction may extract per day, before modifiers (confirmed 2026-10-14). */
    perDay: number;
  };
  heal: {
    cost: {
      /** AP a heal costs on someone else (confirmed 2026-10-15). */
      apOther: number;
      /** AP a heal costs on yourself (confirmed 2026-10-15). */
      apSelf: number;
    };
    effect: {
      /** HP a heal restores before modifiers (confirmed 2026-10-15). */
      hp: number;
      /** Extra HP a heal restores for a player with the medic skill (owner, 2026-10-15). */
      medicBonusHp: number;
      /** Care points the nurse skill (`first_aid`) grants at the start of each day and when picked (owner, 2026-10-15). */
      nursePointsPerDay: number;
    };
    /** Rooms where anyone can heal without a medikit (confirmed 2026-10-15: the sick bay). */
    rooms: string[];
  };
  punch: {
    cost: { /** Issue 29. */ ap: number };
    effect: {
      /** HP a landing punch removes (placeholder until combat is designed). */
      damage: number;
      /** Extra punch damage from the sturdy skill (confirmed 2026-10-16). */
      sturdyBonusDamage: number;
    };
    /** Chance a punch lands, 0 to 1 (confirmed 2026-10-15: it misses 40% of the time). */
    successChance: number;
  };
  cook: {
    cost: { /** AP spent to cook an uncooked ration (confirmed 2026-10-16). */ ap: number };
    /** Rooms where food can be cooked (confirmed 2026-10-16). */
    rooms: RoomId[];
  };
  shower: {
    cost: {
      /** AP spent to shower, before the soap discount (confirmed 2026-10-14). */
      ap: number;
      /** AP off a shower when soap is in your inventory (confirmed 2026-10-14). */
      soapDiscountAp: number;
    };
    effect: { /** HP a Mush loses by showering (confirmed 2026-10-14). */ mushDamage: number };
  };
  hunger: {
    /** Satiety a human loses each cycle, before modifiers (confirmed 2026-10-14). */
    satietyPerCycle: number;
    /** Satiety at which a human has the full belly status and can't eat (confirmed 2026-10-14). */
    fullBellyAt: number;
    /** Cycles after satiety reaches 0 before the hungry status starts (confirmed 2026-10-14). */
    hungryAfterCycles: number;
    /** HP a hungry human loses each cycle (confirmed 2026-10-14). */
    hpPerCycle: number;
  };
  dismantle: {
    cost: { /** AP spent to dismantle an item (confirmed 2026-10-13). */ ap: number };
    /** Chance of successfully dismantling an item (confirmed 2026-10-13). */
    successChance: number;
  };
  creative: {
    /** Chance that the Creative skill refunds 1 AP after a failed action that cost AP (confirmed 2026-10-15). */
    refundOdds: number;
  };
  heavy: {
    /** MP added to each move while carrying a heavy item, however many (confirmed 2026-10-16). */
    mpPenalty: number;
  };
  /** Skills every player starts with (none since 2026-10-15; players pick their own). */
  startSkills: string[];
  /** Items placed in rooms at the start of the game. Types come from ITEM_TYPES in items.ts. */
  startItems: { type: string; room: RoomId }[];
  /** Item types every player starts carrying (one of each). */
  startInventory: string[];
  /** Adjacency list. Movement is only allowed along these edges. */
  rooms: Record<RoomId, RoomId[]>;
  /** Fixed equipment in each room. Types come from EQUIPMENT_TYPES in equipment.ts. */
  equipment: Record<RoomId, Equipment[]>;
}

export interface Equipment {
  /** Unique across the ship, e.g. "REFECTORY:KITCHEN". */
  id: string;
  type: string;
}
