import { type MeResponse, STANDARD_KNOBS } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore, sha256Hex } from "../src/accountStore.ts";
import {
  LogoutResponseSchema,
  MeResponseSchema,
  PostSetupResponseSchema,
  RenameResponseSchema,
  SetupListResponseSchema,
  SetupLookupResponseSchema,
  SignupResponseSchema,
} from "../src/apiSchemas.ts";
import { api, handleAuth, RENEW_BELOW_MS, SESSION_MS, SIGNUP_MS } from "../src/auth.ts";
import { DOCUMENT_PATH, SCALAR_SCRIPT } from "../src/openapi.ts";
import { SetupStore } from "../src/setupStore.ts";
import { migratedDatabase } from "./sqliteD1.ts";

const ORIGIN = "https://mush.test";
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_000_000_000_000;

const ENV = {
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
  DISCORD_CLIENT_ID: "did",
  DISCORD_CLIENT_SECRET: "dsecret",
} as Env;

let store: AccountStore;
let setups: SetupStore;
let now: number;
/** The provider's answers: the profile its userinfo endpoint returns. */
let profiles: Record<string, Record<string, unknown>>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
/** Sessions whose seats were revoked: [account ID, session key]. */
let revoked: [string, string][];
/** What the auth routes call to revoke a session's seats; records into `revoked` unless a test swaps it. */
let revokeSeats: (accountId: string, sessionKey: string) => Promise<void>;

/** One browser: keeps cookies across requests, as a browser on one origin would. */
class Browser {
  cookies = new Map<string, string>();

  constructor(
    private env: Env = ENV,
    private origin = ORIGIN,
  ) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await handleAuth(new Request(`${this.origin}${path}`, { ...init, headers }), this.env, { store, setups, now, fetcher, revokeSeats });
    if (!response) throw new Error(`not an auth route: ${path}`);
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (/Max-Age=0\b/.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  post(path: string, body?: unknown) {
    const text = JSON.stringify(body ?? {});
    const length = String(new TextEncoder().encode(text).length);
    return this.request(path, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": length }, body: text });
  }

  async me(): Promise<MeResponse> {
    return (await this.request("/api/me")).json();
  }

  /** Runs start, the provider's consent (it echoes `state`), and the callback. Returns the final redirect. */
  async signInWith(provider: "google" | "discord", userId: string, name: string | null, link = false): Promise<string> {
    profiles[provider] = provider === "google" ? { sub: userId, name } : { id: userId, global_name: name, username: "fallback_user" };
    const start = await this.request(`/auth/${provider}/start${link ? "?link=1" : ""}`);
    const consent = new URL(start.headers.get("Location") ?? "");
    const state = consent.searchParams.get("state");
    const callback = await this.request(`/auth/${provider}/callback?code=the-code&state=${state}`);
    return callback.headers.get("Location") ?? "";
  }

  /** A new account through the full flow. */
  async signUp(provider: "google" | "discord", userId: string, name: string): Promise<string> {
    expect(await this.signInWith(provider, userId, name)).toBe("/?auth=signup");
    expect(await (await this.post("/api/signup", { name })).json()).toEqual({ ok: true });
    const me = await this.me();
    if (me.status !== "signed_in") throw new Error(me.status);
    return me.account.id;
  }
}

beforeEach(() => {
  const db = migratedDatabase();
  store = new AccountStore(db);
  setups = new SetupStore(db);
  now = T0;
  profiles = {};
  revoked = [];
  revokeSeats = async (a, k) => void revoked.push([a, k]);
  fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/token")) return Response.json({ access_token: "tok", token_type: "Bearer" });
    if (url.includes("googleapis.com")) return Response.json(profiles.google ?? {});
    if (url.includes("discord.com/api/users")) return Response.json(profiles.discord ?? {});
    return new Response("unexpected", { status: 500 });
  });
});

describe("OAuth start", () => {
  it("redirects to Google with state and a PKCE challenge, and keeps both in a __Host- cookie", async () => {
    const browser = new Browser();
    const response = await browser.request("/auth/google/start");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(location.searchParams.get("scope")).toBe("openid profile");
    expect(location.searchParams.get("state")).toMatch(/^[\w-]{43}$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^__Host-mush2_oauth=[^;]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);
  });

  it("asks Discord for identify only", async () => {
    const location = new URL((await new Browser().request("/auth/discord/start")).headers.get("Location") ?? "");
    expect(location.host).toBe("discord.com");
    expect(location.searchParams.get("scope")).toBe("identify");
  });

  it("is unavailable for a provider without credentials, and unknown providers don't exist", async () => {
    const browser = new Browser({ GOOGLE_CLIENT_ID: "gid" } as Env);
    expect((await browser.request("/auth/google/start")).status).toBe(503);
    expect((await browser.request("/auth/github/start")).status).toBe(404);
  });

  it("uses port-named cookies without Secure on a dev server", async () => {
    const handler = (path: string) =>
      handleAuth(new Request(`http://localhost:5173${path}`), { ...ENV, DEV_SERVER: "true" } as Env, { store, now, fetcher });
    const cookie = (await handler("/auth/google/start"))?.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^mush2_oauth_5173=[^;]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax$/);
  });
});

describe("OAuth callback", () => {
  it("refuses a callback this browser didn't start, without asking the provider", async () => {
    const victim = new Browser();
    await victim.request("/auth/google/start");
    // Wrong state.
    const forged = await victim.request("/auth/google/callback?code=c&state=attacker");
    expect(forged.headers.get("Location")).toBe("/?auth=failed");
    // The state cookie is single-use: gone after any callback.
    expect(victim.cookies.size).toBe(0);
    // No state cookie at all.
    expect((await new Browser().request("/auth/google/callback?code=c&state=s")).headers.get("Location")).toBe("/?auth=failed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a state started for another provider", async () => {
    const browser = new Browser();
    const start = await browser.request("/auth/google/start");
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    const response = await browser.request(`/auth/discord/callback?code=c&state=${state}`);
    expect(response.headers.get("Location")).toBe("/?auth=failed");
  });

  it("reports a cancelled consent as denied", async () => {
    const browser = new Browser();
    await browser.request("/auth/google/start");
    expect((await browser.request("/auth/google/callback?error=access_denied")).headers.get("Location")).toBe("/?auth=denied");
  });

  it("sends the code, redirect URI and PKCE verifier to the token endpoint", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(body.get("code_verifier")).toMatch(/^[\w-]{43}$/);
    expect(body.get("client_secret")).toBe("gsecret");
  });

  it("fails cleanly when the provider does", async () => {
    fetcher.mockImplementation(async () => new Response("no", { status: 400 }));
    const browser = new Browser();
    await browser.request("/auth/google/start");
    const state = [...browser.cookies.values()][0] ?? "";
    const decoded = JSON.parse(atob(state.replace(/-/g, "+").replace(/_/g, "/"))) as { state: string };
    const response = await browser.request(`/auth/google/callback?code=c&state=${decoded.state}`);
    expect(response.headers.get("Location")).toBe("/?auth=failed");
  });
});

describe("sign-up", () => {
  it("waits for the name to be confirmed before creating the account", async () => {
    const browser = new Browser();
    expect(await browser.signInWith("google", "g-1", "Chun")).toBe("/?auth=signup");
    expect(await browser.me()).toEqual({ status: "signup", suggestedName: "Chun" });
    expect(await store.findAccountByIdentity("google", "g-1")).toBeNull();

    expect(await (await browser.post("/api/signup", { name: "  Chun  Lee " })).json()).toEqual({ ok: true });
    const me = await browser.me();
    expect(me).toEqual({
      status: "signed_in",
      account: { id: expect.any(String), displayName: "Chun Lee", providers: ["google"], renameAllowedAt: null, aboard: false },
    });
    expect([...browser.cookies.keys()]).toEqual(["__Host-mush2_session"]);
  });

  it("says whether the account is aboard a ship, without naming it (#320)", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    await browser.post("/api/signup", { name: "Chun" });
    const id = (await store.findAccountByIdentity("google", "g-1"))!.id;
    await store.boardShip(id, "room-1", T0);
    const me = await browser.me();
    expect(me.status === "signed_in" && me.account.aboard).toBe(true);
    expect(JSON.stringify(me)).not.toContain("room-1");
    await store.leaveShip(id, "room-1", T0);
    const after = await browser.me();
    expect(after.status === "signed_in" && after.account.aboard).toBe(false);
  });

  it("uses Discord's global name, falling back to the username", async () => {
    const browser = new Browser();
    await browser.signInWith("discord", "d-1", null);
    expect(await browser.me()).toEqual({ status: "signup", suggestedName: "fallback_user" });
  });

  it("starts with an empty field when the provider's name fails the check or was taken", async () => {
    await new Browser().signUp("google", "g-1", "Chun");
    const rejected = new Browser();
    await rejected.signInWith("google", "g-2", "shit happens");
    expect(await rejected.me()).toEqual({ status: "signup", suggestedName: null });
    const taken = new Browser();
    await taken.signInWith("google", "g-3", "CHUN");
    expect(await taken.me()).toEqual({ status: "signup", suggestedName: null });
  });

  it("refuses a taken (ignoring case), rejected or empty name, and keeps the sign-up open", async () => {
    await new Browser().signUp("google", "g-1", "Chun");
    const browser = new Browser();
    await browser.signInWith("google", "g-2", "Someone");
    expect(await (await browser.post("/api/signup", { name: "chun" })).json()).toEqual({ ok: false, reason: "name_taken" });
    expect(await (await browser.post("/api/signup", { name: "www.spam.test" })).json()).toEqual({ ok: false, reason: "name_rejected" });
    expect(await (await browser.post("/api/signup", { name: " " })).json()).toEqual({ ok: false, reason: "name_empty" });
    expect((await browser.me()).status).toBe("signup");
    expect(await (await browser.post("/api/signup", { name: "Kuan Ti" })).json()).toEqual({ ok: true });
  });

  it("needs a pending sign-up, and expires", async () => {
    expect(await (await new Browser().post("/api/signup", { name: "Chun" })).json()).toEqual({ ok: false, reason: "no_signup" });
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    now += SIGNUP_MS;
    expect(await browser.me()).toEqual({ status: "signed_out" });
    expect(await (await browser.post("/api/signup", { name: "Chun" })).json()).toEqual({ ok: false, reason: "no_signup" });
  });

  it("refuses a body without Content-Length or over the limit, unread", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    const send = (headers: Record<string, string>, body: string) =>
      browser.request("/api/signup", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
    expect(await (await send({}, '{"name":"Chun"}')).json()).toEqual({ ok: false, reason: "name_empty" });
    expect(await (await send({ "Content-Length": "5000" }, '{"name":"Chun"}')).json()).toEqual({ ok: false, reason: "name_empty" });
    // A Content-Length that understates the body doesn't get past the check either.
    const long = JSON.stringify({ name: "Chun", pad: "x".repeat(2000) });
    expect(await (await send({ "Content-Length": "10" }, long)).json()).toEqual({ ok: false, reason: "name_empty" });
    expect((await browser.me()).status).toBe("signup");
  });

  it("logging out ends a pending sign-up, so the next person on the browser can't finish it", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    const signupCookie = browser.cookies.get("__Host-mush2_signup") ?? "";
    await browser.post("/auth/logout");
    expect(await browser.me()).toEqual({ status: "signed_out" });
    expect(await (await browser.post("/api/signup", { name: "Someone" })).json()).toEqual({ ok: false, reason: "no_signup" });
    // The row is gone too, not just the cookie.
    expect(await store.getSignup(signupCookie, now)).toBeNull();
  });

  it("a sign-in with a new identity signs this device out first, so it can't make a second account for the signed-in player", async () => {
    const browser = new Browser();
    const first = await browser.signUp("google", "g-1", "Chun");
    expect(await browser.signInWith("discord", "d-1", "Kuan Ti")).toBe("/?auth=signup");
    expect(await browser.me()).toEqual({ status: "signup", suggestedName: "Kuan Ti" });
    expect(await (await browser.post("/api/signup", { name: "Kuan Ti" })).json()).toEqual({ ok: true });
    const me = await browser.me();
    expect(me.status === "signed_in" && me.account.id).not.toBe(first);
    // The first account keeps its own identity only.
    expect((await store.identities(first)).map((i) => i.provider)).toEqual(["google"]);
  });

  it("a sign-in with a known identity ends a pending sign-up", async () => {
    await new Browser().signUp("google", "g-1", "Chun");
    const browser = new Browser();
    await browser.signInWith("discord", "d-9", "Raluca");
    const signupCookie = browser.cookies.get("__Host-mush2_signup") ?? "";
    expect(await browser.signInWith("google", "g-1", null)).toBe("/");
    expect(await store.getSignup(signupCookie, now)).toBeNull();
    expect(browser.cookies.has("__Host-mush2_signup")).toBe(false);
  });

  it("only takes a JSON body", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    const form = await browser.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Chun",
    });
    expect(await form.json()).toEqual({ ok: false, reason: "name_empty" });
  });

  it("signs in to the account when another tab finished the same sign-up first", async () => {
    const first = new Browser();
    const second = new Browser();
    await first.signInWith("google", "g-1", "Chun");
    await second.signInWith("google", "g-1", "Chun");
    expect(await (await first.post("/api/signup", { name: "Chun" })).json()).toEqual({ ok: true });
    expect(await (await second.post("/api/signup", { name: "Other" })).json()).toEqual({ ok: true });
    const [a, b] = [await first.me(), await second.me()];
    expect(a.status === "signed_in" && b.status === "signed_in" && a.account.id === b.account.id).toBe(true);
  });
});

describe("sign-in and sessions", () => {
  it("signs a known identity straight in, on a new device", async () => {
    const id = await new Browser().signUp("google", "g-1", "Chun");
    const other = new Browser();
    expect(await other.signInWith("google", "g-1", "Changed At Google")).toBe("/");
    const me = await other.me();
    expect(me.status === "signed_in" && me.account).toMatchObject({ id, displayName: "Chun" });
  });

  it("logs out this device only", async () => {
    const phone = new Browser();
    await phone.signUp("google", "g-1", "Chun");
    const desktop = new Browser();
    await desktop.signInWith("google", "g-1", null);
    await phone.post("/auth/logout");
    expect(await phone.me()).toEqual({ status: "signed_out" });
    expect((await desktop.me()).status).toBe("signed_in");
  });

  it("logout needs POST, so a link can't sign anyone out", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    expect((await browser.request("/auth/logout")).status).toBe(405);
    expect((await browser.me()).status).toBe("signed_in");
  });

  it("renews a session only when less than 15 days remain, and refuses an expired one", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    const sessionCookie = (r: Response) => r.headers.getSetCookie().find((c) => c.includes("mush2_session"));

    now += SESSION_MS - RENEW_BELOW_MS - 1;
    expect(sessionCookie(await browser.request("/api/me"))).toBeUndefined();
    now += 2;
    expect(sessionCookie(await browser.request("/api/me"))).toMatch(/Max-Age=2592000;/);
    // Renewed from here: past the first 30 days (and renewed again by this request).
    now += SESSION_MS - 1;
    expect((await browser.me()).status).toBe("signed_in");
    now += SESSION_MS;
    expect(await browser.me()).toEqual({ status: "signed_out" });
  });

  it("the cron deletes expired sessions and sign-ups", async () => {
    await new Browser().signUp("google", "g-1", "Chun");
    await new Browser().signInWith("google", "g-2", "Kuan Ti");
    expect(await store.deleteExpired(now + SIGNUP_MS - 1)).toBe(0);
    expect(await store.deleteExpired(now + SIGNUP_MS)).toBe(1);
    expect(await store.deleteExpired(now + SESSION_MS)).toBe(1);
  });
});

describe("linking a second sign-in method", () => {
  it("adds Discord to the signed-in account", async () => {
    const browser = new Browser();
    const id = await browser.signUp("google", "g-1", "Chun");
    now += 1;
    expect(await browser.signInWith("discord", "d-1", "whatever", true)).toBe("/?auth=linked");
    const me = await browser.me();
    expect(me.status === "signed_in" && me.account.providers).toEqual(["google", "discord"]);
    // Now Discord alone signs in to the same account.
    const other = new Browser();
    expect(await other.signInWith("discord", "d-1", null)).toBe("/");
    const otherMe = await other.me();
    expect(otherMe.status === "signed_in" && otherMe.account.id).toBe(id);
  });

  it("refuses an identity that belongs to another account, and never merges", async () => {
    const someoneElse = await new Browser().signUp("discord", "d-1", "Kuan Ti");
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    expect(await browser.signInWith("discord", "d-1", null, true)).toBe("/?auth=identity_taken");
    expect((await store.findAccountByIdentity("discord", "d-1"))?.id).toBe(someoneElse);
  });

  it("allows one identity per provider", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    expect(await browser.signInWith("google", "g-2", null, true)).toBe("/?auth=provider_linked");
    expect(await store.findAccountByIdentity("google", "g-2")).toBeNull();
    // Linking the identity it already has is fine.
    expect(await browser.signInWith("google", "g-1", null, true)).toBe("/?auth=linked");
  });

  it("keeps a session renewed while linking", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    now += SESSION_MS - RENEW_BELOW_MS + 1;
    const start = await browser.request("/auth/discord/start?link=1");
    expect(start.headers.getSetCookie().some((c) => c.startsWith("__Host-mush2_session=") && c.includes("Max-Age=2592000"))).toBe(true);
  });

  it("needs a signed-in account to link to", async () => {
    const browser = new Browser();
    const start = await browser.request("/auth/discord/start?link=1");
    expect(start.headers.get("Location")).toBe("/?auth=failed");
  });

  it("refuses when the session changed between start and callback", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    const start = await browser.request("/auth/discord/start?link=1");
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    await browser.post("/auth/logout");
    profiles.discord = { id: "d-1", global_name: "x" };
    const callback = await browser.request(`/auth/discord/callback?code=c&state=${state}`);
    expect(callback.headers.get("Location")).toBe("/?auth=failed");
    expect(await store.findAccountByIdentity("discord", "d-1")).toBeNull();
  });
});

describe("rename", () => {
  it("renames once a day, frees the old name at once, and records the history", async () => {
    const browser = new Browser();
    const id = await browser.signUp("google", "g-1", "Chun");
    expect(await (await browser.post("/api/rename", { name: "Chun Lee" })).json()).toEqual({ ok: true });

    // The old name is free for anyone right away.
    await new Browser().signUp("google", "g-2", "chun");

    now += DAY - 1;
    expect(await (await browser.post("/api/rename", { name: "Raluca" })).json()).toEqual({ ok: false, reason: "too_soon" });
    const me = await browser.me();
    expect(me.status === "signed_in" && me.account).toMatchObject({ displayName: "Chun Lee", renameAllowedAt: T0 + DAY });
    now += 1;
    expect(await (await browser.post("/api/rename", { name: "Raluca" })).json()).toEqual({ ok: true });
    expect((await store.nameHistory(id)).map((h) => h.newName)).toEqual(["Chun Lee", "Raluca"]);
  });

  it("refuses an unchanged, taken or rejected name without using up the day's rename", async () => {
    await new Browser().signUp("google", "g-2", "Kuan Ti");
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Chun");
    expect(await (await browser.post("/api/rename", { name: " Chun " })).json()).toEqual({ ok: false, reason: "name_unchanged" });
    expect(await (await browser.post("/api/rename", { name: "KUAN TI" })).json()).toEqual({ ok: false, reason: "name_taken" });
    expect(await (await browser.post("/api/rename", { name: "x".repeat(25) })).json()).toEqual({ ok: false, reason: "name_too_long" });
    // A change of case is a rename.
    expect(await (await browser.post("/api/rename", { name: "CHUN" })).json()).toEqual({ ok: true });
  });

  it("needs a session", async () => {
    expect(await (await new Browser().post("/api/rename", { name: "Chun" })).json()).toEqual({ ok: false, reason: "signed_out" });
  });
});

it("leaves other paths alone", async () => {
  expect(await handleAuth(new Request(`${ORIGIN}/parties/matchmaker/en`), ENV, { store, now })).toBeNull();
  expect(await handleAuth(new Request(`${ORIGIN}/`), ENV, { store, now })).toBeNull();
  expect((await handleAuth(new Request(`${ORIGIN}/api/nope`), ENV, { store, now }))?.status).toBe(404);
});

describe("routing (#324)", () => {
  const status = async (path: string, method = "GET") =>
    (await handleAuth(new Request(`${ORIGIN}${path}`, { method }), ENV, { store, setups, now }))?.status;

  it("answers a known path with the wrong method 405, with the JSON error", async () => {
    for (const [path, method] of [
      ["/auth/google/start", "POST"],
      ["/auth/discord/callback", "POST"],
      ["/auth/dev", "POST"],
      ["/api/me", "POST"],
      ["/api/signup", "GET"],
      ["/api/rename", "DELETE"],
    ]) {
      const response = await handleAuth(new Request(`${ORIGIN}${path}`, { method }), ENV, { store, setups, now });
      expect([path, response?.status]).toEqual([path, 405]);
      expect(await response?.json()).toEqual({ error: "method_not_allowed" });
    }
  });

  it("answers unknown providers, trailing slashes, extra segments and other case 404", async () => {
    for (const path of ["/auth/github/start", "/auth/Google/start", "/auth/google/start/", "/api/me/", "/api/ME", "/api/me/x"]) {
      expect([path, await status(path)]).toEqual([path, 404]);
    }
  });

  it("refuses a setup ID holding an encoded slash, and empty or extra segments", async () => {
    for (const path of ["/api/setups/a%2Fb", "/api/setups/", "/api/setups/a/b", "/api/setups/%E0%A4%A"]) {
      expect([path, await status(path)]).toEqual([path, 404]);
    }
  });

  it("checks the route's own conditions before the body: a bad body signed out is still signed_out", async () => {
    const browser = new Browser();
    expect(await (await browser.post("/api/signup", "not an object")).json()).toEqual({ ok: false, reason: "no_signup" });
    expect(await (await browser.post("/api/rename", "not an object")).json()).toEqual({ ok: false, reason: "signed_out" });
    expect(await (await browser.post("/api/setups", "not an object")).json()).toEqual({ ok: false, reason: "signed_out" });
    const text = await browser.request("/api/rename", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    expect(await text.json()).toEqual({ ok: false, reason: "signed_out" });
  });
});

describe("dev sign-in (#287)", () => {
  const DEV = { ...ENV, DEV_SERVER: "true", ALLOW_CHEATS: "true" } as Env;
  const LOCAL = "http://localhost:5173";

  it("creates a test account on first use and signs in to the same one after", async () => {
    const browser = new Browser(DEV, LOCAL);
    const response = await browser.request("/auth/dev?name=Tester");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    const me = await browser.me();
    if (me.status !== "signed_in") throw new Error(me.status);
    expect(me.account.displayName).toBe("Tester");
    // No Google or Discord sign-in method is listed for it.
    expect(me.account.providers).toEqual([]);

    const other = new Browser(DEV, "http://127.0.0.1:5173");
    await other.request("/auth/dev?name=tester");
    const again = await other.me();
    expect(again.status === "signed_in" && again.account.id).toBe(me.account.id);
  });

  it("is refused without DEV_SERVER, even with cheats on (the test deployment)", async () => {
    const browser = new Browser({ ...ENV, ALLOW_CHEATS: "true" } as Env, LOCAL);
    expect((await browser.request("/auth/dev?name=Tester")).status).toBe(404);
    expect(await browser.me()).toEqual({ status: "signed_out" });
  });

  it("is refused on a host that isn't localhost, even with DEV_SERVER on", async () => {
    const browser = new Browser(DEV, "https://mush2-server-test.example.workers.dev");
    expect((await browser.request("/auth/dev?name=Tester")).status).toBe(404);
    expect(await browser.me()).toEqual({ status: "signed_out" });
  });

  it("never reaches an account through a Google or Discord identity", async () => {
    const real = await new Browser().signUp("google", "g-1", "Alice");
    const browser = new Browser(DEV, LOCAL);
    // The real account's name: refused, not signed in to it.
    const response = await browser.request("/auth/dev?name=alice");
    expect(response.status).toBe(409);
    expect(await browser.me()).toEqual({ status: "signed_out" });
    // A dev name equal to the real provider user ID doesn't reach it either.
    await browser.request("/auth/dev?name=g-1");
    const me = await browser.me();
    expect(me.status === "signed_in" && me.account.id).not.toBe(real);
  });

  it("refuses a name that fails the display-name check", async () => {
    const browser = new Browser(DEV, LOCAL);
    expect((await browser.request("/auth/dev?name=%20")).status).toBe(400);
  });
});

describe("ending a session revokes its seats (#285)", () => {
  it("on logout, with the hash of that device's session only", async () => {
    const desk = new Browser();
    const id = await desk.signUp("google", "g-1", "Alice");
    const phone = new Browser();
    await phone.signInWith("google", "g-1", null);
    const deskSession = desk.cookies.get("__Host-mush2_session")!;
    await desk.post("/auth/logout");
    expect(revoked).toEqual([[id, await sha256Hex(deskSession)]]);
    expect((await phone.me()).status).toBe("signed_in");
  });

  it("when another existing account signs in on the same device", async () => {
    const desk = new Browser();
    const alice = await desk.signUp("google", "g-1", "Alice");
    const phone = new Browser();
    await phone.signInWith("google", "g-1", null);
    await phone.signUp("discord", "d-9", "Carol");
    revoked = [];
    const deskSession = desk.cookies.get("__Host-mush2_session")!;
    await desk.signInWith("discord", "d-9", null);
    expect(revoked).toEqual([[alice, await sha256Hex(deskSession)]]);
  });

  it("when a new account signs up on a signed-in device", async () => {
    const browser = new Browser();
    const alice = await browser.signUp("google", "g-1", "Alice");
    const old = browser.cookies.get("__Host-mush2_session")!;
    await browser.signUp("discord", "d-2", "Bob");
    expect(revoked).toEqual([[alice, await sha256Hex(old)]]);
  });

  it("not when the same account signs in again on that device, which keeps its games", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Alice");
    const old = browser.cookies.get("__Host-mush2_session")!;
    await browser.signInWith("google", "g-1", null);
    expect(revoked).toEqual([]);
    expect(await store.getSession(old, now)).toBeNull();
    expect((await browser.me()).status).toBe("signed_in");
  });

  it("still signs out when revoking fails", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Alice");
    const session = browser.cookies.get("__Host-mush2_session")!;
    revokeSeats = async () => {
      throw new Error("room down");
    };
    expect((await browser.post("/auth/logout")).status).toBe(200);
    expect(await store.getSession(session, now)).toBeNull();
  });

  it("still signs in when revoking fails", async () => {
    const browser = new Browser();
    await browser.signUp("google", "g-1", "Alice");
    const old = browser.cookies.get("__Host-mush2_session")!;
    revokeSeats = async () => {
      throw new Error("room down");
    };
    await browser.signUp("discord", "d-2", "Bob");
    expect(await store.getSession(old, now)).toBeNull();
    expect((await browser.me()).status).toBe("signed_in");
  });
});

describe("rate limits (#305)", () => {
  /** A rate-limiting binding that lets `allowed` calls through, then refuses. */
  const binding = (allowed: number) => {
    const keys: string[] = [];
    return { keys, limit: vi.fn(async ({ key }: { key: string }) => (keys.push(key), { success: keys.length <= allowed })) };
  };
  const ip = { "CF-Connecting-IP": "203.0.113.7" };

  it("sends an OAuth route back to the sign-in screen with a message, before touching the provider or D1", async () => {
    const browser = new Browser({ ...ENV, AUTH_LIMIT: binding(0) } as unknown as Env);
    const response = await browser.request("/auth/google/start", { headers: ip });
    expect(response.headers.get("Location")).toBe("/?auth=rate_limited");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("answers an API route 429 with a reason and Retry-After", async () => {
    const browser = new Browser({ ...ENV, AUTH_LIMIT: binding(0) } as unknown as Env);
    const response = await browser.request("/api/me", { headers: ip });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({ reason: "rate_limited" });
  });

  it("keys by client IP, and counts only sign-ups against the new-account limit", async () => {
    const auth = binding(100);
    const signups = binding(0);
    const browser = new Browser({ ...ENV, AUTH_LIMIT: auth, SIGNUP_LIMIT: signups } as unknown as Env);
    expect((await browser.request("/api/me", { headers: ip })).status).toBe(200);
    expect(auth.keys).toEqual(["ip:203.0.113.7"]);
    expect(signups.limit).not.toHaveBeenCalled();
    await browser.request("/api/signup", { method: "POST", headers: ip });
    expect(signups.keys).toEqual(["ip:203.0.113.7"]);
  });

  it("keys a signed-in request by its account, and a stale session cookie by IP", async () => {
    const auth = binding(1000);
    const browser = new Browser({ ...ENV, AUTH_LIMIT: auth } as unknown as Env);
    const accountId = await browser.signUp("google", "g-1", "Chun");
    auth.keys.length = 0;
    await browser.request("/api/me", { headers: ip });
    await browser.request("/auth/google/start?link=1", { headers: ip });
    expect(auth.keys).toEqual([`account:${accountId}`, `account:${accountId}`]);

    now += SESSION_MS + DAY; // the session has expired, but the browser still sends its cookie
    auth.keys.length = 0;
    await browser.request("/api/me", { headers: ip });
    expect(auth.keys).toEqual(["ip:203.0.113.7"]);
  });

  it("never limits logout or the OAuth callback", async () => {
    const auth = binding(0);
    const browser = new Browser({ ...ENV, AUTH_LIMIT: auth } as unknown as Env);
    expect((await browser.request("/auth/logout", { method: "POST", headers: ip })).status).toBe(200);
    const callback = await browser.request("/auth/google/callback?code=c&state=s", { headers: ip });
    expect(callback.headers.get("Location")).toBe("/?auth=failed");
    expect(auth.limit).not.toHaveBeenCalled();
  });

  it("refuses a sign-up over the new-account limit", async () => {
    const browser = new Browser({ ...ENV, SIGNUP_LIMIT: binding(0) } as unknown as Env);
    const response = await browser.request("/api/signup", { method: "POST", headers: ip });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, error: "rate_limited", reason: "rate_limited" });
  });

  it("spreads a dev server's clients over several keys, so its limit is larger", async () => {
    const auth = binding(100);
    const browser = new Browser({ ...ENV, DEV_SERVER: "true", AUTH_LIMIT: auth } as unknown as Env);
    for (let i = 0; i < 3; i++) await browser.request("/api/me", { headers: ip });
    expect(new Set(auth.keys).size).toBe(3);
  });

  it("lets requests through when the binding fails", async () => {
    const broken = { limit: async () => Promise.reject(new Error("down")) };
    const browser = new Browser({ ...ENV, AUTH_LIMIT: broken } as unknown as Env);
    expect((await browser.request("/api/me")).status).toBe(200);
  });
});

describe("OpenAPI document and docs page (#324)", () => {
  const CHEATS = { ...ENV, ALLOW_CHEATS: "true" } as Env;

  interface Document {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
  }

  it("answers 404 where cheats are off (production, staging)", async () => {
    for (const path of [DOCUMENT_PATH, "/api/docs"]) {
      const response = await new Browser().request(path);
      expect([path, response.status]).toEqual([path, 404]);
      expect(await response.json()).toEqual({ error: "not_found" });
      // Any method: a 405 would say the path exists.
      expect([path, (await new Browser().post(path)).status]).toEqual([path, 404]);
    }
  });

  it("answers 405 to another method where cheats are on, like the other routes", async () => {
    for (const path of [DOCUMENT_PATH, "/api/docs"]) {
      const response = await new Browser(CHEATS).post(path);
      expect([path, response.status]).toEqual([path, 405]);
      expect(await response.json()).toEqual({ error: "method_not_allowed" });
    }
  });

  it("serves the docs page, reading the document, with the pinned script", async () => {
    const response = await new Browser(CHEATS).request("/api/docs");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(SCALAR_SCRIPT);
    expect(html).toContain(DOCUMENT_PATH);
  });

  it("documents exactly the routes, the docs' own aside, and every $ref resolves", async () => {
    const response = await new Browser(CHEATS).request(DOCUMENT_PATH);
    expect(response.status).toBe(200);
    const doc = (await response.json()) as Document;
    expect(doc.openapi).toBe("3.1.0");
    const documented = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));
    const routed = api.routes
      // The OAuth routes take every method and answer 405 to all but GET themselves (oauthRoute).
      .map((r) => (r.method === "ALL" && r.path.startsWith("/auth/:provider") ? { ...r, method: "GET" } : r))
      .filter((r) => r.method !== "ALL" && r.path !== DOCUMENT_PATH && r.path !== "/api/docs")
      // `/auth/:provider{[a-z]+}/start` is `/auth/{provider}/start` in the document.
      .map((r) => `${r.method} ${r.path.replace(/:(\w+)(\{[^}]*\})?/g, "{$1}")}`);
    expect(documented.sort()).toEqual([...new Set(routed)].sort());

    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1] ?? "");
    expect(refs.length).toBeGreaterThan(10);
    for (const name of refs) expect(Object.keys(doc.components.schemas)).toContain(name);
  });

  it("describes what the routes really answer", async () => {
    const browser = new Browser();
    const matches = (schema: { safeParse: (v: unknown) => { success: boolean } }, body: unknown) => expect(schema.safeParse(body).success).toBe(true);
    matches(MeResponseSchema, await browser.me());
    await browser.signInWith("google", "g-1", "Chun");
    matches(MeResponseSchema, await browser.me());
    matches(SignupResponseSchema, await (await browser.post("/api/signup", { name: "" })).json());
    matches(SignupResponseSchema, await (await browser.post("/api/signup", { name: "Chun" })).json());
    matches(MeResponseSchema, await browser.me());
    const posted = await (await browser.post("/api/setups", { text: { en: { name: "Quick", description: "" } }, knobs: { ...STANDARD_KNOBS, seats: 8 } })).json();
    expect(posted.ok).toBe(true);
    matches(PostSetupResponseSchema, posted);
    matches(PostSetupResponseSchema, await (await browser.post("/api/setups", { text: {}, knobs: STANDARD_KNOBS })).json());
    matches(SetupListResponseSchema, await (await browser.request("/api/setups")).json());
    matches(SetupLookupResponseSchema, await (await browser.request(`/api/setups/${posted.setup.id}`)).json());
    matches(RenameResponseSchema, await (await browser.post("/api/rename", { name: "Chun" })).json());
    const renamed = await (await browser.post("/api/rename", { name: "Chun Lee" })).json();
    expect(renamed).toEqual({ ok: true });
    matches(RenameResponseSchema, renamed);
    matches(LogoutResponseSchema, await (await browser.post("/auth/logout")).json());
  });

  it("reads a name body as before: other fields ignored, a non-string name is an empty name", async () => {
    const browser = new Browser();
    await browser.signInWith("google", "g-1", "Chun");
    expect(await (await browser.post("/api/signup", { name: 5 })).json()).toEqual({ ok: false, reason: "name_empty" });
    expect(await (await browser.post("/api/signup", { name: "Chun", extra: true })).json()).toEqual({ ok: true });
    expect(await (await browser.post("/api/rename", { name: 5 })).json()).toEqual({ ok: false, reason: "name_empty" });
    expect(await (await browser.post("/api/rename", { name: "Chun Lee", extra: true })).json()).toEqual({ ok: true });
  });
});
