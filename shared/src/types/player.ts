import type { ActopiCheat, Cheat } from "../cheats.ts";
import type { Role, RoomId, Seat } from "../types.ts";

export type ResourceId = "eng" | "exp" | "comp" | "garden" | "core" | "shoot" | "cook" | "heal" | "pilgred";

export interface PlayerState extends Seat {
  role: Role;
  /** Mush chosen at the start ("alpha"; later infections are "beta"). Player terminology only; no mechanics use it. */
  alpha: boolean;
  room: RoomId;
  ap: number;
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
  /** Development cheats switched on (cheats.ts). Always empty unless the server allows cheats. Only in your own view. */
  cheats: Cheat[];
  /** Development cheat: overrides ACTOPI for what this player sees only. The game's ACTOPI is unchanged. */
  actopiCheat: ActopiCheat;
}
