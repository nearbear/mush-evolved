import type { ActionCost } from "../actions.ts";
import type { CharacterId } from "../characters.ts";
import type { Action, BotKind, ItemId, LogEntry, PlayerId, RoomId } from "../types.ts";
import type { ChannelId, ChatMessage, PrivateChannel } from "./chat.ts";
import type { MovementRules } from "./config.ts";
import type { PlayerState } from "./player.ts";
import type { GameState } from "./state.ts";

/** Room equipment as a client sees it. */
export interface EquipmentView {
  id: string;
  type: string;
}

/** An item as a client sees it. */
export interface ItemView {
  id: ItemId;
  type: string;
  /** For a corpse: whose body it is (the dead are public, and the world already draws them). */
  of?: PlayerId;
  /** For a blueprint: which recipe it carries (the blueprint is public to whoever can see the item). */
  builds?: string;
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
/** The slice of `GameConfig` sent to every client. Same for everyone, so nothing hidden. */
export interface PublicConfig {
  /** MP added to each move while carrying a heavy item (before modifiers). */
  heavyMpPenalty: number;
}

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
  /** Messages in `readChannels`. */
  chat: ChatMessage[];
  /** Channels you may post to right now. */
  chatChannels: ChannelId[];
  /** Channels you may read: `chatChannels`, or for the dead the public ones (and the Mush channel for a dead Mush). */
  readChannels: ChannelId[];
  /** Private channels you belong to. Channels you aren't in are never sent. */
  privateChannels: PrivateChannel[];
  /** How many private channels you may belong to, after modifiers. */
  channelLimit: number;
  /** Your effective movement rules, after modifiers. */
  movement: MovementRules;
  /**
   * Base config numbers the client may show in descriptions. Not modified per player and never used to work out legality;
   * a player does that sum in their head.
   */
  config: PublicConfig;
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
  /** Percent done of each research that has been started, public to everyone (decided 2026-10-16). */
  research: Record<string, number>;
  legalActions: Action[];
  /** AP and MP each legal action costs you, index-aligned with `legalActions`. */
  legalCosts: ActionCost[];
  /** Your chance of success (0 to 1) for each legal action, index-aligned with `legalActions`. */
  legalChances: number[];
  /**
   * Actions that would be legal if you had the AP or MP, so the client can show them disabled and say why.
   * Only candidates on things you can already see, so nothing hidden is revealed.
   */
  unaffordable: UnaffordableAction[];
}

/** An action blocked only by a lack of points: what it costs, its chance of success, and which of your points fall short. */
export interface UnaffordableAction {
  action: Action;
  cost: ActionCost;
  chance: number;
  lacks: ("ap" | "mp")[];
}
