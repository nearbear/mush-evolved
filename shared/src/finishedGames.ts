// The public list of finished games (#155): what `GET /api/games` sends. The server writes an entry to D1 when a game
// ends (server/src/gameStore.ts), so a game that hasn't ended is never listed. Single-player games are never on it
// (#332 lists them to their own player). An entry never holds an account ID: `name` is the player's name at the time.

import type { CharacterId } from "./characters.ts";
import type { LobbyLanguage } from "./protocol.ts";
import type { Ending, PlayerId, Role, Winner } from "./types.ts";

/** Most games one page holds; also the default. */
export const MAX_GAMES_PAGE = 20;

/** Longest `before` cursor accepted: a time, a colon, and a room ID. */
export const MAX_GAMES_CURSOR_LENGTH = 100;

/** One seat of a finished game. */
export interface FinishedCrewMember {
  /** The seat (the player, not the body: a Transfer moves a player to another character). */
  seat: PlayerId;
  /**
   * The player's name when the game was played, or null if it fails today's name moderation (as on the end screen;
   * checked when the list is read, so a filter update covers games already stored). Never translated.
   */
  name: string | null;
  isBot: boolean;
  /** The character the player started in, and the one they ended in (they differ after a Transfer). */
  startCharacter: CharacterId;
  endCharacter: CharacterId;
  /** The role when the Mush were chosen (Mush: an alpha Mush), and at the end (Mush from human: a beta Mush). */
  startRole: Role;
  endRole: Role;
  alive: boolean;
}

export interface FinishedGame {
  /** The game room's ID; a replay will be found by it (#156). */
  id: string;
  /** The lobby it was launched from; null for a game launched without one (tests). */
  language: LobbyLanguage | null;
  /** When the ship launched and when the game ended, Unix ms. */
  startedAt: number;
  endedAt: number;
  /** Cycles played, from launch. */
  cycles: number;
  winner: Winner;
  ending: Ending;
  crew: FinishedCrewMember[];
  /** A single-player game (only `GET /api/games/<id>` can return one; the list never does). Its replay page leads back to the lobby, not the list. */
  singlePlayer: boolean;
}

/**
 * `GET /api/games?before=<cursor>&limit=<n>`: finished multiplayer games, newest first. `next` is the cursor of the
 * page after this one (older games), or null when this is the last. A cursor marks a place in the list, so games
 * that end meanwhile don't shift the pages after it.
 */
export interface FinishedGamesResponse {
  games: FinishedGame[];
  next: string | null;
}

/** What the list shows for a role: Mush from the start, converted during the game, or human at the end. */
export type CrewRoleLabel = "alpha_mush" | "beta_mush" | "human";

/** By the role at the end, like the end screen; a Mush is alpha if they were Mush when the Mush were chosen. */
export function crewRoleLabel(member: Pick<FinishedCrewMember, "startRole" | "endRole">): CrewRoleLabel {
  if (member.endRole === "human") return "human";
  return member.startRole === "mush" ? "alpha_mush" : "beta_mush";
}
