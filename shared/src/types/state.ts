import type { RngState } from "../rng.ts";
import type { ItemState, LogEntry, PlayerId } from "../types.ts";
import type { ChatMessage, PrivateChannel } from "./chat.ts";
import type { GameConfig } from "./config.ts";
import type { PlayerState } from "./player.ts";

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
  /** Percent done of each research that has been started (absent = 0), by research id (research.ts). Public: sent to everyone. */
  research: Record<string, number>;
}
