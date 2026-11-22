import { STANDARD_SETUP, type GameState } from "@mush2/shared";
import { describe, expect, it, vi } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { handleAdmin, retireShips, type AdminDeps } from "../src/adminRoutes.ts";
import { ShipStore } from "../src/shipStore.ts";
import { FakeServer, FakeStorage } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";
import { GameRoom, connect } from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

const TOKEN = "s3cret-token";
const post = (path: string, auth?: string, method = "POST") =>
  new Request(`https://x${path}`, { method, headers: auth ? { Authorization: auth } : {} });

function fakeDeps(rows: string[], open: string[], retire: (id: string) => Promise<boolean>) {
  const rechecked = vi.fn(async () => {});
  const deps: AdminDeps = {
    ships: { roomIds: async () => rows } as unknown as ShipStore,
    openRooms: async () => open,
    retire,
    recheckLobbies: rechecked,
  };
  return { deps, rechecked };
}

describe("/admin/ routes", () => {
  const { deps } = fakeDeps(["a"], [], async () => true);

  it("leaves other paths alone", async () => {
    expect(await handleAdmin(post("/api/me"), { ADMIN_TOKEN: TOKEN }, () => deps)).toBeNull();
  });

  it("doesn't exist without ADMIN_TOKEN", async () => {
    expect((await handleAdmin(post("/admin/retire-ships", `Bearer ${TOKEN}`), {}, () => deps))?.status).toBe(404);
  });

  it("refuses a missing or wrong token before anything else", async () => {
    const make = vi.fn(() => deps);
    for (const auth of [undefined, "Bearer nope", TOKEN, `Basic ${TOKEN}`]) {
      expect((await handleAdmin(post("/admin/retire-ships", auth), { ADMIN_TOKEN: TOKEN }, make))?.status).toBe(401);
    }
    expect((await handleAdmin(post("/admin/other", "Bearer nope"), { ADMIN_TOKEN: TOKEN }, make))?.status).toBe(401);
    expect(make).not.toHaveBeenCalled();
  });

  it("takes POST only, and answers unknown admin paths 404", async () => {
    const env = { ADMIN_TOKEN: TOKEN };
    expect((await handleAdmin(post("/admin/retire-ships", `Bearer ${TOKEN}`, "GET"), env, () => deps))?.status).toBe(405);
    expect((await handleAdmin(post("/admin/nope", `Bearer ${TOKEN}`), env, () => deps))?.status).toBe(404);
  });

  it("retires with the right token", async () => {
    const res = await handleAdmin(post("/admin/retire-ships", `Bearer ${TOKEN}`), { ADMIN_TOKEN: TOKEN }, () => deps);
    expect(res?.status).toBe(200);
    expect(await res!.json()).toEqual({ retired: ["a"], skipped: [], failed: [] });
  });
});

describe("retireShips", () => {
  it("asks each listed and open ship once, sorts the answers, then rechecks the lobbies", async () => {
    const { deps, rechecked } = fakeDeps(["a", "b", "c"], ["c", "d"], async (id) => {
      if (id === "b") throw new Error("down");
      return id !== "d";
    });
    expect(await retireShips(deps)).toEqual({ retired: ["a", "c"], skipped: ["d"], failed: [{ roomId: "b", errorName: "Error", message: "down" }] });
    expect(rechecked).toHaveBeenCalledOnce();
  });
});

describe("GameRoom.retire", () => {
  async function shipWithAccounts() {
    const db = migratedDatabase();
    const store = new AccountStore(db);
    const ships = new ShipStore(db);
    const storage = new FakeStorage();
    const room = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: db } as never);
    const ids: string[] = [];
    const tokens: string[] = [];
    for (const [name, character] of [["Ann", "chao"], ["Bob", "chun"]] as const) {
      const created = await store.createAccount(name, "dev", name, Date.now());
      if (!created.ok) throw new Error(created.reason);
      ids.push(created.account.id);
      await store.boardShip(created.account.id, "test-room", Date.now());
      const joined = await room.join(name, character, STANDARD_SETUP, { accountId: created.account.id, sessionKey: `s-${name}` });
      if (!joined.ok) throw new Error(joined.error);
      tokens.push(joined.token);
    }
    await vi.waitFor(async () => expect(await ships.roomIds()).toEqual(["test-room"]));
    return { db, room, store, ships, storage, ids, tokens };
  }

  it("frees everyone, drops the ship's row and snapshot, keeps the record, and closes sockets", async () => {
    const { db, room, store, ships, storage, ids, tokens } = await shipWithAccounts();
    const ann = connect(room, tokens[0]!);
    expect(ann.closed).toBeNull();

    expect(await room.retire()).toBe(true);

    for (const id of ids) expect(await store.currentShip(id)).toBeNull();
    expect(await ships.roomIds()).toEqual([]);
    expect(storage.data.has("game")).toBe(false);
    expect(storage.data.has("setup")).toBe(true);
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(true);
    expect(storage.alarm).toBeNull();
    expect(ann.closed?.code).toBe(4001);
    expect(connect(room, tokens[1]!, "again").closed?.code).toBe(4001);
    expect(await room.join("Cat", "frieda", STANDARD_SETUP)).toEqual({ ok: false, error: "ship_closed" });
    expect(await room.resume(ids[0]!, "s")).toEqual({ ok: false });
    expect(room.running()).toBe(false);
    expect(room.status().closesAt).toBeNull();
    expect(await room.retire()).toBe(false);

    // Evicted and started again: still retired, so nothing launches over its record.
    const revived = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: db } as never);
    await revived.onStart();
    expect(await revived.join("Cat", "frieda", STANDARD_SETUP)).toEqual({ ok: false, error: "ship_closed" });
    expect(await revived.retire()).toBe(false);
  });

  it("leaves a ship that never launched alone", async () => {
    const room = new GameRoom({ storage: new FakeStorage() } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
    expect(await room.retire()).toBe(false);
    expect(await room.join("Ann", "chao")).toMatchObject({ ok: true });
  });

  it("changes nothing when D1 fails", async () => {
    const { room, storage } = await shipWithAccounts();
    (room as unknown as { env: { DB: unknown } }).env.DB = {
      prepare: () => {
        throw new Error("D1 down");
      },
    };
    await expect(room.retire()).rejects.toThrow("D1 down");
    expect(storage.data.has("game")).toBe(true);
    expect((room as unknown as { game: GameState | null }).game).not.toBeNull();
  });
});
