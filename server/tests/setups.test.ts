import {
  MAX_SETUP_POSTS_PER_ACCOUNT,
  MAX_SETUPS_PER_ACCOUNT,
  type PostSetupResponse,
  STANDARD_KNOBS,
  type SetupListResponse,
  type SetupLookupResponse,
  type SetupTexts,
} from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore, type SqlDatabase } from "../src/accountStore.ts";
import { handleAuth } from "../src/auth.ts";
import { MAX_SETUP_BODY } from "../src/setupRoutes.ts";
import { SetupStore } from "../src/setupStore.ts";
import { migratedDatabase } from "./sqliteD1.ts";

const T0 = 1_000_000_000_000;
const en = (name: string, description = ""): SetupTexts => ({ en: { name, description } });
const knobs = (o: Partial<typeof STANDARD_KNOBS> = {}) => ({ ...STANDARD_KNOBS, ...o });

let db: SqlDatabase;
let accounts: AccountStore;
let setups: SetupStore;
let now: number;

async function account(name: string): Promise<string> {
  const created = await accounts.createAccount(name, "google", `g-${name}`, now);
  if (!created.ok) throw new Error(created.reason);
  return created.account.id;
}

beforeEach(() => {
  db = migratedDatabase();
  accounts = new AccountStore(db);
  setups = new SetupStore(db);
  now = T0;
});

describe("SetupStore", () => {
  /** Posts and returns the new setup's ID, failing the test if refused. */
  async function post(owner: string, name: string, previousId?: string): Promise<string> {
    const result = await setups.post(owner, { text: en(name), knobs: knobs(), ...(previousId && { previousId }) }, "abc123", now++);
    if (!result.ok) throw new Error(result.reason);
    return result.setup.id;
  }

  it("stores a setup with the owner's name, version 1 and the rules version", async () => {
    const ann = await account("Ann");
    const result = await setups.post(ann, { text: en("Fast", "Short cycles"), knobs: knobs({ cycleHours: 1 }) }, "abc123", now);
    expect(result).toEqual({
      ok: true,
      setup: {
        id: expect.any(String),
        text: en("Fast", "Short cycles"),
        ownerName: "Ann",
        version: 1,
        rulesVersion: "abc123",
        createdAt: now,
        knobs: knobs({ cycleHours: 1 }),
      },
    });
    expect(JSON.stringify(result)).not.toContain(ann);
  });

  it("numbers versions along the chain, and lists only the newest of each setup", async () => {
    const ann = await account("Ann");
    const v1 = await post(ann, "Fast");
    const other = await post(ann, "Slow");
    const v2 = await post(ann, "Fast 2", v1);
    const v3 = await post(ann, "Fast 3", v2);
    expect(await setups.get(v3)).toMatchObject({ version: 3, previousId: v2, latest: true });
    expect(await setups.get(v1)).toMatchObject({ version: 1, latest: false, text: en("Fast"), knobs: knobs() });
    expect((await setups.get(v1))?.previousId).toBeUndefined();
    // Newest first.
    expect((await setups.list()).map((l) => l.setup.id)).toEqual([v3, other]);
  });

  it("gives a new version only to the newest version, by the same owner", async () => {
    const ann = await account("Ann");
    const bob = await account("Bob");
    const v1 = await post(ann, "Fast");
    const textAndKnobs = { text: en("Mine now"), knobs: knobs() };
    expect(await setups.post(bob, { ...textAndKnobs, previousId: v1 }, "dev", now)).toEqual({ ok: false, reason: "not_owner" });
    expect(await setups.post(ann, { ...textAndKnobs, previousId: "nope" }, "dev", now)).toEqual({ ok: false, reason: "not_found" });
    await post(ann, "Fast 2", v1);
    expect(await setups.post(ann, { ...textAndKnobs, previousId: v1 }, "dev", now)).toEqual({ ok: false, reason: "not_latest" });
    expect(await setups.counts(ann)).toEqual({ setups: 1, posts: 2 });
  });

  it(`allows ${MAX_SETUPS_PER_ACCOUNT} setups per account, with new versions not counted`, async () => {
    const ann = await account("Ann");
    let last = "";
    for (let i = 0; i < MAX_SETUPS_PER_ACCOUNT; i++) last = await post(ann, `Setup ${i}`);
    expect(await setups.post(ann, { text: en("One more"), knobs: knobs() }, "dev", now)).toEqual({ ok: false, reason: "setup_cap" });
    await post(ann, "A new version", last);
    // Another account has its own cap.
    await post(await account("Bob"), "Bob's");
    expect(await setups.counts(ann)).toEqual({ setups: MAX_SETUPS_PER_ACCOUNT, posts: MAX_SETUPS_PER_ACCOUNT + 1 });
  });

  it(`allows ${MAX_SETUP_POSTS_PER_ACCOUNT} posts per account in all, new setups and versions alike`, async () => {
    const ann = await account("Ann");
    let last = await post(ann, "v1");
    for (let i = 1; i < MAX_SETUP_POSTS_PER_ACCOUNT; i++) last = await post(ann, `v${i + 1}`, last);
    expect(await setups.post(ann, { text: en("v501"), knobs: knobs(), previousId: last }, "dev", now)).toEqual({ ok: false, reason: "post_cap" });
    expect(await setups.post(ann, { text: en("New"), knobs: knobs() }, "dev", now)).toEqual({ ok: false, reason: "post_cap" });
    expect(await setups.counts(ann)).toEqual({ setups: 1, posts: MAX_SETUP_POSTS_PER_ACCOUNT });
  });

  it("drops a setup that no longer validates from the list, but still finds it by ID", async () => {
    const ann = await account("Ann");
    const id = await post(ann, "Old rules");
    // As if a rules change had removed 6-hour cycles, or the knob had been renamed.
    await db.prepare("UPDATE setups SET knobs = ? WHERE id = ?").bind(JSON.stringify({ ...knobs(), cycleHours: 5 }), id).run();
    expect(await setups.list()).toEqual([]);
    expect(await setups.get(id)).toMatchObject({ id, text: en("Old rules"), ownerName: "Ann", knobs: null, latest: true });
  });

  it("finds which setups are on the ballot: each one's newest version, if it still validates (#236)", async () => {
    const ann = await account("Ann");
    const v1 = await post(ann, "Fast");
    const v2 = await post(ann, "Fast", v1);
    const other = await post(ann, "Other");
    const broken = await post(ann, "Old rules");
    await db.prepare("UPDATE setups SET knobs = ? WHERE id = ?").bind(JSON.stringify({ ...knobs(), cycleHours: 5 }), broken).run();
    const ids = async (asked: string[]) => (await setups.ballot(asked)).map((s) => s.id).sort();
    expect(await ids([v1, v2, other, broken, "standard", "nope"])).toEqual([v2, other].sort());
    expect(await setups.ballot([])).toEqual([]);
    expect((await setups.ballot([v2]))[0]).toEqual((await setups.list()).find((l) => l.setup.id === v2)?.setup);
    // More ids than one statement takes.
    const many = [];
    for (const owner of [await account("Bo"), await account("Cy"), await account("Di")]) {
      for (let i = 0; i < 40; i++) many.push(await post(owner, `S${i}`));
    }
    expect(await ids([...many, v2])).toEqual([...many, v2].sort());
  });

  it("shows the owner's current display name", async () => {
    const ann = await account("Ann");
    const id = await post(ann, "Fast");
    expect(await accounts.rename(ann, "Anna", now)).toBe("ok");
    expect((await setups.list())[0]?.setup.ownerName).toBe("Anna");
    expect((await setups.get(id))?.ownerName).toBe("Anna");
  });
});

describe("setup routes", () => {
  const ORIGIN = "https://mush.test";
  const ENV = {} as Env;

  async function request(path: string, init: RequestInit = {}, env: Env = ENV): Promise<Response> {
    const response = await handleAuth(new Request(`${ORIGIN}${path}`, init), env, { store: accounts, setups, now });
    if (!response) throw new Error(`not a route: ${path}`);
    return response;
  }

  /** A signed-in account's request headers. */
  async function signedIn(name: string): Promise<{ id: string; headers: Record<string, string> }> {
    const id = await account(name);
    const session = await accounts.createSession(id, now + 1_000_000);
    return { id, headers: { Cookie: `__Host-mush2_session=${session}` } };
  }

  function postBody(body: unknown, headers: Record<string, string> = {}): RequestInit {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "Content-Length": String(new TextEncoder().encode(text).length) },
      body: text,
    };
  }

  const list = async (headers: Record<string, string> = {}): Promise<SetupListResponse> =>
    (await request("/api/setups", { headers })).json();

  it("lists and looks up setups for anyone, signed in or not", async () => {
    const ann = await signedIn("Ann");
    const posted = (await (await request("/api/setups", postBody({ text: en("Fast"), knobs: knobs() }, ann.headers))).json()) as PostSetupResponse;
    if (!posted.ok) throw new Error(posted.reason);
    expect(await list()).toEqual({ setups: [posted.setup], mine: null });
    const lookup = await request(`/api/setups/${posted.setup.id}`);
    expect(lookup.status).toBe(200);
    expect(((await lookup.json()) as SetupLookupResponse).setup).toEqual({ ...posted.setup, latest: true });
    expect((await request("/api/setups/unknown")).status).toBe(404);
    expect(((await (await request("/api/setups/standard")).json()) as SetupLookupResponse).setup).toMatchObject({ id: "standard", knobs: STANDARD_KNOBS });
  });

  it("tells a signed-in player which listed setups are theirs and how much of each cap is used", async () => {
    const ann = await signedIn("Ann");
    const bob = await signedIn("Bob");
    const first = (await (await request("/api/setups", postBody({ text: en("Fast"), knobs: knobs() }, ann.headers))).json()) as PostSetupResponse;
    if (!first.ok) throw new Error(first.reason);
    const body = { text: en("Fast 2"), knobs: knobs(), previousId: first.setup.id };
    const second = (await (await request("/api/setups", postBody(body, ann.headers))).json()) as PostSetupResponse;
    if (!second.ok) throw new Error(second.reason);
    expect(second.setup).toMatchObject({ version: 2, previousId: first.setup.id });
    await request("/api/setups", postBody({ text: en("Bob's"), knobs: knobs() }, bob.headers));
    expect((await list(ann.headers)).mine).toEqual({ ids: [second.setup.id], setups: 1, posts: 2 });
  });

  it("needs an account to post", async () => {
    const response = await request("/api/setups", postBody({ text: en("Fast"), knobs: knobs() }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, reason: "signed_out" });
  });

  it("moderates the text, and refuses malformed bodies and unknown fields", async () => {
    const { headers } = await signedIn("Ann");
    const post = async (body: unknown) => (await request("/api/setups", postBody(body, headers))).json();
    expect(await post({ text: { fr: { name: "Pas de shit", description: "" } }, knobs: knobs() })).toMatchObject({
      ok: true,
      setup: { text: { fr: { name: "Pas de ****", description: "" } } },
    });
    expect(await post({ text: { es: { name: " ", description: "" } }, knobs: knobs() })).toEqual({ ok: false, reason: "name_empty", lang: "es" });
    expect(await post({ text: {}, knobs: knobs() })).toEqual({ ok: false, reason: "no_text" });
    expect(await post({ text: en("Fast"), knobs: knobs({ seats: 4, mushCount: 3 }) })).toEqual({ ok: false, reason: "invalid" });
    expect(await post({ text: en("Fast"), knobs: knobs(), ownerName: "Someone" })).toEqual({ ok: false, reason: "invalid" });
    expect(await post({ text: en("Fast"), knobs: { ...knobs(), startAp: 20 } })).toEqual({ ok: false, reason: "invalid" });
    expect(await post("not json")).toEqual({ ok: false, reason: "invalid" });
    const huge = { text: en("Fast", "x".repeat(MAX_SETUP_BODY)), knobs: knobs() };
    expect(await post(huge)).toEqual({ ok: false, reason: "invalid" });
    const form = await request("/api/setups", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: "a=1" });
    expect(await form.json()).toEqual({ ok: false, reason: "invalid" });
    expect((await list()).setups).toHaveLength(1);
  });

  it("refuses a new version of someone else's setup", async () => {
    const ann = await signedIn("Ann");
    const bob = await signedIn("Bob");
    const posted = (await (await request("/api/setups", postBody({ text: en("Fast"), knobs: knobs() }, ann.headers))).json()) as PostSetupResponse;
    if (!posted.ok) throw new Error(posted.reason);
    const response = await request("/api/setups", postBody({ text: en("Mine"), knobs: knobs(), previousId: posted.setup.id }, bob.headers));
    expect(await response.json()).toEqual({ ok: false, reason: "not_owner" });
  });

  it("limits posts per account with SETUP_POST_LIMIT, and only posts", async () => {
    let calls = 0;
    const keys: string[] = [];
    const limit = { limit: vi.fn(async ({ key }: { key: string }) => (keys.push(key), { success: ++calls <= 3 })) };
    const env = { SETUP_POST_LIMIT: limit } as unknown as Env;
    const ann = await signedIn("Ann");
    for (let i = 0; i < 3; i++) {
      expect((await request("/api/setups", postBody({ text: en(`S${i}`), knobs: knobs() }, ann.headers), env)).status).toBe(200);
    }
    const refused = await request("/api/setups", postBody({ text: en("S3"), knobs: knobs() }, ann.headers), env);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ reason: "rate_limited" });
    expect(keys).toEqual(Array(4).fill(`account:${ann.id}`));
    await request("/api/setups", { headers: ann.headers }, env);
    expect(limit.limit).toHaveBeenCalledTimes(4);
  });

  it("never sends an account ID", async () => {
    const ann = await signedIn("Ann");
    const posted = await (await request("/api/setups", postBody({ text: en("Fast"), knobs: knobs() }, ann.headers))).text();
    const { setups: [setup] } = await list(ann.headers);
    const lookup = await (await request(`/api/setups/${setup?.id}`)).text();
    for (const text of [posted, JSON.stringify(await list()), JSON.stringify((await list(ann.headers)).setups), lookup]) {
      expect(text).not.toContain(ann.id);
    }
  });

  it("answers other methods with 405", async () => {
    expect((await request("/api/setups", { method: "DELETE" })).status).toBe(405);
    expect((await request("/api/setups/x", { method: "POST" })).status).toBe(405);
  });
});
