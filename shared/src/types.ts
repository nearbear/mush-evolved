import type { ActionCost } from "./actions.ts";
import type { ActopiCheat, Cheat } from "./cheats.ts";
import type { CharacterId } from "./characters.ts";
import type { RngState } from "./rng.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

/** Which scripted brain drives a bot seat. Absent means "wander". */
export type BotKind = "wander" | "logParrot";

export interface Seat {
  id: PlayerId;
  name: string;
  isBot: boolean;
  botKind?: BotKind;
  /** Cosmetic only: which crew member's art this seat is drawn with. */
  character: CharacterId;
}

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

export type ResourceId = "eng" | "exp" | "comp" | "garden" | "core" | "shoot" | "cook" | "heal" | "pilgred";

export interface PlayerState extends Seat {
  role: Role;
  /** Mush chosen at the start ("alpha"; later infections are "beta"). Player terminology only; no mechanics use it. */
  alpha: boolean;
  room: RoomId;
  ap: number;
  /** Movement points. Start at 0; topped up by converting AP when moving. */
  mp: number;
  /** Health points. Private: only in your own view. Nothing changes them yet. */
  hp: number;
  /** Morale points. Private: only in your own view. Lose `moralePerDay` at the end of each day. */
  morale: number;
  /** Satiety (humans only; Mush stay at 0 and never get hungry). Never below 0. Private: only in your own view. */
  satiety: number;
  /** The cycle satiety last reached 0 (or the game began at 0); null while satiety is above 0 or for Mush. Counts toward hunger. */
  satietyZeroSince: number | null;
  /** Stored status effects (statuses.ts); full belly and hungry are derived from satiety, so only `dirty` is stored for now. */
  statuses: string[];
  /** Spores this player carries. Only Mush ever gain any; visible in your own view only (teammates' counts will be shown to Mush later). */
  spores: number;
  /** Extra point counters (resources.ts). Private: only in your own view. Nothing earns or spends them yet. */
  resources: Record<ResourceId, number>;
  /**
   * Ids of active rule modifiers (from items, skills, statuses). Resolved
   * against the registry in modifiers.ts; state holds ids only so it stays JSON.
   */
  modifiers: string[];
  /**
   * Skill ids in the player's human skill slots (SKILL_SLOTS; a book slot comes later). Each is a modifier id in
   * modifiers.ts. Picked for good with the `pick_skill` action. Roommates see them in `OtherPlayerView.skills`.
   */
  skills: string[];
  alive: boolean;
  /** Finished acting for this cycle. */
  ready: boolean;
  /** Development cheats switched on (cheats.ts). Always empty unless the server allows cheats. Only in your own view. */
  cheats: Cheat[];
  /** Development cheat: overrides ACTOPI for what this player sees only. The game's ACTOPI is unchanged. */
  actopiCheat: ActopiCheat;
}

/**
 * One line of history. `room` is where it happened (absent = ship-wide, e.g. a
 * new cycle). `visibleTo: "all"` entries are part of that room's history and
 * shown to whoever is in the room; a player list is private to those players.
 */
export interface LogEntry {
  cycle: number;
  /** Message id; the client turns it into text (`logEvent.<key>` in the locale catalogs). */
  key: string;
  /** Data for the message. `room`, `item` and `equipment` params are ids the client names; `name` is a player name. */
  params?: LogParams;
  room?: RoomId;
  visibleTo: "all" | PlayerId[];
}

/** Values a log message can interpolate. */
export type LogParams = Record<string, string | number>;

export type ItemId = string;

/** Where an item is: a player's inventory or a room's (unlimited) storage. */
export type Container = { kind: "player"; id: PlayerId } | { kind: "room"; id: RoomId };

export interface ItemState {
  id: ItemId;
  /** Key into ITEM_TYPES (items.ts). */
  type: string;
  at: Container;
  /** For a corpse: whose body it is. */
  of?: PlayerId;
}

/**
 * Something a player can inspect and act on: a person, a piece of room
 * equipment, or an item.
 */
export type Target = { kind: "player"; id: PlayerId } | { kind: "equipment"; id: string } | { kind: "item"; id: ItemId };

/**
 * Crew-wide threads, one per ship feature, with the same permissions as global
 * chat (decided 2026-10-13). Order is the order the client lists them in.
 */
export const FEATURE_CHANNELS = ["botany", "research", "inventory", "space_battle", "comms", "pilgred", "neron", "astrophysics"] as const;
export type FeatureChannel = (typeof FEATURE_CHANNELS)[number];
export type ChatChannel = "global" | FeatureChannel;
export const CHAT_CHANNELS: readonly ChatChannel[] = ["global", ...FEATURE_CHANNELS];

/**
 * The Mush's own channel. Only living Mush read or post (see chatChannels); the
 * game also posts system messages here when a human's contamination rises.
 */
export const MUSH_CHANNEL = "mush";

/** Id of a player-made private channel (`pc-1`, `pc-2`, ...). Never collides with a ChatChannel name. */
export type PrivateChannelId = `pc-${number}`;
/** Anything a chat message can be posted to. */
export type ChannelId = ChatChannel | typeof MUSH_CHANNEL | PrivateChannelId;

/** Chat among the members only. Anyone in it may invite others; it ends when the last member leaves. */
export interface PrivateChannel {
  id: PrivateChannelId;
  name: string;
  members: PlayerId[];
  createdBy: PlayerId;
}

export interface ChatMessage {
  /** Increasing per game; stable React key and ordering. */
  id: number;
  cycle: number;
  channel: ChannelId;
  /** Null for a system message posted by the game. */
  from: PlayerId | null;
  /** Copied at send time so the client doesn't need a lookup. Empty for a system message. */
  name: string;
  isBot: boolean;
  /** Empty for a system message, which carries `system` instead. */
  text: string;
  /** A system message: the client translates `key` with `params`, like a log entry. */
  system?: { key: string; params?: LogParams };
}

/** Full authoritative state. Server-only: never send this to a client. */
export interface GameState {
  config: GameConfig;
  rng: RngState;
  cycle: number;
  phase: "playing" | "ended";
  players: PlayerState[];
  /** Every item in the game, wherever it is. */
  items: ItemState[];
  nextItemId: number;
  /** Cycle in which each dispenser (equipment id) last gave something out. One use per cycle per machine. */
  dispensedOn: Record<string, number>;
  log: LogEntry[];
  chat: ChatMessage[];
  nextChatId: number;
  channels: PrivateChannel[];
  nextChannelId: number;
  /**
   * ACTOPI, a ship system. While on, everyone sees who is in which room. While
   * off, you still see how many people are in each room, but only know who they
   * are for the room you are in. Nothing switches it yet (2026-10-13); starts on.
   */
  actopi: boolean;
  /**
   * Bonds, by who made them: `bonds[a]` lists everyone `a` has bonded to. They
   * last forever. DTT and STT need both directions. Visible only to the two
   * partners (see `PlayerView.bonds`).
   */
  bonds: Record<PlayerId, PlayerId[]>;
  /** The last day (1-based) each player took part in a DTT or STT. Both partners are blocked for the rest of that day. */
  sharedOnDay: Record<PlayerId, number>;
  /**
   * Contamination per human, from spikes and DTT with a Mush. Hidden from everyone,
   * including its owner: seeing it would tell a human who is Mush. Reaching the
   * capacity converts them to Mush at once and removes their entry (`infection.ts`).
   */
  contamination: Record<PlayerId, number>;
  /** Spores the Mush faction has extracted today; reset at each day boundary. Hidden from everyone. */
  sporesToday: number;
  /** The cycle each Mush last extracted a spore, for the per-Mush cooldown. Hidden from everyone. */
  sporeExtractedOn: Record<PlayerId, number>;
}

export type Action =
  | { type: "move"; to: RoomId }
  | { type: "take"; item: ItemId }
  | { type: "drop"; item: ItemId }
  | { type: "dismantle"; item: ItemId }
  | { type: "dispense"; equipment: string }
  | { type: "consume"; item: ItemId }
  | { type: "cook"; item: ItemId }
  | { type: "examine"; target: Target }
  | { type: "bond"; target: PlayerId }
  | { type: "dtt"; target: PlayerId }
  | { type: "stt"; target: PlayerId }
  | { type: "extract_spore" }
  | { type: "shower"; equipment: string }
  | { type: "heal"; target: PlayerId }
  | { type: "punch"; target: PlayerId }
  | { type: "spike"; target: PlayerId }
  | { type: "pick_skill"; skill: string }
  | { type: "ready" };

/** Room equipment as a client sees it. */
export interface EquipmentView {
  id: string;
  type: string;
}

/** An item as a client sees it. */
export interface ItemView {
  id: ItemId;
  type: string;
}

export interface OtherPlayerView {
  id: PlayerId;
  name: string;
  isBot: boolean;
  botKind?: BotKind;
  character: CharacterId;
  /** Absent when you can't tell where this person is (ACTOPI off, and they aren't in your room). */
  room?: RoomId;
  alive: boolean;
  ready: boolean;
  /** Ids of the statuses everyone can see on this person (public ones only; see statuses.ts). */
  statuses: string[];
  /** Skills they have chosen. Public to anyone in your room (empty for people elsewhere). */
  skills: string[];
  /** Their contamination, shown as a status. Only when you are Mush, they are a contaminated human, and they are in your room. */
  contamination?: number;
}

/** What one seat is allowed to know. This is the only game data a client or bot receives. */
export interface PlayerView {
  you: PlayerState;
  /** Every status you have, public and private, stored and derived (statuses.ts). */
  statuses: string[];
  players: OtherPlayerView[];
  /**
   * One entry per person outside your room whose identity you can't tell
   * (ACTOPI off): the room they are in, sorted by room so the order says
   * nothing about who they are. Empty while ACTOPI is on.
   */
  unidentified: RoomId[];
  /** Global cycle counter (never resets). */
  cycle: number;
  /** 1-based day, and 1-based cycle within that day, derived from `cycle`. */
  day: number;
  cycleOfDay: number;
  phase: GameState["phase"];
  rooms: Record<RoomId, RoomId[]>;
  /** What you carry. Other players' inventories are never sent. */
  inventory: ItemView[];
  /** Your inventory size, after modifiers. */
  inventorySlots: number;
  /** Items stored in the room you are in. Other rooms' items are never sent. */
  roomItems: ItemView[];
  /** Equipment in the room you are in. */
  roomEquipment: EquipmentView[];
  /**
   * History of the room you are in (public entries) plus every entry private
   * to you. Other rooms' public history is never sent.
   */
  log: LogEntry[];
  /** Messages in the channels you may read (all of them while you carry an iTrackie, none otherwise). */
  chat: ChatMessage[];
  /** Channels you may read and post to right now. */
  chatChannels: ChannelId[];
  /** Private channels you belong to. Channels you aren't in are never sent. */
  privateChannels: PrivateChannel[];
  /** How many private channels you may belong to, after modifiers. */
  channelLimit: number;
  /** Your effective movement rules, after modifiers. */
  movement: MovementRules;
  /** AP cap (for drawing the AP bar). */
  maxAp: number;
  /** Caps for drawing your HP and morale bars. */
  maxHp: number;
  maxMorale: number;
  /** Bonds you are part of, with people in any room. Others' bonds are never sent. */
  bonds: {
    /** People you have bonded to. */
    to: PlayerId[];
    /** People who have bonded to you. */
    from: PlayerId[];
  };
  legalActions: Action[];
  /** AP and MP each legal action costs you, index-aligned with `legalActions`. */
  legalCosts: ActionCost[];
}
