import type { ActionCost, ActionTag } from "../actions.ts";
import type { CharacterId } from "../characters.ts";
import type { BiosState } from "../bios.ts";
import type { RebelBaseId, XylophEntryId } from "../comms.ts";
import type { TurnSide } from "../navigation.ts";
import type { PlanetDirection } from "../planets.ts";
import type { TitleId } from "../titles.ts";
import type { Action, BotKind, ItemId, LogEntry, LogLine, PlayerId, Role, RoomId } from "../types.ts";
import type { ChannelId, ChatLine, ChatMessage, ChatThread, PrivateChannel, SharedPlanet } from "./chat.ts";
import type { Plan } from "./plan.ts";
import type { MovementRules } from "./config.ts";
import type { ActionInProgress, PlayerState, Spot } from "./player.ts";
import type { ExpeditionReport, GameState, ShipResources } from "./state.ts";

/** Room equipment as a client sees it. */
export interface EquipmentView {
  id: string;
  type: string;
  /** Broken (breakage.ts): it does nothing until repaired. Sent only with your room's equipment, so only to those present. */
  broken?: true;
  /** Green jelly on it: cycle changes left before it breaks. Sent to living Mush only. */
  jelly?: number;
  /** Shielding (actions/reinforce.ts). Sent to living Engineers and Mush only. */
  shield?: number;
  /**
   * A patrol ship's interface whose ship is in flight, or the Icarus while away on an expedition: shown to anyone in its
   * bay, and the ship isn't drawn (owner, 2026-10-24 and 2026-11-07).
   */
  out?: true;
  /** A patrol ship's interface whose ship was destroyed (it is out for good): shown to anyone in its bay. */
  destroyed?: true;
  /** A docked patrol ship's armor, on its interface: shown to anyone in its bay (owner, 2026-10-28). Absent while it is out. */
  armor?: number;
  maxArmor?: number;
}

/** An item as a client sees it. */
export interface ItemView {
  id: ItemId;
  type: string;
  /** For a corpse: whose body it is (the dead are public, and the world already draws them). */
  of?: PlayerId;
  /** For a blueprint: which recipe it carries (the blueprint is public to whoever can see the item). */
  builds?: string;
  /** For a microwave: express cooks left (public to whoever can see the item, like its type). */
  charges?: number;
  /** For a skill book: the skill it teaches (public to whoever can see the item). */
  teaches?: string;
  /** Broken: it can't be used until repaired. Public to whoever can see the item, like its type. */
  broken?: true;
  /** Green jelly on it: cycle changes left before it breaks. Sent to living Mush only. */
  jelly?: number;
  /** Shielding (actions/reinforce.ts). Sent to living Engineers and Mush only. */
  shield?: number;
  /** In your room's storage: you hid it, and nobody else can see it (actions/hide.ts). */
  hidden?: true;
  /** For a food item trapped with Fungal cuisine: its contamination level. Sent to living Mush only. */
  spores?: number;
  /** For a planted hydropot. `sick` is there only for the Botanist role; everyone else never gets the field. */
  plant?: { species: string; age: number | null; thirst: 0 | 1 | 2; sick?: boolean };
}

/** One seat as the end screen shows it, once the game has ended (#191). Everyone, you included, in seat order. */
export interface CrewReveal {
  id: PlayerId;
  /** The account's name after moderation (`moderateName`); null when nothing of it survives. */
  name: string | null;
  isBot: boolean;
  botKind?: BotKind;
  character: CharacterId;
  role: Role;
  alive: boolean;
}

export interface OtherPlayerView {
  id: PlayerId;
  /** No `name`: people are known only by character until the game ends. */
  isBot: boolean;
  botKind?: BotKind;
  character: CharacterId;
  /** Absent when you can't tell where this person is (ACTOPI off, and they aren't in your room). */
  room?: RoomId;
  alive: boolean;
  ready: boolean;
  /** Ids of the statuses everyone can see on this person (public ones only; see statuses.ts). */
  statuses: string[];
  /** The bed (equipment id) they are lying in. Public to anyone in your room (empty for people elsewhere). */
  lying?: string;
  /** Where they stand in the room (spot.ts). Public to anyone in your room (empty for people elsewhere). */
  spot?: Spot;
  /** Who is pushing their wheelchair. Public to anyone in your room (empty for people elsewhere). */
  pushedBy?: PlayerId;
  /** Skills they have chosen. Public to anyone in your room (empty for people elsewhere). */
  skills: string[];
  /** The skill in their book slot, learned from a book. Public to anyone in your room (absent for people elsewhere). */
  bookSkill?: string;
  /** Their contamination, shown as a status. Only when you are Mush, they are a contaminated human, and they are in your room. */
  contamination?: number;
  /**
   * The bar of the timed action they are busy with (server ms), never which action. Only for people in your room, and
   * only when the action's log entry could reach you (`activitySeen` in log.ts).
   */
  busy?: { since: number; until: number };
}

/** What one seat is allowed to know. This is the only game data a client or bot receives. */
/** The slice of `GameConfig` sent to every client. Same for everyone, so nothing hidden. */
export interface PublicConfig {
  /** MP added to each move while carrying a heavy item (before modifiers). */
  heavyMpPenalty: number;
  /** How many actions may wait behind the one under way. */
  actionQueueCap: number;
  /** Whether walks are shared with roommates (spot.ts). Off, the client keeps walking to itself and sends nothing. */
  sharedSpots: boolean;
  /** The setup this ship launched with (public by design), or null; the client looks up its name by id (#237). */
  setupId: string | null;
  /** AP the Command terminal's Sol and Eden buttons cost, so the greyed-out ones can show it. */
  returnToSolAp: number;
  edenAp: number;
  xylophAp: number;
  /**
   * Base AP prices of the actions a bot plans to walk to (server/src/bots/goals/), before modifiers and free skill points:
   * a bot sees a real price only for actions in its own room. Never used to work out legality.
   */
  researchAp: number;
  projectAp: number;
  pilgredAp: number;
  hullRepairAp: number;
  turretAp: number;
  /** A patrol ship's takeoff, landing and one shot (`patrol` in config.ts): a pilot bot keeps the landing's AP while it flies. */
  takeoffAp: number;
  landAp: number;
  patrolShotAp: number;
  showerAp: number;
  lieDownAp: number;
  waterAp: number;
  sowAp: number;
  cookAp: number;
  scanAp: number;
  astrophysicistScanDiscount: number;
  analyzeAp: number;
  orbitAnalyzeAp: number;
  contactSolAp: number;
  rebelAp: number;
  neronAp: number;
  /** The garden (`botany.gardenRoom`): where garden points pay, and where bots look for plants and bananas. */
  gardenRoom: RoomId;
}

/**
 * Your own state, minus your account name (nobody's name is in a view while the game runs) and what is never sent to
 * you (your mind, Transfer use, action history, when you were last seen, the raw inactivity field); the queue is plain
 * actions (the recorded adjustments stay on the server).
 */
export type YouView = Omit<PlayerState, "name" | "mind" | "transferUsed" | "history" | "current" | "queue" | "lastSeenAt" | "inactivity"> & { current: ActionInProgress | null; queue: Action[] };

export interface PlayerView {
  you: YouView;
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
  /** Mush haven't been chosen yet; the ship is still taking crew. */
  preselection: boolean;
  /** Who won, once the game has ended; null while playing. */
  winner: GameState["winner"];
  /** How it ended (Sol, Eden, or the last human dead); null while playing. */
  ending: GameState["ending"];
  /** Every seat's name, character, role and fate, only once the game has ended; null while playing. */
  crew: CrewReveal[] | null;
  rooms: Readonly<Record<RoomId, readonly RoomId[]>>;
  /** What you carry. Other players' inventories are never sent. */
  inventory: ItemView[];
  /** Your inventory size, after modifiers. */
  inventorySlots: number;
  /** Items stored in the room you are in. Other rooms' items are never sent. */
  roomItems: ItemView[];
  /** Equipment in the room you are in. */
  roomEquipment: EquipmentView[];
  /** Whether the room you are in is on fire (fire.ts). Only the living in a burning room learn it; the crew-wide notice names no room. */
  roomOnFire: boolean;
  /** Burning rooms revealed ship-wide once the Fire Detectors project is complete. Only to the living. */
  burningRooms: RoomId[];
  /**
   * History of the room you are in (public entries) plus every entry private
   * to you. Other rooms' public history is never sent. Without ids: they come from one counter per game, so a gap
   * would show that a line you can't see was written (for example a witness's view skipping a conversion).
   */
  log: LogLine[];
  /**
   * How many log lines you have ever been able to see, those that have left the window since included (#365). The
   * client compares it with the last one to find the new lines at the end of `log`. It counts only lines you saw.
   */
  logSeen: number;
  /**
   * Messages in `readChannels`: each one's open page and the page before it (#355). Older pages come by request. No
   * `id` (`ChatLine`).
   */
  chat: ChatLine[];
  /** Messages ever posted in each of `readChannels`, so its pages and its newest `seq`. Missing means none. */
  chatCounts: Partial<Record<ChannelId, number>>;
  /** Channels you may post to right now. */
  chatChannels: ChannelId[];
  /** Channels you may read: `chatChannels`, or for the dead the public ones (and the Mush channel for a dead Mush). */
  readChannels: ChannelId[];
  /** Private channels you belong to. Channels you aren't in are never sent. */
  privateChannels: PrivateChannel[];
  /**
   * Plans of the private channels you belong to (plans.ts): the open one and the latest finished ones. Holders are
   * members, known to members; why a summoned holder stopped is only in that holder's own log.
   */
  plans: Plan[];
  /** Threads under global chat, when you can read it. */
  threads: ChatThread[];
  /** Planets shared in the Astrophysics feature, oldest first, when you can read it. Never which planet each came from. */
  sharedPlanets: SharedPlanet[];
  /** How many private channels you may belong to, after modifiers. */
  channelLimit: number;
  /** Your effective movement rules, after modifiers. */
  movement: MovementRules;
  maxMp: number;
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
  /**
   * The ship's oxygen, fuel, hull and plasma shield, public to everyone (owner, 2026-10-19), with their caps. Not the
   * combustion chamber's level: nobody sees it, the Commander included, except by checking the chamber (owner, 2026-10-28).
   */
  ship: Omit<ShipResources, "combustion"> & { max: Omit<ShipResources, "combustion"> };
  /**
   * Percent done of each research that has been started: all of them while you are alive in the lab, otherwise only the
   * completed ones (owner, 2026-10-31; relayView.ts).
   */
  research: Record<string, number>;
  /**
   * Which of each research's requirements the lab meets (`researchNeedsMet`, in `researchNeedOrder`'s order), counting
   * items carried by anyone there and a drawn ZONG_CHUN_SAMPLE (owner, 2026-10-28). Only while you are alive in a room
   * with a research terminal; otherwise null. Researches with no requirements are left out.
   */
  researchNeeds: Record<string, boolean[]> | null;
  /** Percent done of each NERON project that has been started: all of them while you are alive at NERON's core, otherwise only the completed ones (owner, 2026-10-31). */
  projects: Record<string, number>;
  /** PILGRED's repair, percent done, only while you are alive in a room with its terminal (owner, 2026-10-21); otherwise null. */
  pilgred: number | null;
  /**
   * The relay token pools (relay.ts) of the targets whose room you are alive in: every research in the lab, every project
   * at NERON's core, PILGRED at its terminal. Empty (or null) elsewhere.
   */
  relay: { research: Record<string, RelayTargetView>; projects: Record<string, RelayTargetView>; pilgred: RelayTargetView | null };
  /** How many relay tokens you have made on each target, wherever you are (your own information). Targets you never worked on are left out. */
  yourTokens: { research: Record<string, number>; projects: Record<string, number>; pilgred: number };
  /** Whether PILGRED is repaired, public to everyone: its completion is announced to the whole crew (repair_pilgred.ts). */
  pilgredRepaired: boolean;
  /** Whether a Mush has died on the ship (public): the human_tank in Sick Bay shows a person in it. */
  humanTankFull: boolean;
  /**
   * The communication center. `linked` (the link with Sol) is public; `terminal`, what the Com center terminal shows
   * read-only to anyone, only while you are alive in a room with one (owner, 2026-10-21), otherwise null.
   */
  comms: { linked: boolean; terminal: CommsTerminalView | null };
  /** NERON's BIOS settings, read-only, only while you are alive in a room with a BIOS terminal (owner, 2026-10-21); otherwise null. */
  bios: BiosState | null;
  /**
   * Hunters attacking the ship (owner, 2026-10-24): how many, to everyone. `list` (each hunter's hp) only while you are
   * alive in a turret room or flying a ship (owner, 2026-10-28); `turrets` (charges by turret equipment id) only while
   * you are alive in a turret room. Otherwise null.
   */
  hunters: { count: number; list: { id: string; hp: number }[] | null; turrets: Record<string, number> | null };
  /**
   * Reports of the expeditions you went on, oldest first, while you are alive (owner, 2026-10-31): nobody else's, and
   * without the members' seat ids (the crew is by character).
   */
  expeditions: ExpeditionReportView[];
  /**
   * The expedition under way, public to everyone (owner, 2026-11-07): who is out, by character, the planet's name, and
   * when they are back (server ms; if every member dies the crew is back at once and this is null). `report` is its report's id, only for a
   * living member, whose view holds it in `expeditions`.
   */
  expedition: { crew: CharacterId[]; planet: string; returnAt: number; report?: string } | null;
  /** Your own planets (private, owner 2026-10-19). Unknown sectors are null: their tags are never sent. */
  planets: PlanetView[];
  /** Whether you may share your planets in the Astrophysics feature now (sharedPlanets.ts): alive at an Astro terminal with an iTrackie. */
  canSharePlanets: boolean;
  /** How many planets one player can hold (a config constant, public). */
  maxPlanets: number;
  /**
   * Whether the ship is in orbit, public to everyone (the planet fills the portholes), with the planet's name
   * (`orbitName`, owner 2026-10-31); its sectors are only in its finder's `planets`; `orbitPicture` is only which picture it is drawn with (`planetPicture`, cosmetic, owner 2026-10-28),
   * so everyone sees the same planet out of the window. `heading` only while you are alive at a Command terminal (owner, 2026-10-22); otherwise null.
   * `lastTurn` is the ship's latest quarter turn (`n` counts them, so a new one shows), public to everyone aboard (owner, 2026-10-29).
   */
  navigation: { orbiting: boolean; traveling: boolean; orbitPicture: number | null; orbitName: string | null; heading: PlanetDirection | null; lastTurn: { n: number; side: TurnSide } | null };
  /**
   * The patrol ship you are flying (its room id) with its armor and charges (null for the Pasiphae, which can't shoot),
   * while you are alive aboard (patrol.ts); otherwise null. `debris` is how many pieces float around the Daedalus, not
   * which (owner, 2026-10-28).
   */
  patrolShip: { id: string; armor: number; maxArmor: number; charges: number | null; debris: number } | null;
  /** Every title in `TITLE_IDS` order, public to everyone (owner, 2026-10-20). */
  titles: TitleView[];
  /**
   * Everything you could do right now, plus what you could do if you had the AP or MP (so the client can show
   * it disabled and say why). Affordable ones come first. Only candidates on things you can already see, so
   * nothing hidden is revealed. The client never computes legality; it reads this.
   */
  actions: ActionOption[];
}

/** One action you are offered: what it costs, its chance of success, and which of your points fall short. */
/** One pooled target as seen from its room (relayView.ts). */
export interface RelayTargetView {
  /** Progress held back only for lack of other contributors (docs/plans/relay-tokens.md). */
  waiting: number;
  /** How much the target goes up if you contribute now, over your token's roll. */
  gain: { min: number; max: number };
  /**
   * Its tokens in the order they were made: who made each and what it is worth in the best arrangement. A research's
   * are samples: verified ones first, then `pending` ones waiting for the next assay (docs/plans/research-sabotage.md).
   */
  tokens: { by: PlayerId; value: number; pending?: true }[];
  /** Research only: the striped segment, how much the pending samples add above verified progress if they all pass. */
  pending?: number;
}

export interface ActionOption {
  action: Action;
  cost: ActionCost;
  /** 0 to 1. */
  chance: number;
  /** What kind of action it is (aggressive, spore), so the UI can mark it. Fixed per action type. */
  tags: ActionTag[];
  /** Empty when you can do it now; otherwise the points, the inventory space, or the cleanliness ("clean": you are dirty) you lack. See `affordable`. */
  lacks: ("ap" | "mp" | "space" | "cooldown" | "capacity" | "clean")[];
  /** Cycles until it is ready, when `lacks` has "cooldown". */
  cooldown?: number;
}

/** One of your planets as you see it: `null` for a sector no analysis has revealed yet. */
export interface PlanetView {
  id: string;
  name: string;
  direction: PlanetDirection;
  /** In fuel. */
  distance: number;
  sectors: (string | null)[];
  /** True for the planet the ship orbits; absent otherwise. */
  orbited?: true;
}

/** A title as everyone sees it: who holds it, by character (null while vacant), and its line of succession as it stands on this ship. */
export interface TitleView {
  id: TitleId;
  holder: CharacterId | null;
  /** The crew aboard (dead included), in order of succession. */
  line: CharacterId[];
}

/** The Com center terminal's read-only screen. */
export interface CommsTerminalView {
  /** The ship's chance (percent) of establishing the link, before Radio Expert. */
  solChance: number;
  /** Every rebel call so far: `open` (can be decoded), `contacted` (reached, bonus in effect) or `lost` (expired). */
  rebels: { base: RebelBaseId; progress: number; status: "open" | "contacted" | "lost"; expiresAt: number }[];
  /** The next base to call and the cycle it does so (the schedule is fixed); absent before the first call or once all have called. */
  nextRebel?: { base: RebelBaseId; at: number };
  /** How many Xyloph entries are left to draw. */
  xylophLeft: number;
  /** The entries drawn so far, in database order (not draw order), for the terminal's grid of deciphered cells. */
  xylophFound: XylophEntryId[];
  neron: { version: number; progress: number };
}

/** An expedition report as its members see it (expeditions.ts). */
export type ExpeditionReportView = Omit<ExpeditionReport, "members"> & {
  /** Still under way: more steps to come (phase 2). */
  away?: true;
};

/**
 * A seat's view with its log lines' and chat messages' ids, for the replay only (`perspective`, `seatViewFor`):
 * click-to-jump and paging key lines by id. A live view never carries them (see `PlayerView.log`, `ChatMessage.id`). Its own type rather than an optional `id` on
 * the live one, so a live view can't be filled with ids by mistake.
 */
export interface SeatView extends Omit<PlayerView, "log" | "chat"> {
  log: LogEntry[];
  chat: ChatMessage[];
}
