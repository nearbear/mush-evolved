// The site API's OpenAPI 3.1 document and its docs page (#324), at /api/openapi.json and /api/docs.
//
// Served only where cheats are on (`ALLOW_CHEATS`: `npm run dev` and the test deployment, owner 2026-10-31);
// production and staging answer 404, as for any unknown path. The API isn't secret (the client calls it), but a
// public "try it" page invites traffic the rate limits then have to absorb.
//
// The bodies come from apiSchemas.ts through zod's own JSON Schema output (OpenAPI 3.1 schemas are JSON Schema). The
// paths are written out here; a test checks that they are exactly auth.ts's routes. The page is Scalar's, which
// loads its script from a CDN (pinned below); a Content-Security-Policy, if one is added, needs an exception for it.

import { AUTH_PROVIDERS } from "@mush2/shared";
import { Scalar } from "@scalar/hono-api-reference";
import type { Context, Env as HonoEnv } from "hono";
import * as z from "zod";
import {
  apiSchemas,
  FinishedGamesResponseSchema,
  InvalidCursorSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  NameRequestSchema,
  NotFoundSchema,
  PostSetupRequestSchema,
  PostSetupResponseSchema,
  RateLimitedSchema,
  RenameResponseSchema,
  SetupListResponseSchema,
  SetupLookupResponseSchema,
  SignupResponseSchema,
} from "./apiSchemas.ts";
import { json } from "./http.ts";

/** The docs page's script, a fixed version so the page doesn't change under us. */
export const SCALAR_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4";

export const DOCUMENT_PATH = "/api/openapi.json";

/** Whether this server serves the document and the docs page. */
export const docsEnabled = (env: Env): boolean => env.ALLOW_CHEATS === "true";

const notFound = (): Response => json({ error: "not_found" }, 404);

// ---- The document

const ref = (schema: z.ZodType) => {
  const meta = apiSchemas.get(schema);
  if (!meta) throw new Error("schema not in apiSchemas");
  return { $ref: `#/components/schemas/${meta.id}` };
};

const jsonContent = (schema: z.ZodType) => ({ "application/json": { schema: ref(schema) } });
const jsonResponse = (description: string, schema: z.ZodType) => ({ description, content: jsonContent(schema) });
const requestBody = (schema: z.ZodType, maxBytes: number) => ({
  required: true,
  description: `JSON (Content-Type application/json), at most ${maxBytes} bytes. A body that isn't this is answered by the route's own error, after its other checks.`,
  content: jsonContent(schema),
});
const redirect = (description: string) => ({ description, headers: { Location: { schema: { type: "string" } } } });
const rateLimited = { "429": jsonResponse("Over the rate limit (see Retry-After).", RateLimitedSchema) };
/** A string parameter. A path parameter is always required. */
const param = (where: "path" | "query", key: string, options: { required?: boolean; values?: readonly string[]; description?: string } = {}) => ({
  name: key,
  in: where,
  required: where === "path" || options.required === true,
  schema: { type: "string", ...(options.values && { enum: options.values }) },
  ...(options.description !== undefined && { description: options.description }),
});
const providerParam = param("path", "provider", { values: AUTH_PROVIDERS });

/** The document. `version` is the server's RULES_VERSION. `maxBodies` are the routes' body caps. */
export function apiDocument(version: string, maxBodies: { name: number; setup: number }): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(apiSchemas, {
    target: "draft-2020-12",
    // A request may carry fields a `z.object` ignores; input mode doesn't forbid them.
    io: "input",
    uri: (id) => `#/components/schemas/${id}`,
  });
  for (const schema of Object.values(schemas)) {
    delete schema.$schema;
    delete schema.$id;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Site API",
      version,
      description:
        "Accounts and posted setups. Requests carry the browser's session cookie (HttpOnly, set by signing in to the game in this browser), so try requests from a browser that is signed in. Every JSON answer is `Cache-Control: no-store`. A known path with the wrong method answers 405.",
    },
    paths: {
      "/auth/{provider}/start": {
        get: {
          summary: "Start signing in",
          description: "A page navigation, not a fetch: redirects to the provider's consent page.",
          parameters: [
            providerParam,
            param("query", "link", { values: ["1"], description: "Add the provider to the signed-in account instead." }),
          ],
          responses: {
            "302": redirect("To the provider; or back to `/?auth=failed` (link while signed out) or `/?auth=rate_limited`."),
            "404": jsonResponse("Unknown provider.", NotFoundSchema),
            "503": { description: "The provider isn't configured on this server." },
          },
        },
      },
      "/auth/{provider}/callback": {
        get: {
          summary: "Back from the provider",
          description: "Only works for the browser that started the sign-in (its state cookie).",
          parameters: [
            providerParam,
            param("query", "code"),
            param("query", "state"),
            param("query", "error", { description: "Set by the provider when the player refused." }),
          ],
          responses: {
            "302": redirect("To `/` when signed in, otherwise `/?auth=<outcome>`: signup, linked, identity_taken, provider_linked, denied, failed."),
            "404": jsonResponse("Unknown provider.", NotFoundSchema),
          },
        },
      },
      "/auth/dev": {
        get: {
          summary: "Dev sign-in",
          description: "For tooling: signs in to the test account of that name, creating it. Only on `npm run dev` from localhost; 404 elsewhere, the test deployment included.",
          parameters: [param("query", "name", { required: true })],
          responses: {
            "302": redirect("To `/`, signed in; or back to `/?auth=rate_limited`."),
            "400": { description: "A name that isn't valid." },
            "404": jsonResponse("Not a local dev server.", NotFoundSchema),
            "409": { description: "The name belongs to a real account." },
          },
        },
      },
      "/auth/logout": {
        post: {
          summary: "Sign out",
          description: "Ends this browser's session and any pending sign-up. Never rate limited.",
          responses: { "200": jsonResponse("Signed out.", LogoutResponseSchema) },
        },
      },
      "/api/me": {
        get: { summary: "This browser's account", responses: { "200": jsonResponse("The account, a pending sign-up, or signed out.", MeResponseSchema), ...rateLimited } },
      },
      "/api/signup": {
        post: {
          summary: "Confirm the name of a first sign-in",
          description: "Creates the account for the pending sign-up and signs in.",
          requestBody: requestBody(NameRequestSchema, maxBodies.name),
          responses: {
            "200": jsonResponse("Signed up and in.", SignupResponseSchema),
            "400": jsonResponse("Refused; see `reason`.", SignupResponseSchema),
            ...rateLimited,
          },
        },
      },
      "/api/rename": {
        post: {
          summary: "Change the display name",
          description: "At most once a day.",
          requestBody: requestBody(NameRequestSchema, maxBodies.name),
          responses: {
            "200": jsonResponse("Renamed.", RenameResponseSchema),
            "400": jsonResponse("Refused; see `reason`.", RenameResponseSchema),
            ...rateLimited,
          },
        },
      },
      "/api/setups": {
        get: {
          summary: "List setups",
          description: "Public; `mine` is filled in when signed in.",
          responses: { "200": jsonResponse("The setups.", SetupListResponseSchema), ...rateLimited },
        },
        post: {
          summary: "Post a setup",
          description: "Needs an account. Also limited to 3 posts a minute per account.",
          requestBody: requestBody(PostSetupRequestSchema, maxBodies.setup),
          responses: {
            "200": jsonResponse("Posted.", PostSetupResponseSchema),
            "400": jsonResponse("Refused; see `reason`.", PostSetupResponseSchema),
            ...rateLimited,
          },
        },
      },
      "/api/setups/{id}": {
        get: {
          summary: "Look up a setup",
          description: "Any version, even one that no longer validates. `standard` is the standard setup.",
          parameters: [param("path", "id")],
          responses: {
            "200": jsonResponse("The setup.", SetupLookupResponseSchema),
            "404": jsonResponse("No such setup.", NotFoundSchema),
            ...rateLimited,
          },
        },
      },
      "/api/games": {
        get: {
          summary: "List finished games",
          description: "Public. Finished multiplayer games, newest first; single-player games are never listed.",
          parameters: [
            param("query", "before", { description: "The `next` cursor of the previous page. Absent for the newest games." }),
            param("query", "limit", { description: "Games per page, 1 to 20 (default 20)." }),
          ],
          responses: {
            "200": jsonResponse("A page of games.", FinishedGamesResponseSchema),
            "400": jsonResponse("Not a cursor.", InvalidCursorSchema),
            ...rateLimited,
          },
        },
      },
    },
    components: { schemas },
  };
}

// ---- The routes (auth.ts). Plain `Response`s, so the typed client in `web` doesn't list them.

export function documentRoute(env: Env, maxBodies: { name: number; setup: number }): Response {
  return docsEnabled(env) ? json(apiDocument(env.RULES_VERSION ?? "dev", maxBodies)) : notFound();
}

export async function docsPageRoute<E extends HonoEnv>(env: Env, c: Context<E>): Promise<Response> {
  if (!docsEnabled(env)) return notFound();
  const page = Scalar<E>({ url: DOCUMENT_PATH, cdn: SCALAR_SCRIPT, pageTitle: "Site API" });
  return (await page(c, async () => {})) ?? notFound();
}

/** Any other method on the document or the page: 405 like the other routes where they're served, else 404 like an unknown path. */
export function docsWrongMethodRoute(env: Env): Response {
  return docsEnabled(env) ? json({ error: "method_not_allowed" }, 405) : notFound();
}
