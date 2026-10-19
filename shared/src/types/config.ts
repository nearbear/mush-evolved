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

export interface GameConfig {
  mushCount: number;
  startAp: number;
  apPerCycle: number; // AP gained at the start of each cycle, before modifiers. Unspent AP carries over.
  cyclesPerDay: number; // Cycles in one day. The day ends with the last cycle; every living player then loses `dailyMoraleLoss` (modifiers.ts) morale.
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
  };
  punch: {
    cost: { ap: number }; // Issue 29.
    effect: {
      damage: number; // HP a landing punch removes (placeholder until combat is designed).
      sturdyBonusDamage: number; // Extra punch damage from the sturdy skill (confirmed 2026-10-16).
    };
    successChance: number; // Chance a punch lands, 0 to 1 (confirmed 2026-10-15: it misses 40% of the time).
  };
  pacifist: {
    aggressiveApSurcharge: number; // Extra AP for each aggressive action in a Pacifist's room, theirs too (owner, 2026-10-18).
  };
  cook: {
    cost: { ap: number }; // AP spent to cook an uncooked ration (confirmed 2026-10-16).
    rooms: RoomId[]; // Rooms where food can be cooked (confirmed 2026-10-16).
  };
  build: {
    cost: { ap: number }; // AP spent to build from a blueprint (decided 2026-10-16: 3, the original game's value).
  };
  jettison: {
    cost: { ap: number }; // AP spent to jettison a carried corpse (decided 2026-10-16: free).
    rooms: RoomId[]; // Rooms where a corpse can be jettisoned: the four bays (decided 2026-10-16).
  };
  install: {
    cost: { ap: number }; // AP spent to install a carried camera in the room (approved 2026-10-17: 1).
  };
  uninstall: {
    cost: { ap: number }; // AP spent to uninstall the room's camera back into an item (placeholder 2026-10-17: 1, like install).
  };
  computer: {
    capPoints: number; // Most Computer points (`resources.comp`) a player can hold (owner, 2026-10-16; the original skill's IncrMaxPA(COMP, 4)).
    pointsPerDay: number; // Computer points the `computer` skill grants at the start of each day and when picked (owner, 2026-10-16; the original +2).
  };
  research: {
    cost: { ap: number }; // AP spent to work on a research (decided 2026-10-16).
    effect: { progressPercent: number }; // Percent a research advances per action (decided 2026-10-16).
  };
  lieDown: { cost: { ap: number } }; // AP spent to lie down in a bed (confirmed 2026-10-17).
  shower: {
    cost: {
      ap: number; // AP spent to shower, before the soap discount (confirmed 2026-10-14).
      soapDiscountAp: number; // AP off a shower when soap is in your inventory (confirmed 2026-10-14).
    };
    effect: { mushDamage: number }; // HP a Mush loses by showering (confirmed 2026-10-14).
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
  characterModifiers: Record<string, string[]>; // Modifiers a character starts with, by character id (traits: Ian pacifist, owner 2026-10-18; Chun immunity and mankind_only_hope, owner 2026-10-18).
  mankindOnlyHope: { moraleLossCut: number }; // How much less morale the crew loses each day while a holder (Chun) is alive (owner, 2026-10-18).
  startItems: { type: string; room: RoomId; builds?: string }[]; // Items placed in rooms at the start of the game. Types come from ITEM_TYPES in items.ts.
  startInventory: string[]; // Item types every player starts carrying (one of each).
  rooms: Record<RoomId, RoomId[]>; // Adjacency list. Movement is only allowed along these edges.
  equipment: Record<RoomId, Equipment[]>; // Fixed equipment in each room. Types come from EQUIPMENT_TYPES in equipment.ts.
}

export interface Equipment {
  id: string; // Unique across the ship, e.g. "REFECTORY:KITCHEN".
  type: string;
}
