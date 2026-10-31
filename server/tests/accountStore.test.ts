import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore, nameKey, RENAME_INTERVAL_MS, type SqlDatabase } from "../src/accountStore.ts";
import { migratedDatabase, migrationFiles } from "./sqliteD1.ts";

const DAY = 24 * 60 * 60 * 1000;

let db: SqlDatabase;
let store: AccountStore;

beforeEach(() => {
  db = migratedDatabase();
  store = new AccountStore(db);
});

async function newAccount(name: string, providerUserId = name, now = 1000) {
  const result = await store.createAccount(name, "google", providerUserId, now);
  if (!result.ok) throw new Error(result.reason);
  return result.account;
}

describe("migrations", () => {
  it("are numbered 0001, 0002, ... with no gaps, so name order is apply order", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    files.forEach((f, i) => expect(f).toMatch(new RegExp(`^${String(i + 1).padStart(4, "0")}_[a-z0-9_]+\\.sql$`)));
  });

  it("all apply in order to a fresh database", () => {
    expect(() => migratedDatabase()).not.toThrow();
  });
});

describe("accounts", () => {
  it("creates an account and finds it by its identity", async () => {
    const account = await newAccount("Chun", "g-1", 5);
    expect(account).toEqual({ id: expect.any(String), displayName: "Chun", createdAt: 5, renamedAt: null });
    expect(await store.getAccount(account.id)).toEqual(account);
    expect(await store.findAccountByIdentity("google", "g-1")).toEqual(account);
    expect(await store.findAccountByIdentity("discord", "g-1")).toBeNull();
  });

  it("rejects a name taken by another account, ignoring case, and writes nothing", async () => {
    await newAccount("Chun", "g-1");
    expect(await store.createAccount("CHUN", "google", "g-2", 1)).toEqual({ ok: false, reason: "name_taken" });
    // The batch is atomic: the identity insert after the failed account insert didn't land.
    expect(await store.findAccountByIdentity("google", "g-2")).toBeNull();
  });

  it("rejects an identity already linked, and rolls back the account it would have created", async () => {
    await newAccount("Chun", "g-1");
    expect(await store.createAccount("Kuan Ti", "google", "g-1", 1)).toEqual({ ok: false, reason: "identity_taken" });
    // The name is still free, so the account insert was undone.
    expect((await store.createAccount("Kuan Ti", "google", "g-3", 1)).ok).toBe(true);
  });

  it("links several sign-in methods to one account", async () => {
    const account = await newAccount("Chun", "g-1");
    expect(await store.addIdentity(account.id, "discord", "d-1", 2000)).toBe("ok");
    expect(await store.addIdentity(account.id, "discord", "d-1", 3000)).toBe("identity_taken");
    expect(await store.findAccountByIdentity("discord", "d-1")).toEqual(account);
    expect(await store.identities(account.id)).toEqual([
      { provider: "google", providerUserId: "g-1" },
      { provider: "discord", providerUserId: "d-1" },
    ]);
  });

  it("refuses an identity for an account that doesn't exist", async () => {
    await expect(store.addIdentity("nobody", "discord", "d-1", 2)).rejects.toThrow(/FOREIGN KEY/);
  });

  it("lower-cases name keys", () => {
    expect(nameKey("Kuan Ti")).toBe("kuan ti");
  });
});

describe("renames", () => {
  it("renames, records the history, and frees the old name at once", async () => {
    const account = await newAccount("Chun");
    expect(await store.rename(account.id, "Roland", 2 * DAY)).toBe("ok");
    expect(await store.getAccount(account.id)).toMatchObject({ displayName: "Roland", renamedAt: 2 * DAY });
    expect(await store.nameHistory(account.id)).toEqual([{ oldName: "Chun", newName: "Roland", at: 2 * DAY }]);
    expect((await store.createAccount("chun", "google", "other", 3 * DAY)).ok).toBe(true);
  });

  it("allows a change of case only", async () => {
    const account = await newAccount("chun");
    expect(await store.rename(account.id, "Chun", 2)).toBe("ok");
  });

  it("refuses a name another account has, and records nothing", async () => {
    const a = await newAccount("Chun", "g-1");
    await newAccount("Roland", "g-2");
    expect(await store.rename(a.id, "roland", 2)).toBe("name_taken");
    expect(await store.getAccount(a.id)).toMatchObject({ displayName: "Chun", renamedAt: null });
    expect(await store.nameHistory(a.id)).toEqual([]);
  });

  it("allows the first rename at once, then one per 24 hours, recording nothing when refused", async () => {
    const account = await newAccount("Chun");
    expect(RENAME_INTERVAL_MS).toBe(DAY);
    expect(await store.rename(account.id, "Roland", 10 * DAY)).toBe("ok");
    expect(await store.rename(account.id, "Paola", 11 * DAY - 1)).toBe("too_soon");
    expect(await store.nameHistory(account.id)).toHaveLength(1);
    expect(await store.rename(account.id, "Paola", 11 * DAY)).toBe("ok");
    expect((await store.nameHistory(account.id)).map((h) => h.newName)).toEqual(["Roland", "Paola"]);
  });

  it("reports an unknown account as too_soon", async () => {
    expect(await store.rename("nobody", "Chun", 2)).toBe("too_soon");
  });
});

describe("sessions", () => {
  it("stores only the session ID's hash", async () => {
    const account = await newAccount("Chun");
    const id = await store.createSession(account.id, 100);
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await db.prepare("SELECT id_hash FROM sessions").all<{ id_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.results[0]!.id_hash).not.toContain(id);
  });

  it("finds a session until it expires, renews it, and deletes it", async () => {
    const account = await newAccount("Chun");
    const id = await store.createSession(account.id, 100);
    expect(await store.getSession(id, 99)).toEqual({ accountId: account.id, expiresAt: 100 });
    expect(await store.getSession(id, 100)).toBeNull();
    expect(await store.renewSession(id, 99, 200)).toBe(true);
    expect(await store.getSession(id, 150)).toEqual({ accountId: account.id, expiresAt: 200 });
    await store.deleteSession(id);
    expect(await store.getSession(id, 150)).toBeNull();
  });

  it("doesn't renew an expired session", async () => {
    const account = await newAccount("Chun");
    const id = await store.createSession(account.id, 100);
    expect(await store.renewSession(id, 100, 200)).toBe(false);
    expect(await store.getSession(id, 150)).toBeNull();
  });

  it("doesn't find an unknown session ID", async () => {
    expect(await store.getSession("not-a-session", 0)).toBeNull();
  });

  it("deletes only expired sessions", async () => {
    const account = await newAccount("Chun");
    const old = await store.createSession(account.id, 100);
    const live = await store.createSession(account.id, 300);
    expect(await store.deleteExpiredSessions(200)).toBe(1);
    expect(await store.getSession(old, 0)).toBeNull();
    expect(await store.getSession(live, 0)).not.toBeNull();
  });
});

describe("ships", () => {
  it("allows one ship at a time per account", async () => {
    const a = await newAccount("Chun", "g-1");
    const b = await newAccount("Roland", "g-2");
    expect(await store.boardShip(a.id, "ship-1", 1)).toBe("ok");
    expect(await store.boardShip(a.id, "ship-2", 2)).toBe("already_aboard");
    expect(await store.boardShip(b.id, "ship-1", 2)).toBe("ok");
    expect(await store.currentShip(a.id)).toBe("ship-1");
  });

  it("frees an account that leaves, and keeps the history", async () => {
    const a = await newAccount("Chun");
    await store.boardShip(a.id, "ship-1", 1);
    await store.leaveShip(a.id, "ship-1", 5);
    expect(await store.currentShip(a.id)).toBeNull();
    expect(await store.boardShip(a.id, "ship-2", 6)).toBe("ok");
    expect(await store.ships(a.id)).toEqual([
      { roomId: "ship-2", joinedAt: 6, endedAt: null },
      { roomId: "ship-1", joinedAt: 1, endedAt: 5 },
    ]);
  });

  it("leaving another ship changes nothing", async () => {
    const a = await newAccount("Chun");
    await store.boardShip(a.id, "ship-1", 1);
    await store.leaveShip(a.id, "ship-2", 5);
    expect(await store.currentShip(a.id)).toBe("ship-1");
  });

  it("ending a ship frees everyone still aboard it, and only them", async () => {
    const a = await newAccount("Chun", "g-1");
    const b = await newAccount("Roland", "g-2");
    const c = await newAccount("Paola", "g-3");
    await store.boardShip(a.id, "ship-1", 1);
    await store.boardShip(b.id, "ship-1", 1);
    await store.boardShip(c.id, "ship-2", 1);
    await store.leaveShip(b.id, "ship-1", 3);
    expect(await store.endShip("ship-1", 9)).toBe(1);
    expect(await store.currentShip(a.id)).toBeNull();
    expect(await store.currentShip(c.id)).toBe("ship-2");
    expect((await store.ships(b.id))[0]!.endedAt).toBe(3);
  });
});
