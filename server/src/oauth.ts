// OAuth authorization-code sign-in with Google and Discord (#283), written by
// hand (no dependency). auth.ts runs the flow; this file knows each provider's
// URLs and how to read the player's ID and name. Never log the `code`, tokens
// or the profile.

import type { AuthProvider } from "@mush2/shared";

declare global {
  interface Env {
    /** OAuth app credentials: server/.dev.vars locally, `wrangler secret put` on a deployment. */
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
  }
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Who signed in, as the provider says. `name` is only a suggestion for the display name. */
export interface ProviderProfile {
  providerUserId: string;
  name: string | null;
}

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Whether to send a PKCE challenge. */
  pkce: boolean;
  /** Reads the profile with the access token. */
  profile(accessToken: string, fetcher: typeof fetch): Promise<ProviderProfile>;
}

async function getJson(url: string, accessToken: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`profile request failed: ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

const PROVIDERS: Record<AuthProvider, ProviderSpec> = {
  // https://developers.google.com/identity/openid-connect/openid-connect
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid profile",
    pkce: true,
    async profile(accessToken, fetcher) {
      const info = await getJson("https://openidconnect.googleapis.com/v1/userinfo", accessToken, fetcher);
      const sub = str(info.sub);
      if (!sub) throw new Error("profile has no sub");
      return { providerUserId: sub, name: str(info.name) };
    },
  },
  // https://discord.com/developers/docs/topics/oauth2. PKCE is left off: Discord doesn't document it for this flow.
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify",
    pkce: false,
    async profile(accessToken, fetcher) {
      const user = await getJson("https://discord.com/api/users/@me", accessToken, fetcher);
      const id = str(user.id);
      if (!id) throw new Error("profile has no id");
      return { providerUserId: id, name: str(user.global_name) ?? str(user.username) };
    },
  },
};

export function oauthCredentials(provider: AuthProvider, env: Env): OAuthCredentials | null {
  const [clientId, clientSecret] =
    provider === "google" ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET] : [env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function usesPkce(provider: AuthProvider): boolean {
  return PROVIDERS[provider].pkce;
}

/** 32 random bytes, base64url: `state` values and PKCE verifiers. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** The provider's consent page. `verifier` is null when the provider doesn't use PKCE. */
export async function authorizeUrl(
  provider: AuthProvider,
  credentials: OAuthCredentials,
  redirectUri: string,
  state: string,
  verifier: string | null,
): Promise<string> {
  const spec = PROVIDERS[provider];
  const url = new URL(spec.authorizeUrl);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", spec.scope);
  url.searchParams.set("state", state);
  if (verifier) {
    url.searchParams.set("code_challenge", await pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/** Trades the callback's code for an access token, then reads the profile. Throws on any failure. */
export async function fetchProfile(
  provider: AuthProvider,
  credentials: OAuthCredentials,
  redirectUri: string,
  code: string,
  verifier: string | null,
  fetcher: typeof fetch = fetch,
): Promise<ProviderProfile> {
  const spec = PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  if (verifier) body.set("code_verifier", verifier);
  const response = await fetcher(spec.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error(`token request failed: ${response.status}`);
  const accessToken = str(((await response.json()) as Record<string, unknown>).access_token);
  if (!accessToken) throw new Error("token response has no access_token");
  return spec.profile(accessToken, fetcher);
}
