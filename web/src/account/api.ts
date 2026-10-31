// The account HTTP API (server/src/auth.ts, docs/sign-in.md). Same origin as the page: in dev Vite proxies
// /auth and /api to wrangler, so the session cookie goes with every request.

import { useCallback, useEffect, useState } from "react";
import type { AuthOutcome, AuthProvider, MeResponse, RenameResponse, SignupResponse } from "@mush2/shared";

/** Provider names are brands: the same in every language. */
export const PROVIDER_NAMES: Record<AuthProvider, string> = { google: "Google", discord: "Discord" }; // i18n-ignore: brand names

/** Where a sign-in (or, with `link`, adding a sign-in method) starts: a full-page redirect to the provider. */
export function startSignIn(provider: AuthProvider, link = false): void {
  location.assign(`/auth/${provider}/start${link ? "?link=1" : ""}`);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // i18n-ignore: an HTTP header
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export function signup(name: string): Promise<SignupResponse> {
  return postJson("/api/signup", { name });
}

export function rename(name: string): Promise<RenameResponse> {
  return postJson("/api/rename", { name });
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" });
}

/** `null` until the first answer. A server that can't be reached counts as signed out. */
export function useMe(): { me: MeResponse | null; refresh: () => Promise<void> } {
  const [me, setMe] = useState<MeResponse | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/me");
      setMe(response.ok ? ((await response.json()) as MeResponse) : { status: "signed_out" });
    } catch {
      setMe({ status: "signed_out" });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { me, refresh };
}

const OUTCOMES: readonly AuthOutcome[] = ["signup", "linked", "identity_taken", "provider_linked", "denied", "failed"];

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
