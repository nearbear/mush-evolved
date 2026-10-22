import type { PlanetTag } from "../planets.ts";
import type { RngState } from "../rng.ts";
import type { TitleId } from "../titles.ts";
import type { ItemState, LogEntry, PlayerId } from "../types.ts";
import type { ChatMessage, ChatThread, PrivateChannel } from "./chat.ts";
import type { GameConfig } from "./config.ts";
import type { PlayerState } from "./player.ts";

/** The Daedalus's counters (ship.ts). */
export interface ShipResources {
  oxygen: number;
  fuel: number;
  hull: number;
  plasmaShield: number;
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
  /** Threads under global chat. */
  threads: ChatThread[];
  nextThreadId: number;
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
  /** The ship's resources. Public: sent to everyone (owner, 2026-10-19). */
  ship: ShipResources;
  /** Spores the Mush faction has extracted today; reset at each day boundary. Hidden from everyone. */
  sporesToday: number;
  /** The cycle each Mush last extracted a spore, for the per-Mush cooldown. Hidden from everyone. */
  sporeExtractedOn: Record<PlayerId, number>;
  /** Percent done of each research that has been started (absent = 0), by research id (research.ts). Public: sent to everyone. */
  research: Record<string, number>;
  /** Percent done of each NERON project that has been started (absent = 0), by project id (projects.ts). Public: sent to everyone. */
  projects: Record<string, number>;
  /** Each player's planets, found at the Astro terminal (planets.ts). Private: only the finder's own view has them, without the unknown sectors' tags. */
  planets: Record<PlayerId, Planet[]>;
  /** Failed scans in a row per player, raising their next scan's odds; reset by a success (owner, 2026-10-19). Never sent. */
  scanFailures: Record<PlayerId, number>;
  nextPlanetId: number;
  /** Who holds each title (titles.ts); null while vacant. Public: every view has the holders and the lines. */
  titles: Record<TitleId, PlayerId | null>;
  /**
   * Server time (ms) of the latest action input or tick (queue.ts); 0 before the first. The rules' only clock, for
   * deadlines such as accommodation offers. Never sent.
   */
  now: number;
}

/** A planet a player found. Its size is the number of sectors. */
export interface Planet {
  id: string;
  /** Generated; a proper noun, not translated. */
  name: string;
  /** In a fixed shuffled order; `known` once an analysis revealed the sector. */
  sectors: { tag: PlanetTag; known: boolean }[];
}
