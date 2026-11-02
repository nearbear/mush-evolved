/**
 * Cross-site WebSocket hijacking guard. Session cookies are SameSite=Lax, which browsers already withhold from
 * cross-site WebSocket handshakes; this is defense in depth (a sibling subdomain on a custom domain is same-site, and
 * the cookie attributes could change later).
 *
 * A browser always sends `Origin` on a WebSocket handshake, so an upgrade whose Origin host differs from the host it
 * was sent to is refused. A missing Origin is allowed: only non-browser clients (bots, tests, tooling) omit it, and
 * they have no ambient cookies to abuse.
 */
export function crossOriginUpgrade(request: Request): boolean {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return false;
  const origin = request.headers.get("Origin");
  if (origin === null) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true; // "null" or malformed
  }
}
