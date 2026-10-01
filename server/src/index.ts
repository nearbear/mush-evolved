import { routePartykitRequest } from "partyserver";

export { GameRoom } from "./GameRoom.ts";
export { Matchmaker } from "./Matchmaker.ts";

// Routes /parties/game-room/:id and /parties/matchmaker/:id to the Durable Objects.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
