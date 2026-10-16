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
