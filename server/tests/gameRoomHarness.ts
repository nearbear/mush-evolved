// Shared setup for the GameRoom test files. Each test file must call
// `vi.mock("partyserver", () => ({ Server: FakeServer }))` itself: vi.mock is hoisted only in test files,
// and it has to be in place before this module imports GameRoom.
import {
  fullViewFor,
  rebuildGame,
  rebuildHistory,
  type GameServerMessage,
  type GameSetup,
  type GameState,
  type PlayerView,
  type RecordedInput,
  type Role,
  type SeatStarts,
} from "@mush2/shared";
import { expect } from "vitest";
import { FakeConnection, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";
import { GameRoom, RECLAIM_DELAY_MS } from "../src/GameRoom.ts";
export { GameRoom, RECLAIM_DELAY_MS };

export type Conn = FakeConnection<{ playerId: string }>;
export type Room = InstanceType<typeof GameRoom>;

// The room is a Durable Object; these tests drive it through the same
// methods the runtime calls (setup, onConnect, onMessage) with fake sockets.
// Every room has a D1, as every deployment does: the running-ships row (#431) is written at launch.
export const asRoom = (storage: FakeStorage, env: Record<string, string> = {}): Room =>
  new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase(), ...env } as never);

export async function newRoom(humans = 3, storage = new FakeStorage(), env: Record<string, string> = {}, roles?: Record<string, Role>) {
  const room = asRoom(storage, env);
  await room.setup(seats(humans), tokensFor(humans), roles);
  return { room, storage };
}

export function connect(room: Room, token: string | null, id = `c-${token}`): Conn {
  const conn: Conn = new FakeConnection(id);
  (room as unknown as FakeServer).connections.add(conn as never);
  const url = `http://x/parties/game-room/r${token ? `?token=${token}` : ""}`;
  room.onConnect(conn as never, { request: new Request(url) } as never);
  return conn;
}

/** End cycle (`ready`) is offered only where cheats are allowed. */
export const CHEATS = { ALLOW_CHEATS: "true" };
/** A local dev server: bot fill, looser rate limits and the dev model key. */
export const DEV = { ...CHEATS, DEV_SERVER: "true" };
export const HOUR = 60 * 60 * 1000;

/**
 * The record's history rebuilds the `fullViewFor` of the record's own rebuild after every input, and before each that
 * carries a copy. A restart's `dropQueues` (#384) carries the view as loaded, its actions already dropped: the view
 * after it.
 */
export function expectHistory(setup: GameSetup, record: readonly RecordedInput[], starts: SeatStarts): void {
  const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
  const frames = rebuildHistory(record.map((r) => r.history!));
  expect(frames).toHaveLength(record.length);
  frames.forEach(({ base, view }, i) => {
    expect(view, `after input ${i} (${record[i]!.input.type})`).toEqual(json(fullViewFor(rebuildGame(setup, record.slice(0, i + 1)), starts)));
    const loaded = record[i]!.input.type === "dropQueues" ? i + 1 : i;
    if (base) expect(base, `before input ${i}`).toEqual(json(fullViewFor(rebuildGame(setup, record.slice(0, loaded)), starts)));
  });
}
/** When the next 3-hour cycle begins after `at`. */
export const nextCycleAt = (at: number) => (Math.floor(at / (3 * HOUR)) + 1) * 3 * HOUR;

/** A chat router reply (#341) naming every bot the router prompt says it may wake. */
export const wakeAll = (prompt: string): string => {
  const names = prompt.split("\n").flatMap((l) => l.match(/^- (.+?)(?: \(.*\))?: AI, can wake$/)?.[1] ?? []);
  return `WAKE: ${names.join(", ") || "nobody"}`;
};

export const send = (room: Room, conn: Conn, msg: unknown) => room.onMessage(conn as never, typeof msg === "string" ? msg : JSON.stringify(msg));
export const lastMsg = (c: Conn) => c.messages<GameServerMessage>().at(-1)!;
/** The last view message, which a `chatRead` may follow (#400). */
export const lastViewMsg = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "view").at(-1)!;
export const lastView = (c: Conn): PlayerView => {
  const views = c.messages<GameServerMessage>().filter((m) => m.type === "view");
  return (views.at(-1) as { view: PlayerView }).view;
};
/** The room's in-memory game, config included. */
export const gameOf = (room: Room) => (room as unknown as { game: GameState }).game;
