// Smoke test on local D1: the Miniflare D1 that `wrangler dev` runs, reached
// through wrangler's getPlatformProxy, in a throwaway directory so it never
// touches the dev server's data. Migrations go in through
// `wrangler d1 migrations apply --local`, the same command the deploy scripts
// run remotely. accountStore.test.ts covers the behavior on node:sqlite; this
// runs each of the store's statements once on D1 itself, including the
// constraint errors the store recognizes by message.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AccountStore } from "../src/accountStore.ts";

const SERVER = resolve(import.meta.dirname, "..");

let dir: string;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mush2-d1-"));
  execFileSync(resolve(SERVER, "../node_modules/.bin/wrangler"), ["d1", "migrations", "apply", "DB", "--local", "--persist-to", dir], {
    cwd: SERVER,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
  proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: resolve(SERVER, "wrangler.jsonc"),
    persist: { path: join(dir, "v3") },
    envFiles: [],
    remoteBindings: false,
  });
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

it("runs every store statement on D1", async () => {
  const store = new AccountStore(proxy.env.DB);

  const created = await store.createAccount("Chun", "google", "g-1", 1000);
  if (!created.ok) throw new Error(created.reason);
  const { account } = created;
  expect(await store.createAccount("CHUN", "google", "g-2", 1000)).toEqual({ ok: false, reason: "name_taken" });
  expect(await store.createAccount("Roland", "google", "g-1", 1000)).toEqual({ ok: false, reason: "identity_taken" });
  expect(await store.findAccountByIdentity("google", "g-2")).toBeNull();
  expect(await store.addIdentity(account.id, "discord", "d-1", 2000)).toBe("ok");
  expect(await store.addIdentity(account.id, "discord", "d-1", 3000)).toBe("identity_taken");
  expect(await store.getAccount(account.id)).toEqual(account);
  expect(await store.findAccountByIdentity("discord", "d-1")).toEqual(account);
  expect(await store.identities(account.id)).toHaveLength(2);

  expect((await store.createAccount("Roland", "google", "g-3", 1000)).ok).toBe(true);
  expect(await store.rename(account.id, "roland", 5000)).toBe("name_taken");
  expect(await store.rename(account.id, "Paola", 5000)).toBe("ok");
  expect(await store.rename(account.id, "Kuan Ti", 5500)).toBe("too_soon");
  expect(await store.nameHistory(account.id)).toEqual([{ oldName: "Chun", newName: "Paola", at: 5000 }]);

  const session = await store.createSession(account.id, 10_000);
  expect(await store.getSession(session, 9000)).toEqual({ accountId: account.id, expiresAt: 10_000 });
  expect(await store.renewSession(session, 9000, 20_000)).toBe(true);
  expect(await store.deleteExpiredSessions(15_000)).toBe(0);
  await store.deleteSession(session);
  expect(await store.getSession(session, 9000)).toBeNull();

  expect(await store.boardShip(account.id, "ship-1", 1)).toBe("ok");
  expect(await store.boardShip(account.id, "ship-2", 2)).toBe("already_aboard");
  expect(await store.currentShip(account.id)).toBe("ship-1");
  await store.leaveShip(account.id, "ship-1", 3);
  expect(await store.boardShip(account.id, "ship-2", 4)).toBe("ok");
  expect(await store.endShip("ship-2", 5)).toBe(1);
  expect(await store.ships(account.id)).toHaveLength(2);
}, 30_000);
