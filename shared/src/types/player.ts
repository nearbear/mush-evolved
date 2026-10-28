import type { ActopiCheat, Cheat } from "../cheats.ts";
import type { CharacterId } from "../characters.ts";
import type { Action, PlayerId, Role, RoomId, Seat } from "../types.ts";
import type { DiseaseTracker } from "../adjustStats.ts";

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
  /**
   * The seat (the player: account, seat token, bot) playing this body, by the id of the body it started in. Equal to
   * `id` until a Mush's Transfer swaps two bodies' minds (body_transfer.ts); the server resolves tokens through it
   * (`bodyOf`). Never sent.
   */
  mind: PlayerId;
  /** The Mush in this mind has used Transfer (one use per game); moves with the mind. Never sent. */
  transferUsed?: true;
  /**
   * Set on a Transfer's victim, in their new body: the character who took their old body, for the pop-up they must
   * acknowledge (`acknowledgeTransfer`). Your own view only.
   */
  bodyTakenBy?: CharacterId;
  role: Role;
  /** Mush chosen at the start ("alpha"; later infections are "beta"). Player terminology only; no mechanics use it. */
  alpha: boolean;
  room: RoomId;
  /** Where you stand in `room` (spot.ts). Unset until you walk or move: the client spreads such people out. Public to your room (`OtherPlayerView.spot`). */
  spot?: Spot;
  ap: number;
  /**
   * AP claimed plan jobs hold (docs/action-plans.md): still part of `ap`, so the cycle gain's cap counts it, but live
   * actions can't spend it (`freeAp`). Private: only in your own view. Nothing locks AP yet.
   */
  lockedAp: number;
  /** The bed (equipment id) you are lying in, while you have the `lying_down` modifier. Public to your room (`OtherPlayerView.lying`). */
  lyingIn?: string;
  /** Who is pushing your wheelchair (accommodate.ts). Public to your room (`OtherPlayerView.pushedBy`, the `accommodated` status). */
  pushedBy?: PlayerId;
  /** The Persecutor whose Anathema made this player an Outcast (anathema.ts). Never sent; the public `outcast` status is. */
  outcastBy?: PlayerId;
  /** True once the Motivator has given today's Boring speech (speech.ts); cleared at day start. Never sent. */
  boringToday?: boolean;
  /** The Fertile skill's free spore extraction was used today (reset each day; moves with the mind in a Transfer). */
  fertileToday?: boolean;
  /** True once this player has chitchatted with a Confident today (chitchat.ts); cleared at day start. Never sent. */
  chitchatToday?: boolean;
  /** True once the Torturer has interrogated someone today (interrogate.ts); cleared at day start. Never sent. */
  interrogatedToday?: boolean;
  /**
   * This body's recent actions, oldest first (history.ts): action types only, capped. It stays with the body in a
   * Transfer (owner, 2026-10-24). Never sent, not even to the owner; Interrogate and Chitchat reveal parts of it.
   */
  history: string[];
  /**
   * Who has offered to push your wheelchair, for you to accept, and the server time (ms) each offer expires. Your
   * own view only (the offers themselves are in the room log).
   */
  accommodationOffers?: { by: PlayerId; until: number }[];
  /** Movement points. Start at 0; topped up by converting AP when moving. */
  mp: number;
  /** Health points. Private: only in your own view. Nothing changes them yet. */
  hp: number;
  maxHp: number;
  /** Morale points. Private: only in your own view. Lose `moralePerDay` at the end of each day. */
  morale: number;
  maxMorale: number;
  /** Satiety (humans only; Mush stay at 0 and never get hungry). Never below 0. Private: only in your own view. */
  satiety: number;
  /** The cycle satiety last reached 0 (or the game began at 0); null while satiety is above 0 or for Mush. Counts toward hunger. */
  satietyZeroSince: number | null;
  /** Stored status effects (statuses.ts); full belly and hungry are derived from satiety, so only `dirty` is stored for now. */
  statuses: string[];
  /** Disease Trackers, these store the progress of a disease healing */
  diseaseTrackers: DiseaseTracker[];
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
   * Skill ids in the player's human skill slots (SKILL_SLOTS). Each is a modifier id in
   * modifiers.ts. Picked for good with the `pick_skill` action. Roommates see them in `OtherPlayerView.skills`.
   */
  skills: string[];
  /** The skill in the book slot (the fourth), learned for good from a skill book (`read_book`). Unset until then. Roommates see it in `OtherPlayerView.bookSkill`. */
  bookSkill?: string;
  /**
   * Mush skill ids in the Mush skill slots (MUSH_SKILL_SLOTS), picked for good with `pick_skill` while Mush. Each is a
   * modifier id too. Private: only in your own view, never to roommates or other Mush.
   */
  mushSkills: string[];
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
