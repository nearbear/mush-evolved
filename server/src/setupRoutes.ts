// Setup routes (#233), reached through handleAuth (auth.ts), which applies the /api rate limits first: the general
// AUTH_LIMIT, and SETUP_POST_LIMIT (3 a minute per account) on posts.
//
//   GET  /api/setups        SetupListResponse: the newest version of every setup that validates; `mine` when signed in
//   GET  /api/setups/<id>   SetupLookupResponse: any version, even one that no longer validates; 404 if unknown
//   POST /api/setups        PostSetupRequest -> PostSetupResponse; needs an account
//
// Reading is public (owner, 2026-10-31). Nothing is pushed when a setup is posted: the client refreshes. The standard
// setup isn't stored or listed (the client always has it, `STANDARD_SETUP`), but a lookup of its ID returns it.
// A response never holds an account ID: `ownerName` is the owner's current display name.

import {
  MAX_RULES_VERSION_LENGTH,
  MAX_SETUP_ID_LENGTH,
  moderateSetupTexts,
  type PostSetupResponse,
  parsePostSetup,
  STANDARD_SETUP,
  STANDARD_SETUP_ID,
  type SetupListResponse,
  type SetupLookupResponse,
} from "@mush2/shared";
import { json, readJsonBody } from "./http.ts";
import type { SetupStore } from "./setupStore.ts";

/** Largest setup post accepted: three languages of a name and a 500-character description, with room for escapes. */
export const MAX_SETUP_BODY = 16 * 1024;

export interface SetupRouteDeps {
  setups: SetupStore;
  now: number;
  /** `RULES_VERSION`, stored with each post for display. */
  rulesVersion: string;
  /** The request's session, renewing it if due (auth.ts's `currentSession`). */
  session: () => Promise<{ accountId: string; renewedCookie: string | null } | null>;
}

export const isSetupPath = (path: string) => path === "/api/setups" || path.startsWith("/api/setups/");

export async function handleSetupRoute(request: Request, path: string, deps: SetupRouteDeps): Promise<Response> {
  if (path === "/api/setups") {
    if (request.method === "GET") return list(deps);
    if (request.method === "POST") return post(request, deps);
    return json({ error: "method_not_allowed" }, 405);
  }
  const id = decodeId(path.slice("/api/setups/".length));
  if (id === null) return json({ error: "not_found" }, 404);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  return lookup(id, deps);
}

function decodeId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    return id !== "" && id.length <= MAX_SETUP_ID_LENGTH && !id.includes("/") ? id : null;
  } catch {
    return null;
  }
}

async function list(deps: SetupRouteDeps): Promise<Response> {
  const session = await deps.session();
  const listed = await deps.setups.list();
  const body: SetupListResponse = {
    setups: listed.map((l) => l.setup),
    mine: session
      ? {
          ids: listed.filter((l) => l.ownerId === session.accountId).map((l) => l.setup.id),
          ...(await deps.setups.counts(session.accountId)),
        }
      : null,
  };
  return json(body, 200, session?.renewedCookie ? [session.renewedCookie] : []);
}

async function lookup(id: string, deps: SetupRouteDeps): Promise<Response> {
  const setup = id === STANDARD_SETUP_ID ? { ...STANDARD_SETUP, latest: true } : await deps.setups.get(id);
  if (!setup) return json({ error: "not_found" }, 404);
  const body: SetupLookupResponse = { setup };
  return json(body);
}

async function post(request: Request, deps: SetupRouteDeps): Promise<Response> {
  const session = await deps.session();
  const cookies = session?.renewedCookie ? [session.renewedCookie] : [];
  const reply = (body: PostSetupResponse) => json(body, body.ok ? 200 : 400, cookies);
  if (!session) return reply({ ok: false, reason: "signed_out" });
  const input = parsePostSetup(await readJsonBody(request, MAX_SETUP_BODY));
  // i18n-ignore: an error code, not text
  if (!input) return reply({ ok: false, reason: "invalid" });
  const text = moderateSetupTexts(input.text);
  if (!text.ok) return reply({ ok: false, reason: text.reason, ...(text.lang && { lang: text.lang }) });
  const result = await deps.setups.post(
    session.accountId,
    { text: text.text, knobs: input.knobs, ...(input.previousId !== undefined && { previousId: input.previousId }) },
    deps.rulesVersion.slice(0, MAX_RULES_VERSION_LENGTH),
    deps.now,
  );
  return reply(result);
}
