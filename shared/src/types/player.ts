import type { ActopiCheat, Cheat } from "../cheats.ts";
import type { Action, PlayerId, Role, RoomId, Seat } from "../types.ts";

export type ResourceId = "eng" | "exp" | "comp" | "garden" | "core" | "shoot" | "cook" | "heal" | "pilgred";

export interface ActionInProgress {
  action: Action;
  since: number;
  until: number;
}

/** How far modifiers moved an action's price (`Action.adjustment`), recorded when it was queued. */
export interface CostAdjustment {
  ap: number;
  mp: number;
}

/**
 * A queued action and the modifier adjustment its price had when the player queued it. If the adjustment is
 * different when its turn comes (Ian walked in), it is cancelled rather than charging a surprise (owner, 2026-10-18).
 */
export interface QueuedAction {
  action: Action;
  adjustment: CostAdjustment;
}

/**
 * Where someone stands in their room (spot.ts): a floor cell of the room's layout (sitting on the chair there, if
 * `sitting`), or in front of the door from the room `door` (they came in by it and haven't walked off).
 */
export type Spot = { x: number; y: number; sitting?: true } | { door: RoomId };

export interface PlayerState extends Seat {
  role: Role;
  /** Mush chosen at the start ("alpha"; later infections are "beta"). Player terminology only; no mechanics use it. */
  alpha: boolean;
  room: RoomId;
  /** Where you stand in `room` (spot.ts). Unset until you walk or move: the client spreads such people out. Public to your room (`OtherPlayerView.spot`). */
  spot?: Spot;
  ap: number;
  /** The bed (equipment id) you are lying in, while you have the `lying_down` modifier. Public to your room (`OtherPlayerView.lying`). */
  lyingIn?: string;
  /** Who is pushing your wheelchair (accommodate.ts). Public to your room (`OtherPlayerView.pushedBy`, the `accommodated` status). */
  pushedBy?: PlayerId;
  /**
   * Who has offered to push your wheelchair, for you to accept, and the server time (ms) each offer expires. Your
   * own view only (the offers themselves are in the room log).
   */
  accommodationOffers?: { by: PlayerId; until: number }[];
  /** Movement points. Start at 0; topped up by converting AP when moving. */
  mp: number;
  /** Health points. Private: only in your own view. Nothing changes them yet. */
  hp: number;
  /** Morale points. Private: only in your own view. Lose `moralePerDay` at the end of each day. */
  morale: number;
  /** Satiety (humans only; Mush stay at 0 and never get hungry). Never below 0. Private: only in your own view. */
  satiety: number;
  /** The cycle satiety last reached 0 (or the game began at 0); null while satiety is above 0 or for Mush. Counts toward hunger. */
  satietyZeroSince: number | null;
  /** Stored status effects (statuses.ts); full belly and hungry are derived from satiety, so only `dirty` is stored for now. */
  statuses: string[];
  /** First cycle the player is no longer immune to infection (antic_perfume); unset or past means not immune. Private: your own view only, as the `immune` status. */
  immuneUntil?: number;
  /** Spores this player carries. Only Mush ever gain any; visible in your own view only (teammates' counts will be shown to Mush later). */
  spores: number;
  /** Extra point counters (resources.ts). Private: only in your own view. Nothing earns or spends them yet. */
  resources: Record<ResourceId, number>;
  /**
   * Ids of active rule modifiers (from items, skills, statuses). Resolved
   * against the registry in modifiers.ts; state holds ids only so it stays JSON.
   */
  modifiers: string[];
  /**
   * Skill ids in the player's human skill slots (SKILL_SLOTS; a book slot comes later). Each is a modifier id in
   * modifiers.ts. Picked for good with the `pick_skill` action. Roommates see them in `OtherPlayerView.skills`.
   */
  skills: string[];
  alive: boolean;
  /** Finished acting for this cycle. */
  ready: boolean;
  /**
   * The timed action under way (queue.ts), from `since` to `until` in server ms. Roommates see only its bar, and only
   * when its log entry could reach them (`OtherPlayerView.busy`); the action itself is in your own view only.
   */
  current: (ActionInProgress & QueuedAction) | null;
  /** Actions waiting behind `current`, oldest first, at most `config.action.queueCap`. Your own view only. */
  queue: QueuedAction[];
  /** Development cheats switched on (cheats.ts). Always empty unless the server allows cheats. Only in your own view. */
  cheats: Cheat[];
  /** Development cheat: overrides ACTOPI for what this player sees only. The game's ACTOPI is unchanged. */
  actopiCheat: ActopiCheat;
}
