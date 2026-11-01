import { CHARACTERS, createGame, type FinishedGamesResponse, DEFAULT_CONFIG, endGame, type GameState, MAX_GAMES_PAGE, moderateName, type Seat, swapMinds } from "@mush2/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type SqlDatabase } from "../src/accountStore.ts";
import { handleAuth } from "../src/auth.ts";
import { decodeCursor, encodeCursor, type FinishedContext, finishedEntry, GameStore } from "../src/gameStore.ts";
import { migratedDatabase } from "./sqliteD1.ts";

let db: SqlDatabase;
let store: GameStore;
let accounts: AccountStore;

beforeEach(() => {
  db = migratedDatabase();
  store = new GameStore(db);
  accounts = new AccountStore(db);
});

const seat = (i: number, isBot = false): Seat => ({ id: `p${i}`, name: `Player ${i}`, isBot, character: CHARACTERS[i]!.id });

/** Three seats, p0 an alpha Mush; the Mush are chosen at launch (no pre-selection). */
function game(): GameState {
  return createGame([seat(0), seat(1), seat(2, true)], { ...DEFAULT_CONFIG, mushCount: 1 }, 7, { p0: "mush" });
}

/** The starts GameRoom notes when the Mush are chosen. */
const startsOf = (g: GameState) => Object.fromEntries(g.players.map((p) => [p.mind, { role: p.role, character: p.character }]));

const context = (g: GameState, over: Partial<FinishedContext> = {}): FinishedContext => ({
  roomId: "room-1",
  language: "en",
  singlePlayer: false,
  startedAt: 100,
  endedAt: 200,
  rulesVersion: "test",
  starts: startsOf(g),
  accounts: {},
  ...over,
});

async function account(name: string): Promise<string> {
  const created = await accounts.createAccount(name, "dev", name, 1);
  if (!created.ok) throw new Error(created.reason);
  return created.account.id;
}

/** An ended game recorded under `roomId`, ending at `endedAt`. */
async function record(roomId: string, endedAt: number, singlePlayer = false, accountsBySeat: Record<string, string> = {}): Promise<void> {
  const g = game();
  endGame(g, "humans", "sol");
  const entry = finishedEntry(g, context(g, { roomId, endedAt, singlePlayer, accounts: accountsBySeat }));
  if (!entry) throw new Error("not recorded");
  await store.recordFinished(entry);
}

describe("finishedEntry", () => {
  it("refuses a game that hasn't ended, so a running game can't be listed", () => {
    const g = game();
    expect(g.phase).toBe("playing");
    expect(finishedEntry(g, context(g))).toBeNull();
  });

  it("records each seat's start and end role and character across a conversion and a Transfer", () => {
    const g = game();
    const starts = startsOf(g);
    // p1 is converted (a beta Mush), and the alpha Mush p0 transfers into p2's body.
    const p1 = g.players.find((p) => p.id === "p1")!;
    p1.role = "mush";
    p1.alpha = false;
    swapMinds(g, g.players.find((p) => p.id === "p0")!, g.players.find((p) => p.id === "p2")!);
    g.players.find((p) => p.id === "p0")!.alive = false;
    endGame(g, "mush", "humans_dead");
    const entry = finishedEntry(g, context(g, { starts, accounts: { p0: "acc-0", p1: "acc-1" } }));
    const bySeat = Object.fromEntries(entry!.crew.map((c) => [c.seat, c]));
    // Seat p0 (alpha) now plays p2's character; seat p2 (a bot) plays p0's body, which died.
    expect(bySeat.p0).toMatchObject({
      accountId: "acc-0",
      name: "Player 0",
      startCharacter: CHARACTERS[0]!.id,
      endCharacter: CHARACTERS[2]!.id,
      startRole: "mush",
      endRole: "mush",
      alive: true,
    });
    expect(bySeat.p2).toMatchObject({ accountId: null, isBot: true, startCharacter: CHARACTERS[2]!.id, endCharacter: CHARACTERS[0]!.id, alive: false });
    expect(bySeat.p1).toMatchObject({ startRole: "human", endRole: "mush", startCharacter: CHARACTERS[1]!.id, endCharacter: CHARACTERS[1]!.id });
    expect(entry).toMatchObject({ id: "room-1", language: "en", winner: "mush", ending: "humans_dead", cycles: g.cycle, startedAt: 100, endedAt: 200 });
  });

  it("counts every seat human at the start when the game ended before the Mush were chosen", () => {
    const g = game();
    endGame(g, "mush", "ship_destroyed");
    const entry = finishedEntry(g, context(g, { starts: {} }));
    expect(entry!.crew.map((c) => c.startRole)).toEqual(["human", "human", "human"]);
    expect(entry!.crew.map((c) => c.startCharacter)).toEqual(entry!.crew.map((c) => c.endCharacter));
  });

  it("skips a single-player game whose player had no account", () => {
    const g = game();
    endGame(g, "humans", "sol");
    expect(finishedEntry(g, context(g, { singlePlayer: true }))).toBeNull();
    expect(finishedEntry(g, context(g, { singlePlayer: true, accounts: { p0: "acc" } }))).toMatchObject({ singlePlayer: true });
  });
});

describe("GameStore", () => {
  it("writes a game once: writing it again changes nothing", async () => {
    const ann = await account("Ann");
    await record("room-1", 200, false, { p0: ann });
    await record("room-1", 999, false, { p0: ann });
    const { games } = await store.listFinished();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: "room-1", endedAt: 200, language: "en", winner: "humans", ending: "sol" });
    expect(games[0]!.crew.map((c) => c.seat)).toEqual(["p0", "p1", "p2"]);
    // The account is stored, never listed.
    expect(JSON.stringify(games)).not.toContain(ann);
    const row = await db.prepare("SELECT account_id AS accountId FROM game_players WHERE room_id = ? AND seat = ?").bind("room-1", "p0").first<{ accountId: string }>();
    expect(row?.accountId).toBe(ann);
  });

  it("lists newest first, leaving out single-player games", async () => {
    const ann = await account("Ann");
    await record("a", 100);
    await record("solo", 300, true, { p0: ann });
    await record("b", 200);
    expect((await store.listFinished()).games.map((g) => g.id)).toEqual(["b", "a"]);
  });

  it("pages by cursor, and a game that ends between pages doesn't shift the next page", async () => {
    for (let i = 0; i < 5; i++) await record(`g${i}`, 100 + i);
    // Two games ending at the same time are ordered by room ID.
    await record("g5", 104);
    const first = await store.listFinished({ limit: 2 });
    expect(first.games.map((g) => g.id)).toEqual(["g5", "g4"]);
    await record("new", 1000);
    const second = await store.listFinished({ limit: 2, before: first.next! });
    expect(second.games.map((g) => g.id)).toEqual(["g3", "g2"]);
    const third = await store.listFinished({ limit: 2, before: second.next! });
    expect(third.games.map((g) => g.id)).toEqual(["g1", "g0"]);
    expect(third.next).toBeNull();
  });

  it("moderates names when listed, as the end screen does", async () => {
    const g = game();
    endGame(g, "humans", "sol");
    const raw = "visit http://spam.example";
    g.players[1]!.name = raw;
    await store.recordFinished(finishedEntry(g, context(g))!);
    const [listed] = (await store.listFinished()).games;
    expect(moderateName(raw)).not.toBe(raw);
    expect(listed!.crew.map((c) => c.name)).toEqual(["Player 0", moderateName(raw), "Player 2"]);
  });

  it("caps the page size", async () => {
    for (let i = 0; i <= MAX_GAMES_PAGE; i++) await record(`g${String(i).padStart(2, "0")}`, i);
    const page = await store.listFinished({ limit: 1000 });
    expect(page.games).toHaveLength(MAX_GAMES_PAGE);
    expect(page.next).not.toBeNull();
  });
});

describe("cursors", () => {
  it("round-trip, and anything else is refused", () => {
    const cursor = { endedAt: 1_700_000_000_000, roomId: "0b4c2a9e-1f3d-4c5e-9a7b-2d6e8f0a1b3c" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    for (const bad of ["", "12", ":abc", "12:", "x:abc", "12:a b", "12:a'--", `12:${"a".repeat(65)}`]) expect(decodeCursor(bad)).toBeNull();
  });
});

describe("GET /api/games", () => {
  async function get(query = ""): Promise<Response> {
    const response = await handleAuth(new Request(`https://mush.test/api/games${query}`), {} as Env, { store: accounts, games: store, now: 1 } as never);
    if (!response) throw new Error("not a route");
    return response;
  }

  it("pages through finished multiplayer games, newest first, without account IDs", async () => {
    const ann = await account("Ann");
    await record("a", 100, false, { p0: ann });
    await record("b", 200);
    await record("solo", 300, true, { p0: ann });
    const first = (await (await get("?limit=1")).json()) as FinishedGamesResponse;
    expect(first.games.map((g) => g.id)).toEqual(["b"]);
    const second = (await (await get(`?limit=1&before=${encodeURIComponent(first.next!)}`)).json()) as FinishedGamesResponse;
    expect(second.games.map((g) => g.id)).toEqual(["a"]);
    expect(second.next).toBeNull();
    expect(JSON.stringify(second)).not.toContain(ann);
  });

  it("refuses a cursor it didn't make, and other methods", async () => {
    const bad = await get("?before=1%3B%20DROP");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_cursor" });
    const post = await handleAuth(new Request("https://mush.test/api/games", { method: "POST" }), {} as Env, { store: accounts, games: store, now: 1 } as never);
    expect(post?.status).toBe(405);
  });
});
