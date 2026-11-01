// The finished-games route (#155), routed by auth.ts after its rate limits.
//
//   GET /api/games?before=<cursor>&limit=<n>   FinishedGamesResponse: finished multiplayer games, newest first
//
// Public, by the owner's decision (2026-11-01, docs/rules/rules-design.md, "The list of finished games"): an entry is
// written only once the game has ended, and shows a little more than the end screen (alpha or beta Mush, and the
// starting character, which can reveal a Transfer). Single-player games are left out, names go through the same
// moderation as the end screen's, and no account ID is ever sent.

import { type FinishedGamesResponse, MAX_GAMES_PAGE } from "@mush2/shared";
import { decodeCursor, encodeCursor, type GameStore } from "./gameStore.ts";
import { json, type JsonResponse } from "./http.ts";

/** `before` and `limit` as sent; a missing or unreadable limit is a full page. */
export async function listGames(
  query: { before?: string | undefined; limit?: string | undefined },
  games: GameStore,
): Promise<JsonResponse<FinishedGamesResponse> | JsonResponse<{ error: "invalid_cursor" }, 400>> {
  const before = query.before === undefined || query.before === "" ? undefined : decodeCursor(query.before);
  if (before === null) return json({ error: "invalid_cursor" as const }, 400);
  const limit = Number(query.limit);
  const page = await games.listFinished({ ...(before && { before }), limit: Number.isInteger(limit) && limit > 0 ? limit : MAX_GAMES_PAGE });
  const body: FinishedGamesResponse = { games: page.games, next: page.next && encodeCursor(page.next) };
  return json(body, 200);
}
