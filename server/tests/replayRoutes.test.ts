// The replay routes (#337): what is served, to whom, and that a running game, an unconfirmed copy and another
// account's single-player game return nothing.

import { CHARACTERS, createGame, DEFAULT_CONFIG, endGame, type ChunkEntry, HISTORY_VERSION, type ReplayIndex, replayKeys, type Seat } from "@mush2/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { NotFoundSchema, NotReadySchema, ReplayChunkSchema, ReplayIndexSchema } from "../src/apiSchemas.ts";
import { handleAuth } from "../src/auth.ts";
import { finishedEntry, GameStore } from "../src/gameStore.ts";
import { FakeR2Bucket } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";

let games: GameStore;
let accounts: AccountStore;
let bucket: FakeR2Bucket;

beforeEach(() => {
  const db = migratedDatabase();
  games = new GameStore(db);
  accounts = new AccountStore(db);
  bucket = new FakeR2Bucket();
});

const seat = (i: number): Seat => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id });

/** Lists an ended game under `roomId`, as its room does when the game ends. */
async function list(roomId: string, singlePlayer = false, accountsBySeat: Record<string, string> = {}): Promise<void> {
  const g = createGame([seat(0), seat(1), seat(2)], { ...DEFAULT_CONFIG, mushCount: 1 }, 7, { p0: "mush" });
  endGame(g, "humans", "sol");
  const starts = Object.fromEntries(g.players.map((p) => [p.mind, { role: p.role, character: p.character }]));
  const entry = finishedEntry(g, { roomId, language: "en", singlePlayer, startedAt: 1, endedAt: 2, rulesVersion: "test", starts, accounts: accountsBySeat });
  if (!entry) throw new Error("not listed");
  await games.recordFinished(entry);
}

const CHUNKS: ChunkEntry[][] = [
  [{ at: 10, history: { v: HISTORY_VERSION, base: { cycle: 0 } as never } }, { at: 11, history: {} }],
  [{ at: 20, history: { v: HISTORY_VERSION, full: { cycle: 1 } as never } }],
];

async function gzip(text: string): Promise<ArrayBuffer> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

/** Writes the chunks, and the index unless `confirmed` is false (a copy that stopped before its index). */
async function copy(roomId: string, confirmed = true): Promise<ReplayIndex> {
  for (const [n, entries] of CHUNKS.entries()) {
    await bucket.put(replayKeys.chunk(roomId, n), await gzip(JSON.stringify(entries)), { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" } });
  }
  const index: ReplayIndex = {
    v: HISTORY_VERSION,
    roomId,
    rulesVersion: "test",
    endedAt: 2,
    seats: [{ seat: "p0", role: "mush", character: CHARACTERS[0]!.id }],
    chunks: CHUNKS.map((entries, n) => ({ cycle: n, firstInput: n * 2, inputs: entries.length, from: entries[0]!.at, to: entries.at(-1)!.at })),
  };
  if (confirmed) await bucket.put(replayKeys.index(roomId), JSON.stringify(index));
  return index;
}

async function get(path: string, init: { session?: string; gzip?: boolean; method?: string } = {}): Promise<Response> {
  const headers = new Headers();
  if (init.session) headers.set("Cookie", `__Host-mush2_session=${init.session}`);
  if (init.gzip !== false) headers.set("Accept-Encoding", "gzip, br");
  const request = new Request(`https://mush.test${path}`, { headers, ...(init.method && { method: init.method }) });
  const response = await handleAuth(request, {} as Env, { store: accounts, games, replays: bucket, now: 1 } as never);
  if (!response) throw new Error("not a route");
  return response;
}

async function gunzip(response: Response): Promise<unknown> {
  return JSON.parse(await new Response(response.body!.pipeThrough(new DecompressionStream("gzip"))).text());
}

async function signedIn(name: string): Promise<{ id: string; session: string }> {
  const created = await accounts.createAccount(name, "dev", name, 1);
  if (!created.ok) throw new Error(created.reason);
  return { id: created.account.id, session: await accounts.createSession(created.account.id, 1_000_000) };
}

describe("GET /api/games/<id>/replay (#337)", () => {
  it("serves a listed multiplayer game's index and chunks to anyone, cacheable", async () => {
    const index = await copy("room-1");
    await list("room-1");
    const response = await get("/api/games/room-1/replay");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const body = await response.json();
    expect(body).toEqual(index);
    expect(ReplayIndexSchema.safeParse(body).success).toBe(true);

    const chunk = await get("/api/games/room-1/replay/1");
    expect(chunk.status).toBe(200);
    expect(chunk.headers.get("Content-Encoding")).toBe("gzip");
    expect(chunk.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    const entries = await gunzip(chunk);
    expect(entries).toEqual(CHUNKS[1]);
    expect(ReplayChunkSchema.safeParse(entries).success).toBe(true);
  });

  it("unzips a chunk for a client that doesn't accept gzip", async () => {
    await copy("room-1");
    await list("room-1");
    const chunk = await get("/api/games/room-1/replay/0", { gzip: false });
    expect(chunk.headers.get("Content-Encoding")).toBeNull();
    expect(await chunk.json()).toEqual(CHUNKS[0]);
  });

  it("answers 404 for a chunk the index doesn't list, or a malformed one", async () => {
    await copy("room-1");
    await list("room-1");
    for (const n of ["2", "-1", "1.0", "x", "0000001"]) expect([n, (await get(`/api/games/room-1/replay/${n}`)).status]).toEqual([n, 404]);
  });

  it("serves nothing of a running game, even one with objects in the bucket", async () => {
    await copy("running");
    for (const path of ["/api/games/running/replay", "/api/games/running/replay/0"]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(NotFoundSchema.parse(await response.json())).toEqual({ error: "not_found" });
    }
  });

  it("answers not_ready, and no chunk, for a listed game whose copy isn't confirmed", async () => {
    await copy("room-1", false);
    await list("room-1");
    for (const path of ["/api/games/room-1/replay", "/api/games/room-1/replay/0"]) {
      const response = await get(path);
      expect(response.status).toBe(409);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(NotReadySchema.parse(await response.json())).toEqual({ error: "not_ready" });
    }
  });

  it("serves a single-player replay only to the account that played it, never stored", async () => {
    const ann = await signedIn("Ann");
    const bob = await signedIn("Bob");
    await copy("solo");
    await list("solo", true, { p0: ann.id });
    for (const path of ["/api/games/solo/replay", "/api/games/solo/replay/0"]) {
      expect([path, (await get(path)).status]).toEqual([path, 404]);
      const other = await get(path, { session: bob.session });
      expect([path, other.status]).toEqual([path, 404]);
      expect(await other.json()).toEqual({ error: "not_found" });
      const own = await get(path, { session: ann.session });
      expect([path, own.status]).toEqual([path, 200]);
      expect(own.headers.get("Cache-Control")).toBe("no-store");
    }
    const own = await get("/api/games/solo/replay", { session: ann.session });
    expect(JSON.stringify(await own.json())).not.toContain(ann.id);
  });

  it("refuses a malformed room ID and other methods", async () => {
    expect((await get("/api/games/a%20b/replay")).status).toBe(404);
    expect((await get(`/api/games/${"a".repeat(65)}/replay`)).status).toBe(404);
    expect((await get("/api/games/room-1/replay", { method: "POST" })).status).toBe(405);
    expect((await get("/api/games/room-1/replay/0", { method: "DELETE" })).status).toBe(405);
  });
});
