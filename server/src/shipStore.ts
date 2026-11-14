// Running ships in D1 (#431, docs/ops/observability.md). The schema is server/migrations/0005_ships.sql; the only
// reader is the operator's `npm run ships` (tools/src/ops/ships.ts), so no route sends these rows.
//
// A room writes its row at launch (GameRoom's `recordShip`) and deletes it when its game ends, in the same batch as the
// `games` row (`GameStore.recordFinished`). Neither write is atomic with the room's own storage: the launch write is
// idempotent and retried from the alarm, and the daily sweep (shipSweep.ts) removes rows whose room isn't running.

import type { GameState, LobbyLanguage } from "@mush2/shared";
import type { SqlDatabase, SqlStatement } from "./accountStore.ts";

/** One running ship, as it is written. No player information. */
export interface ShipRow {
  roomId: string;
  language: LobbyLanguage | null;
  singlePlayer: boolean;
  seats: number;
  launchedAt: number;
}

/** The row for a ship: its pre-selection seat count, or the crew it launched with (single player, tests). */
export function shipRow(game: Readonly<GameState>, ctx: Omit<ShipRow, "seats">): ShipRow {
  return { ...ctx, seats: game.config.preselection?.seats ?? game.players.length };
}

/** Deletes a ship's row; `GameStore.recordFinished` puts it in the batch with the finished game. */
export function endShipStatement(db: SqlDatabase, roomId: string): SqlStatement {
  return db.prepare("DELETE FROM ships WHERE room_id = ?").bind(roomId);
}

export class ShipStore {
  constructor(private db: SqlDatabase) {}

  /** Writes a running ship. Writing it again changes nothing. */
  async launched(row: ShipRow): Promise<void> {
    await this.db
      .prepare("INSERT OR IGNORE INTO ships (room_id, language, single_player, seats, launched_at) VALUES (?, ?, ?, ?, ?)")
      .bind(row.roomId, row.language, row.singlePlayer ? 1 : 0, row.seats, row.launchedAt)
      .run();
  }

  /** Removes a ship's row: its game ended without a `games` row (single player without an account), or the sweep. */
  async ended(roomId: string): Promise<void> {
    await endShipStatement(this.db, roomId).run();
  }

  /** Every running ship's room, for the sweep. */
  async roomIds(): Promise<string[]> {
    const { results } = await this.db.prepare("SELECT room_id AS roomId FROM ships").all<{ roomId: string }>();
    return results.map((r) => r.roomId);
  }
}

/** The store over the Worker's D1 binding. */
export function shipStoreFor(env: { DB: D1Database }): ShipStore {
  return new ShipStore(env.DB);
}
