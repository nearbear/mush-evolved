// The replay routes (#337), routed by auth.ts after its rate limits. They read the copy in R2 (#336, replayStore.ts),
// never the room, so showing a replay never wakes it.
//
//   GET /api/games/<id>              FinishedGame: the game's summary (#368), from D1 only
//   GET /api/games/<id>/replay       ReplayIndex: the game's index
//   GET /api/games/<id>/replay/<n>   ChunkEntry[]: chunk n, as gzipped JSON
//
// A replay is served only when both are true (server-side, on every request):
// - the game is in the list of finished games (D1, gameStore.ts). A room writes its entry only once the game has ended
//   (`finishedEntry`), so a running game is never served: it answers 404 like a game that doesn't exist.
// - its copy is confirmed: the index is in R2. The copy writes the index only after every chunk's put resolved, so
//   the index is the confirmation; the room's `replayReady` is set from the same moment, and reading it would wake the
//   room. A listed game without its index answers 409 `not_ready`, and no chunk of it is served, even one already
//   written.
//
// The summary has the same privacy as the replay (`openGame`), but needs only the first condition.
//
// Multiplayer replays are public. A single-player one is only for the account that played it (#332); anyone else gets
// the same 404 as a game that doesn't exist, so it doesn't reveal that the game exists. `mayView` is where a share
// link would be accepted later.
//
// A chunk never changes once its copy is confirmed (keys depend only on the game), so a public chunk is cached as
// immutable. A single-player answer is never stored (`no-store`), so another account on the same browser can't read it
// from the cache.

import { type ChunkEntry, type FinishedGame, type ReplayIndex, replayKeys } from "@mush2/shared";
import type { GameStore } from "./gameStore.ts";
import { json, type JsonResponse } from "./http.ts";

/** What the routes read from an R2 object (R2ObjectBody's parts). */
export interface ReplayObject {
  body: ReadableStream;
  json<T>(): Promise<T>;
}

/** The part of R2 the routes read. */
export interface ReplayReader {
  get(key: string): Promise<ReplayObject | null>;
}

export interface ReplayRouteDeps {
  games: GameStore;
  replays: ReplayReader;
  /** The signed-in account, if any; read only for a single-player game. */
  account: () => Promise<string | null>;
}

/** A room ID as rooms are named (a UUID), checked before it reaches D1 or an R2 key. */
const ROOM_ID = /^[A-Za-z0-9-]{1,64}$/;
/** A chunk number in the URL. */
const CHUNK_NUMBER = /^\d{1,6}$/;

/** A public chunk never changes. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** A public index (and summary): it doesn't change either, but a shorter life leaves room for retention (#132) to remove a copy. */
const INDEX_CACHE = "public, max-age=3600";

type NotFound = JsonResponse<{ error: "not_found" }, 404>;
type NotReady = JsonResponse<{ error: "not_ready" }, 409>;

const notFound = (): NotFound => json({ error: "not_found" as const }, 404);
const notReady = (): NotReady => json({ error: "not_ready" as const }, 409);

/** Who may see a listed game's replay. Share links (a token in the request) would be accepted here. */
async function mayView(access: { singlePlayer: boolean; accounts: string[] }, deps: ReplayRouteDeps): Promise<boolean> {
  if (!access.singlePlayer) return true;
  const account = await deps.account();
  return account !== null && access.accounts.includes(account);
}

/**
 * Whether this request may see the listed game, and if so whether it is public (cacheable), or 404. Every route here
 * starts with it, so the summary and the replay always agree on who sees a game.
 */
async function openGame(roomId: string, deps: ReplayRouteDeps): Promise<{ isPublic: boolean } | NotFound> {
  if (!ROOM_ID.test(roomId)) return notFound();
  const access = await deps.games.replayAccess(roomId);
  if (!access || !(await mayView(access, deps))) return notFound();
  return { isPublic: !access.singlePlayer };
}

/** The game's confirmed index and whether its replay is public (cacheable), or the refusal. */
async function openReplay(roomId: string, deps: ReplayRouteDeps): Promise<{ index: ReplayIndex; isPublic: boolean } | NotFound | NotReady> {
  const opened = await openGame(roomId, deps);
  if (opened instanceof Response) return opened;
  const object = await deps.replays.get(replayKeys.index(roomId));
  if (!object) return notReady();
  const index = await object.json<ReplayIndex>();
  // The index carries `v` for the viewer to check; only a mismatched roomId (put there by hand) is refused here.
  if (index.roomId !== roomId) return notReady();
  return { index, isPublic: opened.isPublic };
}

/**
 * `GET /api/games/<id>`: the game's entry, the same object `/api/games` lists (#368). It reads only D1, so it answers
 * whether or not the replay's copy is confirmed, and for a replay too old to read.
 */
export async function gameSummaryRoute(roomId: string, deps: ReplayRouteDeps): Promise<JsonResponse<FinishedGame> | NotFound> {
  const opened = await openGame(roomId, deps);
  if (opened instanceof Response) return opened;
  const game = await deps.games.finished(roomId);
  // Listed a moment ago; only a row removed in between (by hand, or by retention later) gets here.
  if (!game) return notFound();
  const response = json(game);
  if (opened.isPublic) response.headers.set("Cache-Control", INDEX_CACHE);
  return response;
}

/** `GET /api/games/<id>/replay`. */
export async function replayIndexRoute(roomId: string, deps: ReplayRouteDeps): Promise<JsonResponse<ReplayIndex> | NotFound | NotReady> {
  const opened = await openReplay(roomId, deps);
  if (opened instanceof Response) return opened;
  const response = json(opened.index);
  if (opened.isPublic) response.headers.set("Cache-Control", INDEX_CACHE);
  return response;
}

/**
 * `GET /api/games/<id>/replay/<n>`. The chunk is stored gzipped and goes out as it is (`Content-Encoding: gzip`, the
 * runtime told not to compress it again); a client that doesn't accept gzip gets it unzipped.
 */
export async function replayChunkRoute(
  roomId: string,
  n: string,
  acceptEncoding: string | null,
  deps: ReplayRouteDeps,
): Promise<JsonResponse<ChunkEntry[]> | NotFound | NotReady> {
  const opened = await openReplay(roomId, deps);
  if (opened instanceof Response) return opened;
  if (!CHUNK_NUMBER.test(n) || Number(n) >= opened.index.chunks.length) return notFound();
  const object = await deps.replays.get(replayKeys.chunk(roomId, Number(n)));
  // Listed in a confirmed index but gone: removed by hand (or by retention, later).
  if (!object) return notFound();
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": opened.isPublic ? IMMUTABLE : "no-store", Vary: "Accept-Encoding" });
  const gzip = /\bgzip\b/.test(acceptEncoding ?? "");
  if (gzip) headers.set("Content-Encoding", "gzip");
  const body = gzip ? object.body : object.body.pipeThrough(new DecompressionStream("gzip"));
  // `encodeBody` is the Workers runtime's (ResponseInit); elsewhere it is ignored. The cast only adds the body type.
  return new Response(body, { headers, encodeBody: gzip ? "manual" : "automatic" } as ResponseInit) as JsonResponse<ChunkEntry[]>;
}
