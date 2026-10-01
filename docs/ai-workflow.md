### 2026-09-30

Decided to go with PartyKit / partyserver on Cloudflare Durable Objects for the realtime server."
Decided against using Yjs for game state synchronization due to its visibility of all shared documents to every client, which is unsuitable for hidden information like roles and secret actions.
Decided against using boardgame.io for the server due to its Node.js requirement and potential complexity in handling hidden information securely.
Decided against using three.js for the initial prototype, opting for a basic DOM-rendered approach first.
Decided to use a monorepo layout with `web`, `server`, and `shared` packages, with Vite for the client and Vitest for tests.
### 2026-10-01

Scaffolded the skeleton with Claude Code: npm workspaces (`shared`, `server`, `web`), pure rules with Vitest tests, partyserver `Matchmaker` and `GameRoom` Durable Objects, and a plain React DOM client. Verified end to end against local wrangler (queue, bot fill, seat-token rejection, hidden roles, AP, cycle advance).
- Seat identity uses secret per-seat tokens issued by the matchmaker. Client-chosen player ids would let anyone request another seat's view.
- Game rules are deliberately minimal (move, AP, ready). Player/Mush counts and the map are placeholders pending rule decisions.
- Needed correction: `structuredClone` is not in the plain ES lib, so the env-agnostic `shared` package clones state via JSON instead.
- Needed correction: a "Network connection lost" error in the wrangler log was first misattributed to closing during the handshake. It turned out to be partyserver echoing a close frame on an already-closed socket, which is harmless.
