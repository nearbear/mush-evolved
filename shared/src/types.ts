import type { CharacterId } from "./characters.ts";
import type { RngState } from "./rng.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

export interface Seat {
  id: PlayerId;
  name: string;
  isBot: boolean;
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
  apPerCycle: number;
  movement: MovementRules;
  startRoom: RoomId;
  /** Adjacency list. Movement is only allowed along these edges. */
  rooms: Record<RoomId, RoomId[]>;
}

export interface PlayerState extends Seat {
  role: Role;
  room: RoomId;
  ap: number;
  /** Movement points. Start at 0; topped up by converting AP when moving. */
  mp: number;
  /**
   * Ids of active rule modifiers (from items, skills, statuses). Resolved
   * against the registry in modifiers.ts; state holds ids only so it stays JSON.
   */
  modifiers: string[];
  alive: boolean;
  /** Finished acting for this cycle. */
  ready: boolean;
}

/**
 * One line of history. `room` is where it happened (absent = ship-wide, e.g. a
 * new cycle). `visibleTo: "all"` entries are part of that room's history and
 * shown to whoever is in the room; a player list is private to those players.
 */
export interface LogEntry {
  cycle: number;
  text: string;
  room?: RoomId;
  visibleTo: "all" | PlayerId[];
}

export type ChatChannel = "global";

export interface ChatMessage {
  /** Increasing per game; stable React key and ordering. */
  id: number;
  cycle: number;
  channel: ChatChannel;
  from: PlayerId;
  /** Copied at send time so the client doesn't need a lookup. */
  name: string;
  isBot: boolean;
  text: string;
}

/** Full authoritative state. Server-only: never send this to a client. */
export interface GameState {
  config: GameConfig;
  rng: RngState;
  cycle: number;
  phase: "playing" | "ended";
  players: PlayerState[];
  log: LogEntry[];
  chat: ChatMessage[];
  nextChatId: number;
}

export type Action =
  | { type: "move"; to: RoomId }
  | { type: "ready" };

export interface OtherPlayerView {
  id: PlayerId;
  name: string;
  isBot: boolean;
  character: CharacterId;
  room: RoomId;
  alive: boolean;
  ready: boolean;
}

/** What one seat is allowed to know. This is the only game data a client or bot receives. */
export interface PlayerView {
  you: PlayerState;
  players: OtherPlayerView[];
  cycle: number;
  phase: GameState["phase"];
  rooms: Record<RoomId, RoomId[]>;
  /**
   * History of the room you are in (public entries) plus every entry private
   * to you. Other rooms' public history is never sent.
   */
  log: LogEntry[];
  chat: ChatMessage[];
  /** Channels you may post to right now. */
  chatChannels: ChatChannel[];
  /** Your effective movement rules, after modifiers. */
  movement: MovementRules;
  /** AP refills to this each cycle (for drawing the AP bar). */
  maxAp: number;
  legalActions: Action[];
}
