// Fixed-window, per-connection message limiter. In-memory only, which is fine:
// a Durable Object instance owns all of its connections.

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private maxPerWindow: number,
    private windowMs: number,
  ) {}

  /** `scale` multiplies the limit, for a dev server that wants more headroom. */
  allow(key: string, now = Date.now(), scale = 1): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= this.maxPerWindow * scale;
  }

  forget(key: string): void {
    this.windows.delete(key);
  }
}

// ---- Sign-in and account routes (#305)
//
// /auth/* and /api/* run in the stateless Worker, where an in-memory RateLimiter would count per isolate and
// barely limit anything. Cloudflare's rate-limiting binding (`ratelimits` in wrangler.jsonc) counts per location
// instead. Its period can only be 10 or 60 seconds, so there is no per-day cap on new accounts; the per-minute
// sign-up limit is all it can give.

/** What a rate-limiting binding exposes. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The bindings are optional so a missing one (tests, an old config) limits nothing rather than breaking sign-in. */
export interface RateLimitEnv {
  AUTH_LIMIT?: RateLimitBinding;
  SIGNUP_LIMIT?: RateLimitBinding;
  SETUP_POST_LIMIT?: RateLimitBinding;
  DEV_SERVER?: string;
  ALLOW_CHEATS?: string;
}

/** Like DEV_RATE_SCALE for the DOs: a dev or test server spreads requests over this many keys, so its limits are this many times larger (shared by everyone on that server, which is fine for tooling). */
export const AUTH_DEV_SCALE = 10;
let devTurn = 0;

/** The client's address as Cloudflare saw it; one shared bucket for a request without one (local dev). */
export const clientKey = (request: Request): string => request.headers.get("CF-Connecting-IP") ?? "unknown";

/**
 * True if the request may go on. A signed-in request (`accountId`) is counted per account, so players sharing an
 * address (a mobile carrier, a school) don't use up each other's limit; any other is counted per address. `signup`
 * also counts it against the (tighter) new-account limit, always per address, since a sign-up has no account yet.
 * `setupPost` counts a signed-in request against the setup-post limit, per account (#233); a signed-out post is
 * refused by its route anyway.
 * A failing binding lets the request through: a Cloudflare hiccup must not lock everyone out of signing in.
 */
export async function allowAuthRequest(
  env: RateLimitEnv,
  request: Request,
  { accountId, signup, setupPost = false }: { accountId: string | null; signup: boolean; setupPost?: boolean },
): Promise<boolean> {
  const dev = env.DEV_SERVER === "true" || env.ALLOW_CHEATS === "true";
  const spread = (key: string) => (dev ? `${key}#${devTurn++ % AUTH_DEV_SCALE}` : key);
  const ip = `ip:${clientKey(request)}`;
  try {
    if (env.AUTH_LIMIT && !(await env.AUTH_LIMIT.limit({ key: spread(accountId ? `account:${accountId}` : ip) })).success) return false;
    if (signup && env.SIGNUP_LIMIT && !(await env.SIGNUP_LIMIT.limit({ key: spread(ip) })).success) return false;
    if (setupPost && accountId && env.SETUP_POST_LIMIT && !(await env.SETUP_POST_LIMIT.limit({ key: spread(`account:${accountId}`) })).success) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}
