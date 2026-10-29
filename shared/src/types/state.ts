import type { BiosState } from "../bios.ts";
import type { CommsState } from "../comms.ts";
import type { PlanetDirection, PlanetTag } from "../planets.ts";
import type { RelayStreak } from "../relay.ts";
import type { RngState } from "../rng.ts";
import type { TitleId } from "../titles.ts";
import type { ItemState, LogEntry, PlayerId, RoomId } from "../types.ts";
import type { ChatMessage, ChatThread, PrivateChannel } from "./chat.ts";
import type { DeepReadonly, Equipment, GameConfig } from "./config.ts";
import type { PlayerState } from "./player.ts";

/** An item floating in space: an item without a container (and no one's hiding place). */
export type SpaceDebris = Omit<ItemState, "at" | "hiddenBy">;

/** The side that won the game (victory.ts). */
export type Winner = "mush" | "humans";

/** How the game ended (victory.ts): the ship reached Sol or Eden, or the last human died. */
export type Ending = "sol" | "eden" | "humans_dead" | "ship_destroyed";

/** The Daedalus's counters (ship.ts). */
export interface ShipResources {
  oxygen: number;
  fuel: number;
  /** Fuel in the combustion chamber: all Travel can burn, and Leave orbit. */
  combustion: number;
  hull: number;
  plasmaShield: number;
}

/** Full authoritative state. Server-only: never send this to a client. */
export interface GameState {
  /** Read-only: the stored game keeps only its overrides and resolves this again on each load, so a write here is lost. */
  readonly config: DeepReadonly<GameConfig>;
  rng: RngState;
  cycle: number;
  phase: "playing" | "ended";
  /** True from launch until Mush are chosen (preselection.ts): nobody is Mush yet and players may still join. */
  preselection: boolean;
  /** Who won, once `phase` is "ended" (victory.ts); null while playing. Public: every view has it. */
  winner: Winner | null;
  /** How it ended, set with `winner`; null while playing. Public: every view has it. */
  ending: Ending | null;
  players: PlayerState[];
  /** Every item in the game, wherever it is. */
  items: ItemState[];
  nextItemId: number;
  /**
   * Equipment in each room: the map's (`config.equipment`, copied at launch) plus what players build or install, minus
   * what they dismantle or uninstall. Lives in the state, not the config, since the config isn't stored with the game.
   */
  equipment: Record<RoomId, Equipment[]>;
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
   * NERON's BIOS switches (bios.ts), both on at the start. `actopi`: while on, everyone sees who is in which room;
   * while off, you still see how many people are in each room, but only know who they are for the room you are in.
   * `death_announcements`: whether a death is announced in global chat. The values go only to the living at a BIOS
   * terminal (their effects are visible to everyone).
   */
  bios: BiosState;
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
  /** Who contributed last to each research and project and how many times in a row (the relay penalty, relay.ts). Never sent in a view. */
  relay: { research: Record<string, RelayStreak>; projects: Record<string, RelayStreak> };
  /**
   * PILGRED's repair (pilgred.ts): percent done, and who repaired last and how many times in a row (the relay penalty).
   * `progress` goes only to the living in a room with the PILGRED terminal; `lastBy` and `streak` are never sent.
   */
  pilgred: { progress: number; lastBy: PlayerId | null; streak: number };
  /**
   * The communication center (comms.ts). `linked` goes to everyone; the rest only to the living at a Com center
   * terminal, read-only.
   */
  comms: CommsState;
  /** Each player's planets, found at the Astro terminal (planets.ts). Private: only the finder's own view has them, without the unknown sectors' tags. */
  planets: Record<PlayerId, Planet[]>;
  /** Failed scans in a row per player, raising their next scan's odds; reset by a success (owner, 2026-10-19). Never sent. */
  scanFailures: Record<PlayerId, number>;
  nextPlanetId: number;
  /**
   * The ship's heading and the planet it orbits, by id, if any (navigation.ts). `orbit` is public only as "in orbit or
   * not"; the planet stays its finder's. `heading` goes only to the living at a Command terminal.
   */
  navigation: { heading: PlanetDirection; orbit: string | null };
  /**
   * Hunters attacking the ship (hunters.ts). `points` is the wave pool and `since` the cycle Mush were chosen (null
   * before): never sent. Each hunter's hp goes to the living in a turret room; its hit chance and target never; how
   * many there are, to everyone.
   */
  hunters: { points: number; since: number | null; list: Hunter[]; nextId: number };
  /** Charges left in each turret, by its `TURRET_COMMAND` equipment id; absent = full. To the living in a turret room. */
  turrets: Record<string, number>;
  /**
   * Each patrol ship by its room id (patrol.ts): its armor, its charges (always 0 for the Pasiphae, which can't shoot),
   * whether it is out (in flight), and whether it was destroyed (for good; a destroyed ship stays out). Out and destroyed
   * are known to anyone in its bay (owner, 2026-10-24); armor and charges go to its pilot only, for now.
   */
  patrolShips: Record<RoomId, { armor: number; charges: number; out: boolean; destroyed: boolean }>;
  /**
   * Debris floating around the Daedalus (docs/patrol-plan.md, phase 5): what destroyed hunters drop and what floats off
   * a destroyed patrol ship, as items with no container. Lost when the ship jumps. Never sent, except how many pieces
   * there are, to whoever flies a patrol ship (owner, 2026-10-28).
   */
  space: SpaceDebris[];
  /** Missed turret shots in a row per player, raising their next shot's odds; reset by a hit (owner, 2026-10-24). Never sent. */
  turretFailures: Record<PlayerId, number>;
  /** Missed patrol-ship shots in a row per player, kept apart from the turrets' (owner, 2026-10-24); reset by a hit. Never sent. */
  patrolFailures: Record<PlayerId, number>;
  /** Who holds each title (titles.ts); null while vacant. Public: every view has the holders and the lines. */
  titles: Record<TitleId, PlayerId | null>;
  /**
   * Server time (ms) of the latest action input or tick (queue.ts); 0 before the first. The rules' only clock, for
   * deadlines such as accommodation offers. Never sent.
   */
  now: number;
}

/**
 * What a hunter is aiming at (hunters.ts): the Daedalus or a patrol ship in flight, by its room id. Players out in space
 * come with Mush auto-ejection (docs/patrol-plan.md, "Later"; owner, 2026-10-28).
 */
export type HunterTarget = { kind: "ship" } | { kind: "patrol"; id: RoomId };

/** A hunter (hunters.ts). `hitChance` (0 to 1) and `target` (null until it picks one) are never sent. */
export interface Hunter {
  id: string;
  hp: number;
  hitChance: number;
  target: HunterTarget | null;
}

/** A planet a player found. Its size is the number of sectors. */
export interface Planet {
  id: string;
  /** Generated; a proper noun, not translated. */
  name: string;
  /** Where it lies: no two planets on the ship share a direction and distance (in fuel). */
  direction: PlanetDirection;
  distance: number;
  /** In a fixed shuffled order; `known` once an analysis revealed the sector. */
  sectors: { tag: PlanetTag; known: boolean }[];
}
