// Small helpers shared by the HTTP routes (auth.ts, setupRoutes.ts).

/** A JSON response that is never cached, with any cookies to set. */
export function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
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
