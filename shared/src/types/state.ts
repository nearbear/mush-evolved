import type { BiosState } from "../bios.ts";
import type { CharacterId } from "../characters.ts";
import type { CommsState } from "../comms.ts";
import type { DrugDispenserState, DrugEffect } from "../drugs.ts";
import type { FruitEffect } from "../fruits.ts";
import type { LostAnalysisState } from "../lostAnalysis.ts";
import type { NpcState } from "../npcs.ts";
import type { TurnSide } from "../navigation.ts";
import type { PlanetDirection, PlanetTag } from "../planets.ts";
import type { ProjectId } from "../projects.ts";
import type { RelayPool, RelayStreak, ResearchPool } from "../relay.ts";
import type { RngState } from "../rng.ts";
import type { TitleId } from "../titles.ts";
import type { ItemState, LogEntry, PlayerId, RoomId } from "../types.ts";
import type { ChannelId, ChatMark, ChatMessage, ChatOutbox, ChatThread, PrivateChannel, SharedPlanet, SharedReport } from "./chat.ts";
import type { DeepReadonly, Equipment, ExpeditionEventKind, GameConfig } from "./config.ts";
import type { Plan } from "./plan.ts";
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

/**
 * The game's own data: every `GameState` field except the config (resolved from the overrides on each load), the RNG and
 * the chat outbox. Both the live game (`GameState`) and a replay frame (`FullView`) extend it, and its normalizer
 * (#384) covers it once for both.
 */
export interface GameCore {
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
  /** What each drug item type does in this ship, drawn at launch (drugs.ts). Never sent to players. */
  drugs: Record<string, DrugEffect>;
  /** What each alien fruit species does in this ship, drawn at launch (fruits.ts). Never sent to players except via `view.fruitEffects`. */
  fruits: Record<string, FruitEffect>;
  /** The Drug Dispenser's current list and whether it has been used (drugs.ts). Never sent; `view.actions` offers the viewer's own options. */
  drugDispenser: DrugDispenserState;
  log: LogEntry[];
  /** The next `LogEntry.id`. */
  nextLogId: number;
  /**
   * Each channel's open page and the page before it (the tail), in `id` order (#355, `pushChat`). Older pages are in
   * the server's storage.
   */
  chat: ChatMessage[];
  nextChatId: number;
  /** Messages ever posted in each channel, so the next `seq`. Missing means none. */
  chatSeq: Partial<Record<ChannelId, number>>;
  /** Each checklist message's ticks, by `chatMarkKey` (chat.ts). Never sent as is: views apply them to the text. */
  chatMarks: Record<string, ChatMark>;
  channels: PrivateChannel[];
  nextChannelId: number;
  /**
   * Private channels' plans (plans.ts, docs/plans/on-call.md): each channel's open plan and its latest finished ones
   * (`config.plans.finishedKept`). Members of the channel see them, without anyone's stop reason.
   */
  plans: Plan[];
  nextPlanId: number;
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
  /** The cycle each Mush last spiked, for the per-Mush spike cooldown. Hidden from everyone. */
  spikedOn: Record<PlayerId, number>;
  /** Percent done of each research that has been started (absent = 0), by research id (research.ts): the best arrangement of its verified samples (assay.ts). Only the living in the lab see it until it is complete. */
  research: Record<string, number>;
  /** Percent done of each NERON project that has been started (absent = 0), by project id (projects.ts). Offered ones and completed ones reach NERON's core; elsewhere only completed ones. */
  projects: Record<string, number>;
  /** Remaining NERON projects in draw order; the first `config.project.offerCount` unfinished ones are offered at NERON's core. Never sent. */
  projectDeck: ProjectId[];
  /**
   * Research sample pools (`research`, assay.ts) and per-project contributor streaks (`projects`, relay.ts).
   * Research contributor and value go only to the living in the lab (rolls and contamination never); project streaks never leave the server (only the computed gain range does).
   */
  relay: { research: Record<string, ResearchPool>; projects: Record<string, RelayStreak> };
  /**
   * PILGRED's repair (pilgred.ts): percent done and its relay tokens (relay.ts). Both go only to the living in a room
   * with the PILGRED terminal, the tokens as contributor and value; rolls are never sent.
   */
  pilgred: { progress: number; pool: RelayPool };
  /**
   * The communication center (comms.ts). `linked` goes to everyone; the rest only to the living at a Com center
   * terminal, read-only.
   */
  comms: CommsState;
  /** Each player's planets, found at the Astro terminal (planets.ts). Private: only the finder's own view has them, without the unknown sectors' tags. */
  planets: Record<PlayerId, Planet[]>;
  nextPlanetId: number;
  /** Planets shared in the Astrophysics feature (chat.ts, `sharePlanet`), oldest first. `planet` is never sent. */
  sharedPlanets: SharedPlanetState[];
  nextSharedPlanetId: number;
  /**
   * Expedition reports (expeditions.ts), oldest first: who went (by body), the planet's name, and what happened. Each
   * goes only to its members' views (owner, 2026-10-31).
   */
  expeditions: ExpeditionReport[];
  nextExpeditionId: number;
  /** Expedition reports shared in the Expeditions feature (sharedReports.ts), oldest first. `report` is never sent. */
  sharedReports: SharedReportState[];
  nextSharedReportId: number;
  /**
   * The expedition under way, if any (expeditions.ts, phase 2; owner, 2026-11-07): the crew is in the Icarus
   * (`config.expedition.craft`) until its last step. Who is out, the planet and when they are back are public; the
   * sectors left and the members' items are never sent.
   */
  expedition: ActiveExpedition | null;
  /**
   * The Icarus was left behind on a planet when the ship jumped without Magnetic return (`strandExpedition`, owner,
   * 2026-11-07): no more expeditions this game. Public, as the Icarus Bay is drawn empty (`out` on the Icarus).
   */
  icarusLost: boolean;
  /**
   * The ship's heading and the planet it orbits, by id, if any (navigation.ts). `orbit` is public as "in orbit or
   * not" and the planet's name (`orbitName`, owner 2026-10-31); its sectors stay its finder's. `heading` goes only to the living at a Command terminal. `arriving` is the
   * jump in progress (owner, 2026-10-29): set when the Commander travels or leaves orbit, it lasts until the next cycle
   * change, when the ship arrives (`arriveShip`, navigation.ts) and `planet` (null: empty space) becomes the orbit.
   * Only whether it is set goes out, as `traveling`; the planet stays its finder's. `lastTurn` is the latest quarter
   * turn (`n` counts them all), public to everyone aboard (owner, 2026-10-29), so every player's stars turn with the ship.
   */
  navigation: { heading: PlanetDirection; orbit: string | null; arriving: { planet: string | null } | null; lastTurn: { n: number; side: TurnSide } | null };
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
   * are known to anyone in its bay (owner, 2026-10-24); armor and charges go to its pilot only, for now. `onPlanet` is
   * the pilot who landed it on the orbited planet (owner, 2026-11-09, #359), null otherwise: it stays out, hunters can't
   * aim at it, and it is lost for good if that pilot dies before it docks. Never sent as such.
   */
  patrolShips: Record<RoomId, { armor: number; charges: number; out: boolean; destroyed: boolean; onPlanet: PlayerId | null }>;
  /**
   * Debris floating around the Daedalus (docs/plans/patrol.md, phase 5): what destroyed hunters drop and what floats off
   * a destroyed patrol ship, as items with no container. Lost when the ship jumps. Never sent, except how many pieces
   * there are, to whoever flies a patrol ship (owner, 2026-10-28).
   */
  space: SpaceDebris[];
  /** Failures in a row per player and action type, raising that action's next chance by its failure multiplier; reset by a success (action.ts; owner, 2026-11-05). Never sent. */
  failureStreaks: Record<PlayerId, Record<string, number>>;
  /** The incident pool (incidents.ts): points earned each cycle change and spent on incidents. Never sent to anyone (#189). */
  incidentPoints: number;
  /** Burning rooms (fire.ts), in the order they caught fire. Only the living in a burning room see it (`PlayerView.roomOnFire`). */
  fires: RoomId[];
  /**
   * Problems players reported (reports.ts, #444): a fire by its room, a breakdown by its equipment id, and who
   * reported it. Each lasts until the problem is fixed (`pruneReports`). Detector coverage is never stored. Sent only
   * as `PlayerView.alerts` and `burningRooms`, to the living.
   */
  reports: Report[];
  /** Rooms a Pyromaniac set to catch fire at the next cycle change (actions/ignite.ts). Never sent. */
  pendingFires: RoomId[];
  /** Who holds each title (titles.ts); null while vacant. Public: every view has the holders and the lines. */
  titles: Record<TitleId, PlayerId | null>;
  /**
   * Server time (ms) of the latest action input or tick (queue.ts); 0 before the first. The rules' only clock, for
   * deadlines such as accommodation offers. Never sent.
   */
  now: number;
}

/** Full authoritative state. Server-only: never send this to a client. */
export interface GameState extends GameCore {
  /** Read-only: the stored game keeps only its overrides and resolves this again on each load, so a write here is lost. */
  readonly config: DeepReadonly<GameConfig>;
  rng: RngState;
  /** The NPCs' own stream and queues (npcs.ts), seeded apart from `rng`. Not in the full view. */
  npcs: NpcState;
  /** Finola's lost analysis (#394): its own stream, then the rows rolled at Mush selection. Server-only until printed; not in the full view. */
  lostAnalysis: LostAnalysisState;
  /** Pages to store and delete, which the server takes after every input. Not in the full view. */
  chatOutbox: ChatOutbox;
}

/**
 * What a hunter is aiming at (hunters.ts): the Daedalus or a patrol ship in flight, by its room id. Players out in space
 * come with Mush auto-ejection (docs/plans/patrol.md, "Later"; owner, 2026-10-28).
 */
/** A problem a player reported (reports.ts, #444): a fire by its room, a breakdown by its equipment's id. `by` is the reporter. */
export type Report = { kind: "fire"; room: RoomId; by: PlayerId } | { kind: "equipment"; equipment: string; by: PlayerId };

export type HunterTarget = { kind: "ship" } | { kind: "patrol"; id: RoomId } | { kind: "hunter"; id: string };

/**
 * The kinds of hunter (owner, 2026-11-12, #388; eMush's `HunterEnum`). Permanent ids: what players see is in the
 * locales (`spider` is the Arack, `dice` the D1000).
 */
export const HUNTER_TYPES = ["hunter", "spider", "asteroid", "dice", "trax"] as const;
export type HunterType = (typeof HUNTER_TYPES)[number];

/**
 * A hunter (hunters.ts). `hitChance` (0 to 1) and `target` (null until it picks one) are never sent. `countdown` is an
 * asteroid's cycle changes left before it hits the Daedalus (null for every other kind). Its kind, hp and countdown go
 * to the living in a turret room or flying a patrol ship.
 */
export interface Hunter {
  id: string;
  type: HunterType;
  hp: number;
  hitChance: number;
  target: HunterTarget | null;
  countdown: number | null;
}

/** A shared planet's entry, with the id of the finder's planet it came from (never sent: it ties entries to planets). */
export interface SharedPlanetState extends SharedPlanet {
  planet: string;
}

/** A shared report's entry, with the id of the report it came from (never sent: only its members know which it is). */
export interface SharedReportState extends SharedReport {
  report: string;
}

/** One sector's event in an expedition report. `sector` is a planet tag, or LANDING. */
export interface ExpeditionEvent {
  sector: string;
  kind: ExpeditionEventKind;
  /** Oxygen or fuel the ship gained, items found (on the Icarus Bay's floor), or the creature's strength. */
  amount?: number;
  /** The item type found (harvest, provision, artifact, starmap) or destroyed (lostItem). */
  item?: string;
  /** A fight's creature (`expedition.creatures`). */
  creature?: string;
  /** What a won fight brought back, by item type. */
  found?: { item: string; count: number }[];
  /** A fight: the crew's strength, grenades included, how many grenades were used up, and whether the crew won. */
  fight?: { strength: number; grenades: number; won: boolean };
  /** HP each member lost, after Survival, by character. */
  hurt?: { name: CharacterId; hp: number }[];
  /** Members who died here, by character. */
  died?: CharacterId[];
  /** Who got lost (lost), was found alive (found) or dead (foundDead), stays in the Icarus without a spacesuit (noSpacesuit), or turned back (uTurn), by character. */
  who?: CharacterId;
  /** An Accident the victim was spared by an item they carry (a rope), by character and item type. */
  avoided?: { name: CharacterId; item: string };
}

/** An expedition's report (expeditions.ts). `members` are body ids; `crew` the same members by character, for display. */
export interface ExpeditionReport {
  id: string;
  members: PlayerId[];
  crew: CharacterId[];
  planet: string;
  events: ExpeditionEvent[];
  /**
   * Members who got lost on the planet, by body id: how many of `events` each still sees, up to the line where they got
   * lost (owner, 2026-11-08, #357). A member found again by the same expedition sees it all.
   */
  lostAt?: Record<PlayerId, number>;
  /** The patrol ship that landed, by its room id, for a pilot's solo landing (owner, 2026-11-09, #359); absent for the Icarus. */
  ship?: RoomId;
}

/**
 * An expedition away (expeditions.ts): its report (`ExpeditionReport.id`), the planet (by id), whether it has landed,
 * the sectors still to explore (indices, in order, drawn at takeoff), and when the next step happens (server ms).
 * `carried` is what each member set out with, by item id, for `deadKeepItems: false`. `suitless` are the members who
 * stay in the Icarus for want of a spacesuit on a planet with no Oxygen sector, fixed at takeoff: they don't explore.
 * `sabotaged` once a Traitor aboard used their Sabotage.
 */
export interface ActiveExpedition {
  report: string;
  planet: string;
  landed: boolean;
  sectors: number[];
  nextAt: number;
  carried: Record<PlayerId, string[]>;
  suitless: PlayerId[];
  /** A Traitor sabotaged it (owner, 2026-11-08, #358): from the next step on, only negative events. Never sent. */
  sabotaged: boolean;
  /**
   * The patrol ship that landed, by its room id, for a pilot's solo landing (owner, 2026-11-09, #359); null for the
   * Icarus. Its room is the craft the crew is in while away (`expeditionCraft`).
   */
  ship: RoomId | null;
}

/** A planet a player found. Its size is the number of sectors. */
export interface Planet {
  id: string;
  /** Generated; a proper noun, not translated. */
  name: string;
  /** Where it lies: no two planets on the ship share a direction and distance (in fuel). */
  direction: PlanetDirection;
  distance: number;
  /**
   * In a fixed shuffled order; `known` once an analysis revealed the sector. `explored` once an expedition explored it
   * (expeditions.ts): each sector is explored once. Never sent, not even to the finder (owner, 2026-10-31).
   */
  sectors: { tag: PlanetTag; known: boolean; explored?: true }[];
}
