// The account HTTP API (server/src/auth.ts, docs/ops/sign-in.md). Same origin as the page: in dev Vite proxies
// /auth and /api to wrangler, so the session cookie goes with every request.
//
// Calls go through Hono's typed client (#324): `api` knows every route's path, body and responses from the server's
// own route types, so a server change that breaks a call here fails `npm run typecheck`.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthOutcome, AuthProvider, MeResponse, RenameResponse, SignupResponse } from "@mush2/shared";
// Types only, from declarations emitted by `npm run api-types -w server` (web's typecheck runs it first).
import type { ApiType } from "@mush2/server/api";
import { hc } from "hono/client";

/** The site API, on the page's own origin. */
export const api = hc<ApiType>("/");

/** Provider names are brands: the same in every language. */
export const PROVIDER_NAMES: Record<AuthProvider, string> = { google: "Google", discord: "Discord" }; // i18n-ignore: brand names

/** Where a sign-in (or, with `link`, adding a sign-in method) starts: a full-page redirect to the provider. */
export function startSignIn(provider: AuthProvider, link = false): void {
  location.assign(`/auth/${provider}/start${link ? "?link=1" : ""}`);
}

// Over the rate limit (#305), these answer 429 with the same body shape (`reason: "rate_limited"`).
export async function signup(name: string): Promise<SignupResponse> {
  return (await api.api.signup.$post({ json: { name } })).json();
}

export async function rename(name: string): Promise<RenameResponse> {
  return (await api.api.rename.$post({ json: { name } })).json();
}

export async function logout(): Promise<void> {
  await api.auth.logout.$post();
}

/**
 * A 429 from the rate limit (#305). It comes from middleware in front of every route, so it isn't in any route's
 * types: hence a plain `status: number` here.
 */
const isRateLimited = (response: { status: number }) => response.status === 429;

/** Seconds from a 429's Retry-After, as milliseconds; a minute if it's missing or odd. */
function retryAfterMs(response: { headers: Headers }): number {
  const seconds = Number(response.headers.get("Retry-After")); // i18n-ignore: an HTTP header
  return Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : 60_000;
}

/**
 * `me` is `null` until the first answer. A server that can't be reached counts as signed out. Over the rate limit
 * (#305, a 429) says nothing about the session, so `me` keeps what was last known, `rateLimited` is set (for a
 * message), and it asks again once the server allows.
 */
export function useMe(): { me: MeResponse | null; rateLimited: boolean; refresh: () => Promise<void> } {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    clearTimeout(retry.current);
    try {
      const response = await api.api.me.$get();
      if (isRateLimited(response)) {
        setRateLimited(true);
        if (mounted.current) retry.current = setTimeout(() => void refresh(), retryAfterMs(response));
        return;
      }
      setRateLimited(false);
      setMe(response.ok ? await response.json() : { status: "signed_out", singlePlayer: false });
    } catch {
      setRateLimited(false);
      setMe({ status: "signed_out", singlePlayer: false });
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      clearTimeout(retry.current);
    };
  }, [refresh]);
  return { me, rateLimited, refresh };
}

const OUTCOMES: readonly AuthOutcome[] = ["signup", "linked", "identity_taken", "provider_linked", "denied", "failed", "rate_limited"];

/**
 * The `?auth=<outcome>` an OAuth callback sent the browser back with, read once and removed from the address bar
 * so a reload doesn't show it again. `signup` needs no message: `/api/me` says so.
 */
export function takeAuthOutcome(): Exclude<AuthOutcome, "signup"> | null {
  const url = new URL(location.href);
  const value = url.searchParams.get("auth");
  if (value === null) return null;
  url.searchParams.delete("auth");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  const outcome = OUTCOMES.find((o) => o === value);
  return outcome && outcome !== "signup" ? outcome : null;
}
