import type { ActionCost, ActionTag } from "../actions.ts";
import type { CharacterId } from "../characters.ts";
import type { BiosState } from "../bios.ts";
import type { RebelBaseId } from "../comms.ts";
import type { TitleId } from "../titles.ts";
import type { Action, BotKind, ItemId, LogEntry, PlayerId, Role, RoomId } from "../types.ts";
import type { ChannelId, ChatMessage, ChatThread, PrivateChannel } from "./chat.ts";
import type { MovementRules } from "./config.ts";
import type { ActionInProgress, PlayerState, Spot } from "./player.ts";
import type { GameState, ShipResources } from "./state.ts";

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
  /** For a microwave: express cooks left (public to whoever can see the item, like its type). */
  charges?: number;
  /** For a skill book: the skill it teaches (public to whoever can see the item). */
  teaches?: string;
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
}

/** Your own state, minus your account name (nobody's name is in a view while the game runs). */
/** Your own state, minus your account name; the queue is plain actions (the recorded adjustments stay on the server). */
export type YouView = Omit<PlayerState, "name" | "current" | "queue"> & { current: ActionInProgress | null; queue: Action[] };

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
  /** Who won, once the game has ended; null while playing. */
  winner: GameState["winner"];
  /** How it ended (Sol, Eden, or the last human dead); null while playing. */
  ending: GameState["ending"];
  /** Every seat's name, character, role and fate, only once the game has ended; null while playing. */
  crew: CrewReveal[] | null;
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
  /** Threads under global chat, when you can read it. */
  threads: ChatThread[];
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
  /** The ship's oxygen, fuel, hull and plasma shield, public to everyone (owner, 2026-10-19), with their caps. */
  ship: ShipResources & { max: ShipResources };
  /** Percent done of each research that has been started, public to everyone (decided 2026-10-16). */
  research: Record<string, number>;
  /** Percent done of each NERON project that has been started, public to everyone (decided 2026-10-18). */
  projects: Record<string, number>;
  /** PILGRED's repair, percent done, only while you are alive in a room with its terminal (owner, 2026-10-21); otherwise null. */
  pilgred: number | null;
  /**
   * The communication center. `linked` (the link with Sol) is public; `terminal`, what the Com center terminal shows
   * read-only to anyone, only while you are alive in a room with one (owner, 2026-10-21), otherwise null.
   */
  comms: { linked: boolean; terminal: CommsTerminalView | null };
  /** NERON's BIOS settings, read-only, only while you are alive in a room with a BIOS terminal (owner, 2026-10-21); otherwise null. */
  bios: BiosState | null;
  /** Your own planets (private, owner 2026-10-19). Unknown sectors are null: their tags are never sent. */
  planets: PlanetView[];
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
export interface ActionOption {
  action: Action;
  cost: ActionCost;
  /** 0 to 1. */
  chance: number;
  /** What kind of action it is (aggressive, spore), so the UI can mark it. Fixed per action type. */
  tags: ActionTag[];
  /** Empty when you can do it now; otherwise the points you lack. See `affordable`. */
  lacks: ("ap" | "mp")[];
}

/** One of your planets as you see it: `null` for a sector no analysis has revealed yet. */
export interface PlanetView {
  id: string;
  name: string;
  sectors: (string | null)[];
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
  /** How many Xyloph entries are left to draw. Which were drawn is only in the drawer's own log. */
  xylophLeft: number;
  neron: { version: number; progress: number };
}
