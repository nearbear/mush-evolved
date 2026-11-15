// The shapes of bot goals (docs/plans/bot-goals.md). A goal is something a bot follows through over several turns (walk
// to a bed and rest, walk to the lab and research) instead of choosing one action at a time. Goals are pure: the bot's
// own view and memory in, one step out, so they are tested without a server or a model.

import type { FireMemory } from "../fireShare.ts";
import type { TankMemory } from "../tankShare.ts";
import type { ItemMemory } from "../itemShare.ts";
import type { JumpMemory } from "../planetShare.ts";
import type { ReportMemory } from "../reportShare.ts";
import type { Action, GameClientMessage, LobbyLanguage, PlanetDirection, PlayerView, RoomId } from "@mush2/shared";

/**
 * A message a goal sends that isn't an action (#417, #421): sharing a planet, sharing an expedition report, a
 * global-chat signal, creating a private channel, or posting a plan. It goes through the same path as a person's
 * (`GameRoom.social`: rate limit, moderation, the rules), and is recorded like one.
 */
export type BotSocial = Extract<GameClientMessage, { type: "sharePlanet" | "shareReport" | "chat" | "createChannel" | "postPlan" }>;

/** What an expedition goes for: an Oxygen sector or a Hydrocarbon sector (owner, 2026-11-12, #417). */
export type ExpeditionKind = "oxygen" | "fuel";

export type GoalStep =
  | { kind: "act"; action: Action }
  /** Send a message that isn't an action; the goal carries on next turn. */
  | { kind: "social"; message: BotSocial }
  /** Nothing to do until the next change: the bot ends its cycle when End cycle is on, otherwise waits. */
  | { kind: "wait" }
  /** Finished. `again`: it may be chosen again this cycle (a work goal stopped only because the bot got dirty). */
  | { kind: "done"; again?: true }
  | { kind: "failed"; reason: string };

/**
 * What a bot remembers: only what the bot saw itself, never in game state, the record or a view. Saved in room storage
 * per seat (`memoryStore.ts`, #440), so a restart keeps it; a field added here needs a place in `BotMemorySnapshot`.
 */
export interface BotMemory {
  /** AP kept for emergencies: work goals stop rather than spend it (`BOT_AP_RESERVE`). */
  readonly reserve: number;
  /**
   * Whether goals are chosen by priority (a bot without a model key) rather than by a model. Some goals are offered to
   * a scripted bot only with more AP to spare (owner, 2026-11-01: shooting hunters), since it can't weigh them.
   */
  readonly scripted: boolean;
  /** The ship's language (#95): what names in goal labels are written in. Rooms stay ids in labels; the prompt names them. */
  readonly language: LobbyLanguage;
  /** Keys of the goals that finished or failed this cycle; they aren't offered again until the next one. */
  readonly ended: Set<string>;
  /** Keys of once-a-day jobs done today (tending the garden); cleared when the day changes. */
  readonly today: Set<string>;
  /** Keys of once-a-game jobs done (checking Front Storage for hydropots, `setOutPots`). */
  readonly once: Set<string>;
  /** Rooms the bot has stood in this cycle. */
  readonly visited: Set<RoomId>;
  /** Players known to be a Shrink (seen in a room or announced in chat); `you.id` means this Shrink has spoken in global chat. */
  readonly shrinks: Set<string>;
  /**
   * What the ship last went to one of this Astrophysicist's planets for (seen when it orbits one), so the next choice
   * alternates (owner, 2026-11-12, #417). Null until then.
   */
  lastExpedition: ExpeditionKind | null;
  /**
   * The public hunter count when this bot last saw a hunter list of nothing but asteroids (at a turret or in flight),
   * else null: bots don't shoot asteroids, so the hunter goals stay off while the count is unchanged (`onlyAsteroids`).
   */
  asteroidsOnly: number | null;
  /** Where shared item types lie, from what the bot saw and what bots said in global chat (`itemShare.ts`). */
  readonly items: ItemMemory;
  /** Which rooms burn and which a search has cleared, from what the bot saw and what bots said (`fireShare.ts`, #429). */
  readonly fires: FireMemory;
  /** Which oxygen tanks are broken, suspected or claimed, from the alert bar, NERON and bots' lines (`tankShare.ts`, #443). */
  readonly tanks: TankMemory;
  /** Last fuel reading the Commander saw in the combustion chamber (`null` if unknown or cleared by traveling, #421). */
  combustion: number | null;
  /** Cycle when the Commander started holding the jump (`null` when not holding, #421); `"Jump: off"` clears it. */
  holdSince: number | null;
  /** The Commander's jump lines in global chat, folded in as read (`planetShare.ts`, #427). */
  readonly jump: JumpMemory;
  /** Explored sectors from shared expedition reports, and which reports were seen or shared (`reportShare.ts`). */
  readonly reports: ReportMemory;
  /** Last heading seen on a Command terminal (`null` until visited, #421). */
  heading: PlanetDirection | null;
  /** True when the Commander jumped or gave up while holding and still needs to post `"Jump: off"` (#421). */
  cancelHold: boolean;
  /** True right after a jump so `travel` finishes once `"Jump: off"` is posted (#421). */
  justJumped: boolean;
  /** Failure reason saved while `"Jump: off"` is posted before failing `travel` (#421). */
  failedReason: string | null;
  /** A seeded roll in [0, n), for choices with no better reason (the bot's own RNG, never `Math.random`). */
  roll(n: number): number;
}

export interface Goal {
  id: string;
  /** The id plus its parameters, e.g. "rest:BEDROOM_A": what "ended this cycle" remembers. */
  key: string;
  /**
   * What the model's goal list shows (English, built from the bot's own view; no player-written text). Rooms are named
   * by id here (`where`), and `buildPrompt` shows them by name; anything else is named in `BotMemory.language`.
   */
  label: string;
  /** One action toward the goal, or what happened. Reads only the bot's own view and the goal's own progress. */
  step(view: PlayerView, memory: BotMemory): GoalStep;
  /** Whether to keep following this goal when a new cycle starts (default: false). */
  keepAcrossCycle?(view: PlayerView, memory: BotMemory, newDay: boolean, goals: readonly GoalDef[]): boolean;
  /** Called when an interrupt (a chat choice or losing HP) drops this goal before the cycle ends. */
  onInterrupt?(memory: BotMemory): void;
}

export interface GoalDef {
  id: string;
  /**
   * Higher goes first for a bot without a key; ties break with the bot's RNG. A plain number: when a goal applies is
   * decided by `options`, so its rank doesn't need the view.
   */
  priority: number;
  /** The forms of this goal open to the bot now, at most one or two. Empty when it doesn't apply. */
  options(view: PlayerView, memory: BotMemory): Goal[];
}
