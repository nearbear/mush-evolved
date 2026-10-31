// Account display names and the account HTTP API's shapes (#283, #284). The
// server checks every name with `checkDisplayName`; the client may call it too,
// for feedback before sending.

import { moderateName } from "./moderation.ts";
import { MAX_NAME_LENGTH } from "./protocol.ts";

/** Why a display name was refused. Error codes, translated by the client. */
export type DisplayNameError = "name_empty" | "name_too_long" | "name_rejected";

/**
 * A display name as it would be stored: whitespace runs folded to one space,
 * trimmed, at most MAX_NAME_LENGTH characters, and unchanged by name
 * moderation (a name with a link or a blocked word is refused, not masked).
 */
export function checkDisplayName(raw: string): { ok: true; name: string } | { ok: false; reason: DisplayNameError } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, reason: "name_empty" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: "name_too_long" };
  if (moderateName(name) !== name) return { ok: false, reason: "name_rejected" };
  return { ok: true, name };
}

/** Sign-in providers. */
export const AUTH_PROVIDERS = ["google", "discord"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function isAuthProvider(value: string): value is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * `GET /api/me`. `signup`: back from a first sign-in, the name isn't confirmed
 * yet (`POST /api/signup`); `suggestedName` is the provider's name when it is
 * valid and free, else null (the field starts empty).
 */
export type MeResponse =
  | { status: "signed_out" }
  | { status: "signup"; suggestedName: string | null }
  | {
      status: "signed_in";
      account: {
        id: string;
        displayName: string;
        /** Sign-in methods linked to the account, at most one per provider. */
        providers: AuthProvider[];
        /** When the next rename is allowed (Unix ms); null if allowed now. */
        renameAllowedAt: number | null;
      };
    };

/** `POST /api/signup` with `{ name }`. */
export type SignupResponse = { ok: true } | { ok: false; reason: DisplayNameError | "name_taken" | "no_signup" };

/** `POST /api/rename` with `{ name }`. `too_soon`: within a day of the last rename. */
export type RenameResponse =
  | { ok: true }
  | { ok: false; reason: DisplayNameError | "name_taken" | "name_unchanged" | "too_soon" | "signed_out" };

/**
 * Where an OAuth callback sends the browser back: `/` on a sign-in, otherwise
 * `/?auth=<outcome>`. `signup`: confirm the name (see MeResponse).
 * `identity_taken`: that provider account belongs to another player.
 * `provider_linked`: this account already has a sign-in from that provider.
 */
export type AuthOutcome = "signup" | "linked" | "identity_taken" | "provider_linked" | "denied" | "failed";
