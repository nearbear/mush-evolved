import type { RngState } from "./rng.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

export interface Seat {
  id: PlayerId;
  name: string;
  isBot: boolean;
}

export interface GameConfig {
  mushCount: number;
  apPerCycle: number;
  moveCost: number;
  startRoom: RoomId;
  /** Adjacency list. Movement is only allowed along these edges. */
  rooms: Record<RoomId, RoomId[]>;
}

export interface PlayerState extends Seat {
  role: Role;
  room: RoomId;
  ap: number;
  alive: boolean;
  /** Finished acting for this cycle. */
  ready: boolean;
}

/** `visibleTo: "all"` is public; otherwise only the listed players see the entry. */
export interface LogEntry {
  cycle: number;
  text: string;
  visibleTo: "all" | PlayerId[];
}

/** Full authoritative state. Server-only: never send this to a client. */
export interface GameState {
  config: GameConfig;
  rng: RngState;
  cycle: number;
  phase: "playing" | "ended";
  players: PlayerState[];
  log: LogEntry[];
}

export type Action =
  | { type: "move"; to: RoomId }
  | { type: "ready" };

export interface OtherPlayerView {
  id: PlayerId;
  name: string;
  isBot: boolean;
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
  log: LogEntry[];
  legalActions: Action[];
}
