// Finished games in D1 (#155). The schema is server/migrations/0004_games.sql; the routes are `GET /api/games` (auth.ts)
// and `GET /api/games/<id>` (one game, replayRoutes.ts).
//
// A room writes its game once it has ended (GameRoom's `recordFinished`). The write isn't atomic with the room's own
// storage, so it is idempotent (INSERT OR IGNORE on the primary keys) and the room retries it until it succeeds.
// `finishedEntry` builds the rows, and only from an ended game, so a running game can't be listed by construction.
// The public list leaves out single-player games and never sends an account ID.

import {
  type CharacterId,
  type Ending,
  type FinishedCrewMember,
  type FinishedGame,
  type GameState,
  LOBBY_LANGUAGES,
  type LobbyLanguage,
  MAX_GAMES_CURSOR_LENGTH,
  MAX_GAMES_PAGE,
  moderateName,
  type PlayerId,
  type SeatStart,
  type Role,
  SINGLE_PLAYER_HUMAN,
  type Winner,
} from "@mush2/shared";
import type { SqlDatabase } from "./accountStore.ts";

/** A seat as it is written: the name as it was, moderated only when read (`listFinished`). */
export interface FinishedPlayerRow extends Omit<FinishedCrewMember, "name"> {
  name: string;
  accountId: string | null;
}

/** One finished game, as it is written. */
export interface FinishedRecord extends Omit<FinishedGame, "crew"> {
  singlePlayer: boolean;
  setupId: string | null;
  rulesVersion: string;
  crew: FinishedPlayerRow[];
}

/** What the room knows beside the game itself. */
export interface FinishedContext {
  roomId: string;
  language: LobbyLanguage | null;
  singlePlayer: boolean;
  startedAt: number;
  endedAt: number;
  rulesVersion: string;
  /** Per seat, from when the Mush were chosen; a seat missing here (the game ended before they were) was human. */
  starts: Record<PlayerId, SeatStart>;
  /** Seat -> the account that took it. */
  accounts: Record<PlayerId, string>;
}

/**
 * The rows for a finished game, or null when there is nothing to write: the game hasn't ended (so it can't be
 * listed), or it is single player and its player had no account (nobody could ever see it, #332).
 */
export function finishedEntry(game: Readonly<GameState>, ctx: FinishedContext): FinishedRecord | null {
  if (game.phase !== "ended" || !game.winner || !game.ending) return null;
  if (ctx.singlePlayer && ctx.accounts[SINGLE_PLAYER_HUMAN] === undefined) return null;
  // Each body plays one seat (its `mind`); the seat started in the body whose id is the seat's.
  const crew = game.players.map((body): FinishedPlayerRow => {
    const seat = body.mind;
    const start = ctx.starts[seat] ?? { role: "human", character: game.players.find((b) => b.id === seat)?.character ?? body.character };
    return {
      seat,
      accountId: ctx.accounts[seat] ?? null,
      name: body.name,
      isBot: body.isBot,
      startCharacter: start.character,
      endCharacter: body.character,
      startRole: start.role,
      endRole: body.role,
      alive: body.alive,
    };
  });
  return {
    id: ctx.roomId,
    language: ctx.language,
    singlePlayer: ctx.singlePlayer,
    startedAt: ctx.startedAt,
    endedAt: ctx.endedAt,
    cycles: game.cycle,
    winner: game.winner,
    ending: game.ending,
    setupId: game.config.setupId ?? null,
    rulesVersion: ctx.rulesVersion,
    crew,
  };
}

/** A place in the list: the last game of a page, as `<endedAt>:<roomId>`. */
export interface GamesCursor {
  endedAt: number;
  roomId: string;
}

export function encodeCursor(cursor: GamesCursor): string {
  return `${cursor.endedAt}:${cursor.roomId}`;
}

/** The cursor, or null if it isn't one. */
export function decodeCursor(raw: string): GamesCursor | null {
  if (raw.length > MAX_GAMES_CURSOR_LENGTH) return null;
  const match = /^(\d{1,15}):([A-Za-z0-9-]{1,64})$/.exec(raw);
  return match ? { endedAt: Number(match[1]), roomId: match[2]! } : null;
}

interface GameRow {
  id: string;
  language: string | null;
  startedAt: number;
  endedAt: number;
  cycles: number;
  winner: string;
  ending: string;
}

interface PlayerRow {
  roomId: string;
  seat: string;
  name: string;
  isBot: number;
  startCharacter: string;
  endCharacter: string;
  startRole: string;
  endRole: string;
  alive: number;
}

/** A game row and its crew as the API sends them. */
function finishedGame(g: GameRow, crew: FinishedCrewMember[]): FinishedGame {
  return {
    id: g.id,
    language: (LOBBY_LANGUAGES as readonly string[]).includes(g.language ?? "") ? (g.language as LobbyLanguage) : null,
    startedAt: g.startedAt,
    endedAt: g.endedAt,
    cycles: g.cycles,
    winner: g.winner as Winner,
    ending: g.ending as Ending,
    crew,
  };
}

/** "p12" sorts after "p2". */
const seatNumber = (seat: string) => Number(seat.slice(1));

export class GameStore {
  constructor(private db: SqlDatabase) {}

  /** Writes a finished game and its seats in one batch. Writing the same game again changes nothing. */
  async recordFinished(record: FinishedRecord): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO games (room_id, language, single_player, started_at, ended_at, cycles, winner, ending, setup_id, rules_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.language,
          record.singlePlayer ? 1 : 0,
          record.startedAt,
          record.endedAt,
          record.cycles,
          record.winner,
          record.ending,
          record.setupId,
          record.rulesVersion,
        ),
      ...record.crew.map((p) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO game_players (room_id, seat, account_id, name, is_bot, start_character, end_character, start_role, end_role, alive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(record.id, p.seat, p.accountId, p.name, p.isBot ? 1 : 0, p.startCharacter, p.endCharacter, p.startRole, p.endRole, p.alive ? 1 : 0),
      ),
    ]);
  }

  /**
   * Finished multiplayer games, newest first: up to `limit` of them, after `before` if given. `next` is the cursor
   * for the page after, or null when there are no more.
   */
  async listFinished(options: { before?: GamesCursor; limit?: number } = {}): Promise<{ games: FinishedGame[]; next: GamesCursor | null }> {
    const limit = Math.max(1, Math.min(MAX_GAMES_PAGE, Math.floor(options.limit ?? MAX_GAMES_PAGE)));
    const { before } = options;
    const select = `SELECT room_id AS id, language, started_at AS startedAt, ended_at AS endedAt, cycles, winner, ending
      FROM games WHERE single_player = 0`;
    const order = "ORDER BY ended_at DESC, room_id DESC LIMIT ?";
    // One more than a page, to know whether there is a next one.
    const statement = before
      ? this.db.prepare(`${select} AND (ended_at < ? OR (ended_at = ? AND room_id < ?)) ${order}`).bind(before.endedAt, before.endedAt, before.roomId, limit + 1)
      : this.db.prepare(`${select} ${order}`).bind(limit + 1);
    const { results } = await statement.all<GameRow>();
    const page = results.slice(0, limit);
    const crews = await this.crews(page.map((g) => g.id));
    const last = page.at(-1);
    return {
      games: page.map((g) => finishedGame(g, crews.get(g.id) ?? [])),
      next: results.length > limit && last ? { endedAt: last.endedAt, roomId: last.id } : null,
    };
  }

  /**
   * One finished game's entry, single player or not (`GET /api/games/<id>`, #368), or null when it isn't listed. The
   * route decides who may see it (`replayAccess`); this only reads it.
   */
  async finished(roomId: string): Promise<FinishedGame | null> {
    const game = await this.db
      .prepare(`SELECT room_id AS id, language, started_at AS startedAt, ended_at AS endedAt, cycles, winner, ending FROM games WHERE room_id = ?`)
      .bind(roomId)
      .first<GameRow>();
    if (!game) return null;
    const crews = await this.crews([roomId]);
    return finishedGame(game, crews.get(roomId) ?? []);
  }

  /**
   * Who may see a finished game's replay (#337): whether it is single player, and the accounts that played it. Null
   * when the game isn't listed, which is every game that hasn't ended (`finishedEntry`). Only the route reads the
   * accounts; it never sends them.
   */
  async replayAccess(roomId: string): Promise<{ singlePlayer: boolean; accounts: string[] } | null> {
    const game = await this.db.prepare("SELECT single_player AS singlePlayer FROM games WHERE room_id = ?").bind(roomId).first<{ singlePlayer: number }>();
    if (!game) return null;
    if (game.singlePlayer !== 1) return { singlePlayer: false, accounts: [] };
    const { results } = await this.db
      .prepare("SELECT account_id AS accountId FROM game_players WHERE room_id = ? AND account_id IS NOT NULL")
      .bind(roomId)
      .all<{ accountId: string }>();
    return { singlePlayer: true, accounts: results.map((r) => r.accountId) };
  }

  /** The seats of these games, in seat order, without account IDs. */
  private async crews(roomIds: string[]): Promise<Map<string, FinishedCrewMember[]>> {
    const crews = new Map<string, FinishedCrewMember[]>();
    if (roomIds.length === 0) return crews;
    const { results } = await this.db
      .prepare(
        `SELECT room_id AS roomId, seat, name, is_bot AS isBot, start_character AS startCharacter, end_character AS endCharacter,
           start_role AS startRole, end_role AS endRole, alive
         FROM game_players WHERE room_id IN (${roomIds.map(() => "?").join(", ")})`,
      )
      .bind(...roomIds)
      .all<PlayerRow>();
    results.sort((a, b) => seatNumber(a.seat) - seatNumber(b.seat));
    for (const row of results) {
      const crew = crews.get(row.roomId) ?? [];
      crew.push({
        seat: row.seat,
        name: moderateName(row.name),
        isBot: row.isBot === 1,
        startCharacter: row.startCharacter as CharacterId,
        endCharacter: row.endCharacter as CharacterId,
        startRole: row.startRole as Role,
        endRole: row.endRole as Role,
        alive: row.alive === 1,
      });
      crews.set(row.roomId, crew);
    }
    return crews;
  }
}

/** The store over the Worker's D1 binding. */
export function gameStoreFor(env: { DB: D1Database }): GameStore {
  return new GameStore(env.DB);
}
