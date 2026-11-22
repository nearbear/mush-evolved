// Operator routes under /admin/, called by tools in tools/src/ops/ (docs/ops/config.md, `ADMIN_TOKEN`). Today only
// `POST /admin/retire-ships`, which `npm run retire-ships` calls: it retires every running ship in the deployment
// (`GameRoom.retire`) without a deploy or a STATE_VERSION bump.
//
// A deployment without the `ADMIN_TOKEN` secret has no /admin/ routes at all (404), so setting it is what turns them
// on. The response carries room IDs and counts only: no account, name or game state.

import type { ShipStore } from "./shipStore.ts";
import { failure, logWarn } from "./log.ts";

declare global {
  interface Env {
    /** Bearer token for /admin/ routes; a secret, set only where the operator wants them (`npm run retire-ships -- --init`). */
    ADMIN_TOKEN?: string;
  }
}

export interface RetireResult {
  retired: string[];
  /** Asked, but not running (ended, never launched, already retired). */
  skipped: string[];
  /** The room couldn't be asked or its D1 writes failed, with the error (as `failure` logs it); running it again tries these again. */
  failed: { roomId: string; errorName: string; message?: string }[];
}

export interface AdminDeps {
  ships: ShipStore;
  /** Each lobby's open ship, which may have no running-ships row yet. */
  openRooms: () => Promise<string[]>;
  retire: (roomId: string) => Promise<boolean>;
  /** Lets each lobby forget a retired open ship at once. */
  recheckLobbies: () => Promise<void>;
}

/** Retires every running ship: those with a running-ships row and each lobby's open ship. */
export async function retireShips(deps: AdminDeps): Promise<RetireResult> {
  const rooms = new Set([...(await deps.ships.roomIds()), ...(await deps.openRooms())]);
  const result: RetireResult = { retired: [], skipped: [], failed: [] };
  for (const roomId of rooms) {
    try {
      (await deps.retire(roomId) ? result.retired : result.skipped).push(roomId);
    } catch (e) {
      const why = failure(e);
      logWarn("retire_failed", { roomId, ...why });
      result.failed.push({ roomId, errorName: why.errorName ?? "unknown", ...(why.message !== undefined && { message: why.message }) });
    }
  }
  await deps.recheckLobbies();
  return result;
}

/** Equal in time whatever the inputs: both are hashed first, so length and prefix say nothing. */
async function sameToken(given: string, expected: string): Promise<boolean> {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Answers /admin/ requests; null for any other path. */
export async function handleAdmin(request: Request, env: Pick<Env, "ADMIN_TOKEN">, deps: () => AdminDeps): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/admin/")) return null;
  const expected = env.ADMIN_TOKEN;
  if (!expected) return new Response("Not found", { status: 404 });
  const given = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!given || !(await sameToken(given, expected))) return new Response("Unauthorized", { status: 401 });
  if (pathname !== "/admin/retire-ships") return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const result = await retireShips(deps());
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
