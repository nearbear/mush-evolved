// Account storage in D1 (#282): the only place with SQL. The schema is in
// server/migrations/. Nothing here reaches a PlayerView.
//
// The interface is async and batch-shaped like D1's: statements that must be
// atomic go in one `batch()`, never BEGIN/COMMIT (D1 has no transactions).
// Tests run it on node:sqlite through `SqlDatabase`, which D1Database satisfies.

export type SqlValue = string | number | null;

export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

/** The part of D1Database the store uses. `batch` runs its statements in order, atomically. */
export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<{ meta: { changes: number } }[]>;
}

export interface Account {
  id: string;
  displayName: string;
  createdAt: number;
  /** Null until the first rename. */
  renamedAt: number | null;
}

export interface Session {
  accountId: string;
  expiresAt: number;
}

export type CreateAccountResult =
  | { ok: true; account: Account }
  | { ok: false; reason: "name_taken" | "identity_taken" };

/** `too_soon`: renamed less than RENAME_INTERVAL_MS ago (or no such account). */
export type RenameResult = "ok" | "name_taken" | "too_soon";

/** A player can rename once a day: 24 hours after their last rename (owner, 2026-10-30). */
export const RENAME_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Names are unique ignoring case. */
export function nameKey(displayName: string): string {
  return displayName.toLowerCase();
}

const ACCOUNT_COLUMNS = "id, display_name AS displayName, created_at AS createdAt, renamed_at AS renamedAt";

/** Which unique index (or primary key) an insert or update violated, if any. */
function uniqueViolation(e: unknown): "name" | "identity" | "ship" | null {
  const message = e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : String(e);
  if (!message.includes("UNIQUE constraint failed")) return null;
  if (message.includes("accounts.name_key")) return "name";
  if (message.includes("identities.provider")) return "identity";
  if (message.includes("account_ships.account_id")) return "ship";
  return null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes, base64url. Only its hash is stored. */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class AccountStore {
  constructor(private db: SqlDatabase) {}

  // ---- Accounts and identities

  /** A new account with its first sign-in method. The name must already be confirmed and moderated. */
  async createAccount(displayName: string, provider: string, providerUserId: string, now: number): Promise<CreateAccountResult> {
    const id = crypto.randomUUID();
    try {
      await this.db.batch([
        this.db
          .prepare("INSERT INTO accounts (id, display_name, name_key, created_at) VALUES (?, ?, ?, ?)")
          .bind(id, displayName, nameKey(displayName), now),
        this.db
          .prepare("INSERT INTO identities (provider, provider_user_id, account_id, created_at) VALUES (?, ?, ?, ?)")
          .bind(provider, providerUserId, id, now),
      ]);
    } catch (e) {
      const which = uniqueViolation(e);
      if (which === "name") return { ok: false, reason: "name_taken" };
      if (which === "identity") return { ok: false, reason: "identity_taken" };
      throw e;
    }
    return { ok: true, account: { id, displayName, createdAt: now, renamedAt: null } };
  }

  /** Another sign-in method for an existing account. */
  async addIdentity(accountId: string, provider: string, providerUserId: string, now: number): Promise<"ok" | "identity_taken"> {
    try {
      await this.db
        .prepare("INSERT INTO identities (provider, provider_user_id, account_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(provider, providerUserId, accountId, now)
        .run();
    } catch (e) {
      if (uniqueViolation(e) === "identity") return "identity_taken";
      throw e;
    }
    return "ok";
  }

  getAccount(id: string): Promise<Account | null> {
    return this.db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`).bind(id).first<Account>();
  }

  findAccountByIdentity(provider: string, providerUserId: string): Promise<Account | null> {
    return this.db
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id =
           (SELECT account_id FROM identities WHERE provider = ? AND provider_user_id = ?)`,
      )
      .bind(provider, providerUserId)
      .first<Account>();
  }

  async identities(accountId: string): Promise<{ provider: string; providerUserId: string }[]> {
    const { results } = await this.db
      .prepare(
        "SELECT provider, provider_user_id AS providerUserId FROM identities WHERE account_id = ? ORDER BY created_at, provider",
      )
      .bind(accountId)
      .all<{ provider: string; providerUserId: string }>();
    return results;
  }

  /**
   * Renames an account and records it in the name history, unless it was
   * renamed less than RENAME_INTERVAL_MS before `now`. The old name
   * is free the moment this returns.
   */
  async rename(accountId: string, newName: string, now: number): Promise<RenameResult> {
    const notRenamedSince = now - RENAME_INTERVAL_MS;
    // Both statements test the same condition against the same state, so they
    // match or skip together; the history row reads the old name first.
    const allowed = "id = ? AND (renamed_at IS NULL OR renamed_at <= ?)";
    let results: { meta: { changes: number } }[];
    try {
      results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO name_history (account_id, old_name, new_name, at)
             SELECT id, display_name, ?, ? FROM accounts WHERE ${allowed}`,
          )
          .bind(newName, now, accountId, notRenamedSince),
        this.db
          .prepare(`UPDATE accounts SET display_name = ?, name_key = ?, renamed_at = ? WHERE ${allowed}`)
          .bind(newName, nameKey(newName), now, accountId, notRenamedSince),
      ]);
    } catch (e) {
      if (uniqueViolation(e) === "name") return "name_taken";
      throw e;
    }
    return results[1]?.meta.changes === 1 ? "ok" : "too_soon";
  }

  /** Every rename of an account, oldest first. For moderators. */
  async nameHistory(accountId: string): Promise<{ oldName: string; newName: string; at: number }[]> {
    const { results } = await this.db
      .prepare("SELECT old_name AS oldName, new_name AS newName, at FROM name_history WHERE account_id = ? ORDER BY at, id")
      .bind(accountId)
      .all<{ oldName: string; newName: string; at: number }>();
    return results;
  }

  // ---- Sessions. Callers hold the session ID; only its SHA-256 is stored.

  /** Returns the new session ID, for the cookie. */
  async createSession(accountId: string, expiresAt: number): Promise<string> {
    const sessionId = newSessionId();
    await this.db
      .prepare("INSERT INTO sessions (id_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256Hex(sessionId), accountId, expiresAt)
      .run();
    return sessionId;
  }

  /** The session, if it exists and hasn't expired at `now`. */
  async getSession(sessionId: string, now: number): Promise<Session | null> {
    return this.db
      .prepare("SELECT account_id AS accountId, expires_at AS expiresAt FROM sessions WHERE id_hash = ? AND expires_at > ?")
      .bind(await sha256Hex(sessionId), now)
      .first<Session>();
  }

  /** Extends a session that hasn't expired at `now`; an expired one stays expired. Returns whether it renewed. */
  async renewSession(sessionId: string, now: number, expiresAt: number): Promise<boolean> {
    const { meta } = await this.db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ? AND expires_at > ?")
      .bind(expiresAt, await sha256Hex(sessionId), now)
      .run();
    return meta.changes === 1;
  }

  /** Signs one device out. */
  async deleteSession(sessionId: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(sessionId)).run();
  }

  /** Returns how many were deleted. */
  async deleteExpiredSessions(now: number): Promise<number> {
    const { meta } = await this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
    return meta.changes;
  }

  // ---- Ships. An account is aboard at most one multiplayer ship (#285).

  /** Records boarding, unless the account is already aboard a ship (any language). */
  async boardShip(accountId: string, roomId: string, now: number): Promise<"ok" | "already_aboard"> {
    try {
      await this.db
        .prepare("INSERT INTO account_ships (account_id, room_id, joined_at) VALUES (?, ?, ?)")
        .bind(accountId, roomId, now)
        .run();
    } catch (e) {
      if (uniqueViolation(e) === "ship") return "already_aboard";
      throw e;
    }
    return "ok";
  }

  /** The ship the account is aboard, if any. */
  async currentShip(accountId: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT room_id AS roomId FROM account_ships WHERE account_id = ? AND ended_at IS NULL")
      .bind(accountId)
      .first<{ roomId: string }>();
    return row?.roomId ?? null;
  }

  /** Frees one account from a ship (it died, or its seat was revoked). */
  async leaveShip(accountId: string, roomId: string, now: number): Promise<void> {
    await this.db
      .prepare("UPDATE account_ships SET ended_at = ? WHERE account_id = ? AND room_id = ? AND ended_at IS NULL")
      .bind(now, accountId, roomId)
      .run();
  }

  /** Frees everyone still aboard a ship that ended. Returns how many. */
  async endShip(roomId: string, now: number): Promise<number> {
    const { meta } = await this.db
      .prepare("UPDATE account_ships SET ended_at = ? WHERE room_id = ? AND ended_at IS NULL")
      .bind(now, roomId)
      .run();
    return meta.changes;
  }

  /** Every ship the account has been aboard, newest first. */
  async ships(accountId: string): Promise<{ roomId: string; joinedAt: number; endedAt: number | null }[]> {
    const { results } = await this.db
      .prepare(
        "SELECT room_id AS roomId, joined_at AS joinedAt, ended_at AS endedAt FROM account_ships WHERE account_id = ? ORDER BY joined_at DESC, id DESC",
      )
      .bind(accountId)
      .all<{ roomId: string; joinedAt: number; endedAt: number | null }>();
    return results;
  }
}

/** The store over the Worker's D1 binding (typechecks that D1Database fits `SqlDatabase`). */
export function accountStoreFor(env: { DB: D1Database }): AccountStore {
  return new AccountStore(env.DB);
}
