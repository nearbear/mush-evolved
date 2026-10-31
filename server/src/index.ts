import { routePartykitRequest } from "partyserver";
import { accountStoreFor } from "./accountStore.ts";
import { handleAuth } from "./auth.ts";

export { GameRoom } from "./GameRoom.ts";
export { Matchmaker } from "./Matchmaker.ts";

// /auth/* and /api/* are sign-in and accounts (auth.ts). /parties/game-room/:id
// and /parties/matchmaker/:id go to the Durable Objects.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const auth = await handleAuth(request, env, { store: accountStoreFor(env), now: Date.now() });
    if (auth) return auth;
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },

  // The daily cron (triggers.crons in wrangler.jsonc): expired sessions and sign-ups are deleted.
  async scheduled(_controller, env): Promise<void> {
    await accountStoreFor(env).deleteExpired(Date.now());
  },
} satisfies ExportedHandler<Env>;
