// Small helpers shared by the HTTP routes (auth.ts, setupRoutes.ts).

import type { Env as HonoEnv, MiddlewareHandler, TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * A JSON response that also carries its body type and status for the typed client in `web` (#324): Hono reads a
 * route's responses from its handler's return type, so a handler returning `json(body: MeResponse)` tells the client
 * that `/api/me` answers a MeResponse. A plain `Response` would tell it nothing.
 */
export type JsonResponse<T, S extends ContentfulStatusCode = 200> = Response & TypedResponse<T, S, "json">;

/** A JSON response that is never cached, with any cookies to set. */
export function json<T, S extends ContentfulStatusCode = 200>(body: T, status?: S, cookies: string[] = []): JsonResponse<T, S> {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  // The cast only adds the type-level body and status (TypedResponse has no runtime part).
  return new Response(JSON.stringify(body), { status: status ?? 200, headers }) as JsonResponse<T, S>;
}

/**
 * The parsed JSON body, or undefined if it isn't JSON or is larger than `maxBytes`. Requiring the JSON content type
 * also keeps plain cross-site form posts out. The size is checked from Content-Length before reading, so a huge or
 * streamed body is refused unread.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return undefined;
  const length = Number(request.headers.get("Content-Length") ?? Number.NaN);
  if (!(length >= 0 && length <= maxBytes)) return undefined;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** What `jsonBody` hands the route: the body as `parse` returned it, null when it was missing or malformed. */
export interface ParsedBody<T> {
  body: T | null;
}

/**
 * A route's JSON body (#324): reads it with readJsonBody and `parse`, and declares `T` as the route's input, so the
 * typed client in `web` knows what to send. It never answers by itself: the handler reads `c.req.valid("json").body`
 * and decides, so a bad body is still reported after the route's own checks (a signed-out post is `signed_out`, not
 * `invalid`) and with the route's own error body.
 */
export function jsonBody<T, E extends HonoEnv = HonoEnv>(
  maxBytes: number,
  parse: (value: unknown) => T | null,
): MiddlewareHandler<E, string, { in: { json: T }; out: { json: ParsedBody<T> } }> {
  return async (c, next) => {
    const parsed: ParsedBody<T> = { body: parse(await readJsonBody(c.req.raw, maxBytes)) };
    c.req.addValidatedData("json", parsed);
    await next();
  };
}
