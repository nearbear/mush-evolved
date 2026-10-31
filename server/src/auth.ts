// Sign-in, sessions and display names over HTTP (#283, #284). The Worker sends
// /auth/* and /api/* here (index.ts); everything else goes on to the rooms.
//
//   GET  /auth/<provider>/start[?link=1]  to the provider's consent page; `link` adds it to the signed-in account
//   GET  /auth/<provider>/callback        back from the provider; redirects to `/` or `/?auth=<AuthOutcome>`
//   POST /auth/logout                      ends this device's session
//   GET  /api/me                           MeResponse
//   POST /api/signup  { name }             confirms the name of a first sign-in: creates the account
//   POST /api/rename  { name }             at most once a day
//   GET  /auth/dev?name=<name>             dev sign-in for tooling (#287): `npm run dev` on localhost only
//
// Session, OAuth-state and sign-up cookies each hold a random ID (only the
// session and sign-up IDs' hashes are stored). They are HttpOnly and
// SameSite=Lax, so another site can't POST with them; on a deployment they are
// Secure with the `__Host-` prefix. Never log a cookie or the OAuth `code`.

import {
  checkDisplayName,
  isAuthProvider,
  type AuthOutcome,
  type AuthProvider,
  type MeResponse,
  type RenameResponse,
  type SignupResponse,
} from "@mush2/shared";
import { type AccountStore, nameKey, RENAME_INTERVAL_MS, sha256Hex } from "./accountStore.ts";
import { authorizeUrl, fetchProfile, oauthCredentials, randomToken, usesPkce } from "./oauth.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sessions last 30 days, renewed while in use. */
export const SESSION_MS = 30 * DAY_MS;
/** A session is extended only when less than this remains, so a request doesn't always mean a write. */
export const RENEW_BELOW_MS = 15 * DAY_MS;
/** Time to finish signing in at the provider. */
const OAUTH_STATE_MS = 10 * 60 * 1000;
/** Time to confirm a name after a first sign-in. */
export const SIGNUP_MS = 60 * 60 * 1000;
/** Largest JSON body accepted by /api/*. */
const MAX_BODY = 1024;

export interface AuthDeps {
  store: AccountStore;
  now: number;
  /** For the provider requests; tests replace it. */
  fetcher?: typeof fetch;
  /** Revokes the seat tokens handed to a session (its hash) when it ends (#285): logout, or another account signing in on the device. The account stays aboard. */
  revokeSeats?: (accountId: string, sessionKey: string) => Promise<void>;
}

/** What the OAuth-state cookie holds between start and callback. */
interface OAuthState {
  provider: AuthProvider;
  state: string;
  verifier: string | null;
  /** The account to add the identity to, or null to sign in. */
  link: string | null;
}

// ---- Cookies

type CookieKind = "session" | "oauth" | "signup";

/**
 * `__Host-mush2_session` on a deployment. Locally (DEV_SERVER) there's no HTTPS,
 * and cookies ignore ports while each worktree has its own local D1, so the name
 * carries the port instead: the page's, since Vite's proxy keeps the Host header
 * (`mush2_session_5173` in the main checkout).
 */
function cookieName(kind: CookieKind, env: Env, url: URL): string {
  return env.DEV_SERVER === "true" ? `mush2_${kind}_${url.port || "80"}` : `__Host-mush2_${kind}`;
}

function setCookie(kind: CookieKind, value: string, maxAgeMs: number, env: Env, url: URL): string {
  const secure = env.DEV_SERVER === "true" ? "" : "; Secure";
  // i18n-ignore: a Set-Cookie header, not text
  return `${cookieName(kind, env, url)}=${value}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

const clearCookie = (kind: CookieKind, env: Env, url: URL) => setCookie(kind, "", 0, env, url);

function readCookie(request: Request, kind: CookieKind, env: Env, url: URL): string | null {
  const name = cookieName(kind, env, url);
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

function encodeState(state: OAuthState): string {
  return btoa(JSON.stringify(state)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(value: string | null): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))) as Partial<OAuthState>;
    if (typeof parsed.provider !== "string" || !isAuthProvider(parsed.provider) || typeof parsed.state !== "string") return null;
    return {
      provider: parsed.provider,
      state: parsed.state,
      verifier: typeof parsed.verifier === "string" ? parsed.verifier : null,
      link: typeof parsed.link === "string" ? parsed.link : null,
    };
  } catch {
    return null;
  }
}

// ---- Responses

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

const outcome = (result: AuthOutcome) => `/?auth=${result}`;

/**
 * `{ name }` from a JSON body, or null. Requiring JSON also keeps plain cross-site
 * form posts out. The size is checked from Content-Length before reading, so a
 * huge or streamed body is refused unread.
 */
async function readName(request: Request): Promise<string | null> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
  const length = Number(request.headers.get("Content-Length") ?? Number.NaN);
  if (!(length >= 0 && length <= MAX_BODY)) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text) as { name?: unknown };
    return typeof body.name === "string" ? body.name : null;
  } catch {
    return null;
  }
}

// ---- Sessions

/** The request's session cookie, unchecked (the Matchmaker reads it from its socket's upgrade request, #285). */
export function sessionCookie(request: Request, env: Env): string | null {
  return readCookie(request, "session", env, new URL(request.url));
}

export interface CurrentSession {
  accountId: string;
  sessionId: string;
  /** Set when the session was just renewed: the cookie with its new lifetime. */
  renewedCookie: string | null;
}

/** The request's session, if valid; renews it when less than RENEW_BELOW_MS remains. */
export async function currentSession(request: Request, env: Env, store: AccountStore, now: number): Promise<CurrentSession | null> {
  const url = new URL(request.url);
  const sessionId = readCookie(request, "session", env, url);
  if (!sessionId) return null;
  const session = await store.getSession(sessionId, now);
  if (!session) return null;
  let renewedCookie: string | null = null;
  if (session.expiresAt - now < RENEW_BELOW_MS && (await store.renewSession(sessionId, now, now + SESSION_MS))) {
    renewedCookie = setCookie("session", sessionId, SESSION_MS, env, url);
  }
  return { accountId: session.accountId, sessionId, renewedCookie };
}

/** Deletes a session after revoking its seat tokens. A failed revoke doesn't keep anyone signed in. */
async function endSession(sessionId: string, deps: AuthDeps): Promise<void> {
  const session = await deps.store.getSession(sessionId, deps.now);
  if (session && deps.revokeSeats) {
    try {
      await deps.revokeSeats(session.accountId, await sha256Hex(sessionId));
    } catch (e) {
      console.warn(`Revoking seats failed: ${e instanceof Error ? e.message : typeof e}`);
    }
  }
  await deps.store.deleteSession(sessionId);
}

/**
 * A new session for the account, replacing the request's own if it had one. Returns the cookies to set. Signing in as
 * someone else ends the old session with its seats; signing in again as the same account keeps this device's games.
 */
async function signIn(request: Request, env: Env, deps: AuthDeps, accountId: string): Promise<string[]> {
  const url = new URL(request.url);
  const old = readCookie(request, "session", env, url);
  if (old) {
    const session = await deps.store.getSession(old, deps.now);
    if (session?.accountId === accountId) await deps.store.deleteSession(old);
    else await endSession(old, deps);
  }
  const sessionId = await deps.store.createSession(accountId, deps.now + SESSION_MS);
  return [setCookie("session", sessionId, SESSION_MS, env, url)];
}

/** Ends this device's pending sign-up, if any (row and cookie). Returns the cookie to set. */
async function endSignup(request: Request, env: Env, deps: AuthDeps): Promise<string> {
  const url = new URL(request.url);
  const signupId = readCookie(request, "signup", env, url);
  if (signupId) await deps.store.deleteSignup(signupId);
  return clearCookie("signup", env, url);
}

/** Ends this device's session, if any (row and cookie), revoking its seats. Returns the cookie to set. */
async function signOut(request: Request, env: Env, deps: AuthDeps): Promise<string> {
  const url = new URL(request.url);
  const sessionId = readCookie(request, "session", env, url);
  if (sessionId) await endSession(sessionId, deps);
  return clearCookie("session", env, url);
}

// ---- Routes

/** Handles /auth/* and /api/*; null for any other path. */
export async function handleAuth(request: Request, env: Env, deps: AuthDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/auth/") && !path.startsWith("/api/")) return null;

  const oauth = /^\/auth\/([a-z]+)\/(start|callback)$/.exec(path);
  if (oauth) {
    const provider = oauth[1] ?? "";
    if (!isAuthProvider(provider)) return json({ error: "not_found" }, 404);
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return oauth[2] === "start" ? start(request, env, deps, provider) : callback(request, env, deps, provider);
  }

  const routes: Record<string, [method: string, handler: typeof me]> = {
    "/auth/dev": ["GET", devSignIn],
    "/auth/logout": ["POST", logout],
    "/api/me": ["GET", me],
    "/api/signup": ["POST", signup],
    "/api/rename": ["POST", rename],
  };
  const route = routes[path];
  if (!route) return json({ error: "not_found" }, 404);
  if (request.method !== route[0]) return json({ error: "method_not_allowed" }, 405);
  return route[1](request, env, deps);
}

async function start(request: Request, env: Env, deps: AuthDeps, provider: AuthProvider): Promise<Response> {
  const url = new URL(request.url);
  const credentials = oauthCredentials(provider, env);
  if (!credentials) return json({ error: "not_configured" }, 503);
  const cookies: string[] = [];
  let link: string | null = null;
  if (url.searchParams.get("link") === "1") {
    const session = await currentSession(request, env, deps.store, deps.now);
    if (!session) return redirect(outcome("failed"));
    link = session.accountId;
    if (session.renewedCookie) cookies.push(session.renewedCookie);
  }
  const state: OAuthState = { provider, state: randomToken(), verifier: usesPkce(provider) ? randomToken() : null, link };
  const location = await authorizeUrl(provider, credentials, callbackUrl(url, provider), state.state, state.verifier);
  cookies.push(setCookie("oauth", encodeState(state), OAUTH_STATE_MS, env, url));
  return redirect(location, cookies);
}

const callbackUrl = (url: URL, provider: AuthProvider) => `${url.origin}/auth/${provider}/callback`;

async function callback(request: Request, env: Env, deps: AuthDeps, provider: AuthProvider): Promise<Response> {
  const url = new URL(request.url);
  // The state cookie is single-use: cleared whatever happens.
  const cookies = [clearCookie("oauth", env, url)];
  const fail = (result: AuthOutcome) => redirect(outcome(result), cookies);

  const saved = decodeState(readCookie(request, "oauth", env, url));
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  // A callback this browser didn't start (a forged or replayed link) is refused here.
  if (!saved || saved.provider !== provider || !code || url.searchParams.get("state") !== saved.state) return fail("failed");
  const credentials = oauthCredentials(provider, env);
  if (!credentials) return fail("failed");

  let profile: Awaited<ReturnType<typeof fetchProfile>>;
  try {
    profile = await fetchProfile(provider, credentials, callbackUrl(url, provider), code, saved.verifier, deps.fetcher);
  } catch {
    return fail("failed");
  }
  const existing = await deps.store.findAccountByIdentity(provider, profile.providerUserId);

  if (saved.link) {
    // Linking: still signed in to the account that asked. Accounts are never merged.
    const session = await currentSession(request, env, deps.store, deps.now);
    if (!session || session.accountId !== saved.link) return fail("failed");
    if (session.renewedCookie) cookies.push(session.renewedCookie);
    if (existing) return fail(existing.id === saved.link ? "linked" : "identity_taken");
    const added = await deps.store.addIdentity(saved.link, provider, profile.providerUserId, deps.now);
    return fail(added === "ok" ? "linked" : added);
  }

  // Signing in, as opposed to linking, replaces whoever this device was signed in or signing up as.
  cookies.push(await endSignup(request, env, deps));
  if (existing) {
    cookies.push(...(await signIn(request, env, deps, existing.id)));
    return redirect("/", cookies);
  }

  // A first sign-in: the account waits for a confirmed name (/api/signup). The
  // device is signed out first, so a sign-up never sits beside a session (and
  // can't make a second account for whoever was signed in).
  cookies.push(await signOut(request, env, deps));
  const checked = profile.name === null ? null : checkDisplayName(profile.name);
  const suggestedName = checked?.ok ? checked.name : null;
  const signupId = await deps.store.createSignup(
    { provider, providerUserId: profile.providerUserId, suggestedName },
    deps.now + SIGNUP_MS,
  );
  cookies.push(setCookie("signup", signupId, SIGNUP_MS, env, url));
  return redirect(outcome("signup"), cookies);
}

/** Dev sign-in's provider. Its identities are only ever reached through `devSignIn`, and it reaches no other provider's. */
export const DEV_PROVIDER = "dev";

/**
 * Dev sign-in (#287): signs this browser in to the test account named `?name=`, creating it the first time, so
 * tooling (screenshots, a11y, the play skill) can join multiplayer without Google or Discord. Only on a local dev
 * server: `DEV_SERVER`, which no deployment sets (not ALLOW_CHEATS, which the test deployment has), and a localhost
 * host as a second guard. It only signs in to accounts made here (provider `dev`, keyed by the name); a name held by
 * a real account is refused. A GET, so a tool can just open the page; it redirects to `/`.
 */
async function devSignIn(request: Request, env: Env, deps: AuthDeps): Promise<Response> {
  const url = new URL(request.url);
  if (env.DEV_SERVER !== "true" || (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) return json({ error: "not_found" }, 404);
  const checked = checkDisplayName(url.searchParams.get("name") ?? "");
  if (!checked.ok) return json({ error: checked.reason }, 400);
  const key = nameKey(checked.name);
  let account = await deps.store.findAccountByIdentity(DEV_PROVIDER, key);
  if (!account) {
    const created = await deps.store.createAccount(checked.name, DEV_PROVIDER, key, deps.now);
    if (!created.ok) return json({ error: created.reason }, 409);
    account = created.account;
  }
  return redirect("/", [await endSignup(request, env, deps), ...(await signIn(request, env, deps, account.id))]);
}

/** Ends this device's session, and a pending sign-up too: the next person on this browser must not finish it. */
async function logout(request: Request, env: Env, deps: AuthDeps): Promise<Response> {
  // The device's seat tokens are revoked, but the account stays aboard: signing in again resumes the ship (#321).
  return json({ ok: true }, 200, [await signOut(request, env, deps), await endSignup(request, env, deps)]);
}

async function me(request: Request, env: Env, deps: AuthDeps): Promise<Response> {
  const url = new URL(request.url);
  const session = await currentSession(request, env, deps.store, deps.now);
  const cookies = session?.renewedCookie ? [session.renewedCookie] : [];
  const account = session && (await deps.store.getAccount(session.accountId));
  if (account) {
    const providers = (await deps.store.identities(account.id)).map((i) => i.provider).filter(isAuthProvider);
    const allowedAt = account.renamedAt === null ? null : account.renamedAt + RENAME_INTERVAL_MS;
    const body: MeResponse = {
      status: "signed_in",
      account: {
        id: account.id,
        displayName: account.displayName,
        providers,
        renameAllowedAt: allowedAt !== null && allowedAt > deps.now ? allowedAt : null,
      },
    };
    return json(body, 200, cookies);
  }
  const signupId = readCookie(request, "signup", env, url);
  const pending = signupId && (await deps.store.getSignup(signupId, deps.now));
  if (pending) {
    // The suggestion may have been taken since the callback; then the field starts empty.
    const free = pending.suggestedName !== null && !(await deps.store.nameTaken(pending.suggestedName));
    const body: MeResponse = { status: "signup", suggestedName: free ? pending.suggestedName : null };
    return json(body, 200, cookies);
  }
  const body: MeResponse = { status: "signed_out" };
  return json(body, 200, cookies);
}

async function signup(request: Request, env: Env, deps: AuthDeps): Promise<Response> {
  const url = new URL(request.url);
  const reply = (body: SignupResponse, cookies: string[] = []) => json(body, body.ok ? 200 : 400, cookies);
  const signupId = readCookie(request, "signup", env, url);
  const pending = signupId && (await deps.store.getSignup(signupId, deps.now));
  if (!signupId || !pending) return reply({ ok: false, reason: "no_signup" });
  const checked = checkDisplayName((await readName(request)) ?? "");
  if (!checked.ok) return reply({ ok: false, reason: checked.reason });

  const created = await deps.store.createAccount(checked.name, pending.provider, pending.providerUserId, deps.now);
  let accountId: string;
  if (created.ok) accountId = created.account.id;
  else if (created.reason === "name_taken") return reply({ ok: false, reason: "name_taken" });
  else {
    // The identity got an account meanwhile (a second tab finished first): sign in to it.
    const existing = await deps.store.findAccountByIdentity(pending.provider, pending.providerUserId);
    if (!existing) return reply({ ok: false, reason: "no_signup" });
    accountId = existing.id;
  }
  return reply({ ok: true }, [...(await signIn(request, env, deps, accountId)), await endSignup(request, env, deps)]);
}

async function rename(request: Request, env: Env, deps: AuthDeps): Promise<Response> {
  const reply = (body: RenameResponse, cookies: string[] = []) => json(body, body.ok ? 200 : 400, cookies);
  const session = await currentSession(request, env, deps.store, deps.now);
  const account = session && (await deps.store.getAccount(session.accountId));
  if (!session || !account) return reply({ ok: false, reason: "signed_out" });
  const cookies = session.renewedCookie ? [session.renewedCookie] : [];
  const checked = checkDisplayName((await readName(request)) ?? "");
  if (!checked.ok) return reply({ ok: false, reason: checked.reason }, cookies);
  // A change of case only is a rename; the same name isn't, and doesn't use up the day's rename.
  if (checked.name === account.displayName) return reply({ ok: false, reason: "name_unchanged" }, cookies);
  const result = await deps.store.rename(account.id, checked.name, deps.now);
  return reply(result === "ok" ? { ok: true } : { ok: false, reason: result }, cookies);
}
