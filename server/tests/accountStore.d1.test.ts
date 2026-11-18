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
import { STANDARD_KNOBS } from "@mush2/shared";
import { AccountStore } from "../src/accountStore.ts";
import { GameStore } from "../src/gameStore.ts";
import { SetupStore } from "../src/setupStore.ts";
import { ShipStore } from "../src/shipStore.ts";

const SERVER = resolve(import.meta.dirname, "..");

let dir: string;
let prevRegistryPath: string | undefined;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mush2-d1-"));
  prevRegistryPath = process.env.WRANGLER_REGISTRY_PATH;
  // Keep wrangler's dev registry inside the throwaway dir rather than ~/.config/.wrangler.
  process.env.WRANGLER_REGISTRY_PATH = join(dir, "registry");
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
  if (prevRegistryPath === undefined) delete process.env.WRANGLER_REGISTRY_PATH;
  else process.env.WRANGLER_REGISTRY_PATH = prevRegistryPath;
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
  expect(await store.addIdentity(account.id, "discord", "d-9", 3000)).toBe("provider_linked");
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
  expect(await store.deleteExpired(15_000)).toBe(0);
  await store.deleteSession(session);
  expect(await store.getSession(session, 9000)).toBeNull();

  const signup = await store.createSignup({ provider: "discord", providerUserId: "d-2", suggestedName: null }, 10_000);
  expect(await store.getSignup(signup, 9000)).toEqual({ provider: "discord", providerUserId: "d-2", suggestedName: null });
  expect(await store.nameTaken("PAOLA")).toBe(true);
  expect(await store.nameTaken("paola", account.id)).toBe(false);
  await store.createSession(account.id, 10_000);
  expect(await store.deleteExpired(10_000)).toBe(2);
  expect(await store.getSignup(signup, 9000)).toBeNull();
  const signup2 = await store.createSignup({ provider: "discord", providerUserId: "d-3", suggestedName: "Raluca" }, 10_000);
  await store.deleteSignup(signup2);
  expect(await store.getSignup(signup2, 9000)).toBeNull();

  expect(await store.boardShip(account.id, "ship-1", 1)).toBe("ok");
  expect(await store.boardShip(account.id, "ship-2", 2)).toBe("already_aboard");
  expect(await store.currentShip(account.id)).toBe("ship-1");
  await store.leaveShip(account.id, "ship-1", 3);
  expect(await store.boardShip(account.id, "ship-2", 4)).toBe("ok");
  expect(await store.endShip("ship-2", 5)).toBe(1);
  expect(await store.ships(account.id)).toHaveLength(2);
}, 30_000);

it("runs every setup store statement on D1", async () => {
  const accounts = new AccountStore(proxy.env.DB);
  const setups = new SetupStore(proxy.env.DB);
  const created = await accounts.createAccount("Setter", "google", "g-setups", 1000);
  if (!created.ok) throw new Error(created.reason);
  const owner = created.account.id;
  const input = { text: { en: { name: "Fast", description: "" } }, knobs: { ...STANDARD_KNOBS, cycleHours: 1 as const } };

  const v1 = await setups.post(owner, input, "dev", 1);
  if (!v1.ok) throw new Error(v1.reason);
  const v2 = await setups.post(owner, { ...input, previousId: v1.setup.id }, "dev", 2);
  expect(v2).toMatchObject({ ok: true, setup: { version: 2, previousId: v1.setup.id, ownerName: "Setter" } });
  // The unique index's error, recognized by its message as on node:sqlite.
  expect(await setups.post(owner, { ...input, previousId: v1.setup.id }, "dev", 3)).toEqual({ ok: false, reason: "not_latest" });
  expect(await setups.post(owner, { ...input, previousId: "nope" }, "dev", 3)).toEqual({ ok: false, reason: "not_found" });
  expect((await setups.list()).map((l) => l.setup.version)).toEqual([2]);
  expect(await setups.get(v1.setup.id)).toMatchObject({ latest: false, knobs: input.knobs });
  expect(await setups.counts(owner)).toEqual({ setups: 1, posts: 2 });
  expect((await setups.ballot([v1.setup.id, v2.ok ? v2.setup.id : "", "standard"])).map((s) => s.version)).toEqual([2]);
}, 30_000);

it("runs every game and ship store statement on D1", async () => {
  const accounts = new AccountStore(proxy.env.DB);
  const games = new GameStore(proxy.env.DB);
  const created = await accounts.createAccount("Finisher", "google", "g-games", 1000);
  if (!created.ok) throw new Error(created.reason);
  const crew = [
    { seat: "p0", accountId: created.account.id, name: "Finisher", isBot: false, startCharacter: "chun", endCharacter: "chun", startRole: "mush", endRole: "mush", alive: true },
    { seat: "p1", accountId: null, name: "Bot", isBot: true, startCharacter: "chao", endCharacter: "chao", startRole: "human", endRole: "human", alive: false },
  ] as const;
  const record = (id: string, endedAt: number) => ({
    id,
    language: "en" as const,
    singlePlayer: false,
    startedAt: 1,
    endedAt,
    cycles: 3,
    winner: "mush" as const,
    ending: "humans_dead" as const,
    setupId: null,
    rulesVersion: "dev",
    crew: crew.map((c) => ({ ...c })),
  });
  // The running-ships row (#431) goes in the same batch as the games row.
  const ships = new ShipStore(proxy.env.DB);
  await ships.launched({ roomId: "g1", language: "en", singlePlayer: false, seats: 16, launchedAt: 1 });
  await ships.launched({ roomId: "g1", language: "en", singlePlayer: false, seats: 16, launchedAt: 1 });
  await ships.launched({ roomId: "solo", language: null, singlePlayer: true, seats: 9, launchedAt: 1 });
  await games.recordFinished(record("g1", 10));
  await games.recordFinished(record("g1", 10));
  expect(await ships.roomIds()).toEqual(["solo"]);
  await ships.ended("solo");
  expect(await ships.roomIds()).toEqual([]);
  await games.recordFinished(record("g2", 20));
  const first = await games.listFinished({ limit: 1 });
  expect(first.games.map((g) => g.id)).toEqual(["g2"]);
  expect(first.games[0]!.crew).toHaveLength(2);
  const second = await games.listFinished({ limit: 1, before: first.next! });
  expect(second).toMatchObject({ games: [{ id: "g1" }], next: null });
}, 30_000);
