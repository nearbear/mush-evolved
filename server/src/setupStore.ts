// Posted setups in D1 (#233). The schema is server/migrations/0003_setups.sql; the routes are setupRoutes.ts.
// Everything a setup shows is public by design, except its owner's account ID, which never leaves the server.
//
// D1 has no transactions, so each post is one INSERT ... SELECT whose WHERE holds every check (the caps, the owner,
// the previous version), and the unique index on previous_id refuses a second successor. A post either lands whole or
// changes nothing; the reads after a refused one only say why.

import {
  LOBBY_LANGUAGES,
  MAX_SETUP_POSTS_PER_ACCOUNT,
  MAX_SETUPS_PER_ACCOUNT,
  parseSetupKnobs,
  type Setup,
  type SetupKnobs,
  type SetupRecord,
  type SetupTexts,
  validateSetup,
} from "@mush2/shared";
import type { SqlDatabase } from "./accountStore.ts";

export type PostResult =
  | { ok: true; setup: Setup }
  | { ok: false; reason: "setup_cap" | "post_cap" | "not_found" | "not_owner" | "not_latest" };

export interface NewSetup {
  text: SetupTexts;
  knobs: SetupKnobs;
  /** Posts a new version of this setup; absent for a new setup. */
  previousId?: string;
}

/** A listed setup and its owner, which the routes use for `mine` and never send. */
export interface ListedSetup {
  ownerId: string;
  setup: Setup;
}

interface Row {
  id: string;
  ownerId: string;
  ownerName: string;
  version: number;
  previousId: string | null;
  text: string;
  knobs: string;
  rulesVersion: string;
  createdAt: number;
  latest: number;
}

const SELECT_ROWS = `SELECT s.id, s.owner_id AS ownerId, a.display_name AS ownerName, s.version, s.previous_id AS previousId,
    s.text, s.knobs, s.rules_version AS rulesVersion, s.created_at AS createdAt,
    NOT EXISTS (SELECT 1 FROM setups n WHERE n.previous_id = s.id) AS latest
  FROM setups s JOIN accounts a ON a.id = s.owner_id`;

/** Setup ids looked up per statement by `ballot`. */
const BALLOT_CHUNK = 50;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** The row as a `Setup`, if it still validates under the current rules; otherwise null. */
function strict(row: Row): Setup | null {
  return validateSetup({
    id: row.id,
    text: parseJson(row.text),
    ownerName: row.ownerName,
    version: row.version,
    ...(row.previousId !== null && { previousId: row.previousId }),
    rulesVersion: row.rulesVersion,
    createdAt: row.createdAt,
    knobs: parseJson(row.knobs),
  });
}

/** The row's display fields read leniently (a lookup by ID shows a setup even after it stops validating). */
function lenient(row: Row): SetupRecord {
  const raw = parseJson(row.text);
  const text: SetupTexts = {};
  if (typeof raw === "object" && raw !== null) {
    for (const lang of LOBBY_LANGUAGES) {
      const entry = (raw as Record<string, unknown>)[lang] as Record<string, unknown> | undefined;
      if (typeof entry?.name === "string") text[lang] = { name: entry.name, description: typeof entry.description === "string" ? entry.description : "" };
    }
  }
  return {
    id: row.id,
    text,
    ownerName: row.ownerName,
    version: row.version,
    ...(row.previousId !== null && { previousId: row.previousId }),
    rulesVersion: row.rulesVersion,
    createdAt: row.createdAt,
    knobs: parseSetupKnobs(parseJson(row.knobs)),
    latest: row.latest === 1,
  };
}

export class SetupStore {
  constructor(private db: SqlDatabase) {}

  /**
   * Posts a setup or a new version. The text must already be moderated and the knobs validated (setupRoutes.ts).
   * A new setup counts toward both caps; a new version only toward the posts cap, and must follow the owner's newest
   * version of that setup.
   */
  async post(ownerId: string, input: NewSetup, rulesVersion: string, now: number): Promise<PostResult> {
    const id = crypto.randomUUID();
    const text = JSON.stringify(input.text);
    const knobs = JSON.stringify(input.knobs);
    const underPostCap = "(SELECT COUNT(*) FROM setups WHERE owner_id = ?) < ?";
    let changes: number;
    try {
      const statement =
        input.previousId === undefined
          ? this.db
              .prepare(
                `INSERT INTO setups (id, owner_id, version, previous_id, text, knobs, rules_version, created_at)
                 SELECT ?, ?, 1, NULL, ?, ?, ?, ?
                 WHERE (SELECT COUNT(*) FROM setups WHERE owner_id = ? AND version = 1) < ? AND ${underPostCap}`,
              )
              .bind(id, ownerId, text, knobs, rulesVersion, now, ownerId, MAX_SETUPS_PER_ACCOUNT, ownerId, MAX_SETUP_POSTS_PER_ACCOUNT)
          : this.db
              .prepare(
                `INSERT INTO setups (id, owner_id, version, previous_id, text, knobs, rules_version, created_at)
                 SELECT ?, p.owner_id, p.version + 1, p.id, ?, ?, ?, ? FROM setups p
                 WHERE p.id = ? AND p.owner_id = ? AND ${underPostCap}`,
              )
              .bind(id, text, knobs, rulesVersion, now, input.previousId, ownerId, ownerId, MAX_SETUP_POSTS_PER_ACCOUNT);
      ({ changes } = (await statement.run()).meta);
    } catch (e) {
      const message = e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : String(e);
      if (message.includes("UNIQUE constraint failed") && message.includes("setups.previous_id")) return { ok: false, reason: "not_latest" };
      throw e;
    }
    if (changes === 1) {
      const posted = await this.row(id);
      const setup = posted && strict(posted);
      if (!setup) throw new Error("A posted setup didn't validate");
      return { ok: true, setup };
    }
    if (input.previousId !== undefined) {
      const previous = await this.row(input.previousId);
      if (!previous) return { ok: false, reason: "not_found" };
      if (previous.ownerId !== ownerId) return { ok: false, reason: "not_owner" };
      return { ok: false, reason: "post_cap" };
    }
    const counts = await this.counts(ownerId);
    return { ok: false, reason: counts.posts >= MAX_SETUP_POSTS_PER_ACCOUNT ? "post_cap" : "setup_cap" };
  }

  /** The newest version of every setup that still validates, newest first. */
  async list(): Promise<ListedSetup[]> {
    const { results } = await this.db
      .prepare(`${SELECT_ROWS} WHERE NOT EXISTS (SELECT 1 FROM setups n WHERE n.previous_id = s.id) ORDER BY s.created_at DESC, s.id`)
      .all<Row>();
    const listed: ListedSetup[] = [];
    for (const row of results) {
      const setup = strict(row);
      if (setup) listed.push({ ownerId: row.ownerId, setup });
    }
    return listed;
  }

  /**
   * Those of `ids` that are on the ballot (#236): a setup's newest version that still validates, as `list` has it. The
   * standard setup isn't stored, so it is never among them; the caller adds it.
   */
  async ballot(ids: readonly string[]): Promise<Setup[]> {
    const onBallot: Setup[] = [];
    // A chunk at a time: D1 binds at most 100 parameters per statement.
    for (let i = 0; i < ids.length; i += BALLOT_CHUNK) {
      const chunk = ids.slice(i, i + BALLOT_CHUNK);
      const { results } = await this.db
        .prepare(`${SELECT_ROWS} WHERE s.id IN (${chunk.map(() => "?").join(", ")}) AND NOT EXISTS (SELECT 1 FROM setups n WHERE n.previous_id = s.id)`)
        .bind(...chunk)
        .all<Row>();
      for (const row of results) {
        const setup = strict(row);
        if (setup) onBallot.push(setup);
      }
    }
    return onBallot;
  }

  /** Any version by ID, whether or not it still validates. */
  async get(id: string): Promise<SetupRecord | null> {
    const row = await this.row(id);
    return row && lenient(row);
  }

  /** How much of each cap the account has used: new setups, and posts in all. */
  async counts(ownerId: string): Promise<{ setups: number; posts: number }> {
    const row = await this.db
      .prepare("SELECT COALESCE(SUM(version = 1), 0) AS setups, COUNT(*) AS posts FROM setups WHERE owner_id = ?")
      .bind(ownerId)
      .first<{ setups: number; posts: number }>();
    return { setups: row?.setups ?? 0, posts: row?.posts ?? 0 };
  }

  private row(id: string): Promise<Row | null> {
    return this.db.prepare(`${SELECT_ROWS} WHERE s.id = ?`).bind(id).first<Row>();
  }
}

/** The store over the Worker's D1 binding. */
export function setupStoreFor(env: { DB: D1Database }): SetupStore {
  return new SetupStore(env.DB);
}
