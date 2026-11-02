import { getServerByName, routePartykitRequest } from "partyserver";
import { accountStoreFor } from "./accountStore.ts";
import { handleAuth } from "./auth.ts";
import { gameStoreFor } from "./gameStore.ts";
import { setupStoreFor } from "./setupStore.ts";
import { sweepShips } from "./shipSweep.ts";

export { GameRoom } from "./GameRoom.ts";
export { Matchmaker } from "./Matchmaker.ts";

// /auth/* and /api/* are sign-in, accounts, setups, finished games and their replays (auth.ts, setupRoutes.ts,
// gameRoutes.ts, replayRoutes.ts). /parties/game-room/:id and /parties/matchmaker/:id go to the Durable Objects.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = accountStoreFor(env);
    // A session that ends leaves its newest ship, even one it died on and still watches.
    const revokeSeats = async (accountId: string, sessionKey: string) => {
      const [newest] = await store.ships(accountId);
      if (newest) await (await getServerByName(env.GameRoom, newest.roomId)).revokeSession(sessionKey);
    };
    const auth = await handleAuth(request, env, { store, setups: setupStoreFor(env), games: gameStoreFor(env), replays: env.REPLAYS, now: Date.now(), revokeSeats });
    if (auth) return auth;
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },

  // The daily cron (triggers.crons in wrangler.jsonc): expired sessions and sign-ups are deleted, and open
  // account_ships rows whose ship doesn't have the account aboard are closed.
  async scheduled(_controller, env): Promise<void> {
    const store = accountStoreFor(env);
    const now = Date.now();
    await store.deleteExpired(now);
    await sweepShips(store, async (roomId) => (await getServerByName(env.GameRoom, roomId)).seatAccounts(), now);
  },
} satisfies ExportedHandler<Env>;
