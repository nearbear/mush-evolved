import { CHAT_CHANNELS, type ConfigOverrides } from "@mush2/shared";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { FakeConnection, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";

vi.mock("partyserver", () => ({ Server: FakeServer }));
const { GameRoom, STATE_VERSION } = await import("../src/GameRoom.ts");

const SNAPSHOT = new URL("./state-shape.json", import.meta.url);
interface Snapshot {
  version: number;
  paths: string[];
}

/** Sorted key paths of a JSON value. Array elements share one `[]` path, so only the shape counts, not the contents. */
function keyPaths(value: unknown, at = "", out = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    for (const v of value) keyPaths(v, `${at}[]`, out);
    out.add(`${at}[]`);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) keyPaths(v, at ? `${at}.${k}` : k, out);
  } else out.add(at);
  return [...out].sort();
}

/**
 * Every key of ConfigOverrides, stored beside the game. Its keys are all optional, so `Required` makes this fail to
 * compile until a new key is added here, which then moves the fingerprint like a GameState change.
 */
const OVERRIDES: Required<ConfigOverrides> = {
  mushCount: 1,
  manualCycles: true,
  preselection: { seats: 4, endsOn: { day: 3, cycle: 8 }, twoMushAbove: 8, minPlayers: 3 },
};

async function freshStoredGame(): Promise<unknown> {
  const storage = new FakeStorage();
  const room = new GameRoom({ storage } as never, { RULES_VERSION: "test" } as never);
  await room.setup(seats(3), tokensFor(3));
  // One chat message, so `chat` entries are in the shape too.
  const conn = new FakeConnection<{ playerId: string }>("c");
  (room as unknown as FakeServer).connections.add(conn as never);
  room.onConnect(conn as never, { request: new Request("http://x/parties/game-room/r?token=tok0") } as never);
  await room.onMessage(conn as never, JSON.stringify({ type: "chat", channel: CHAT_CHANNELS[0], text: "hello" }));
  return (await storage.get<{ game: unknown }>("game"))!.game;
}

describe("stored GameState and ConfigOverrides shape", () => {
  it("matches the committed fingerprint, which moves only with a STATE_VERSION bump", async () => {
    const paths = [...keyPaths(await freshStoredGame()), ...keyPaths(OVERRIDES, "overrides")].sort();
    const committed = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
    const changed = JSON.stringify(paths) !== JSON.stringify(committed.paths);

    if (process.env.UPDATE_STATE_SHAPE) {
      if (changed && committed.version === STATE_VERSION) {
        throw new Error(`The stored shape changed: bump STATE_VERSION in server/src/GameRoom.ts (now ${STATE_VERSION}), then rerun.`);
      }
      writeFileSync(SNAPSHOT, `${JSON.stringify({ version: STATE_VERSION, paths }, null, 2)}\n`);
      return;
    }

    const added = paths.filter((p) => !committed.paths.includes(p));
    const removed = committed.paths.filter((p) => !paths.includes(p));
    expect(
      { added, removed },
      "The stored GameState or ConfigOverrides shape changed. Bump STATE_VERSION in server/src/GameRoom.ts (live games are discarded), then run `UPDATE_STATE_SHAPE=1 npm test -w server -- stateShape.test.ts`.",
    ).toEqual({ added: [], removed: [] });
    expect(committed.version, "STATE_VERSION changed without refreshing server/tests/state-shape.json: run `UPDATE_STATE_SHAPE=1 npm test -w server -- stateShape.test.ts`.").toBe(STATE_VERSION);
    // `it` needs no extra assertion: both checks above passed.
  });
});
