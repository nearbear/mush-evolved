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
### 2026-10-11

Replaced the text-only game screen with a basic 2D DOM UI using the Mush art (Claude Code).
- Assets are imported from `Mush/` in place via Vite `import.meta.glob`, so only the matched files are bundled and nothing is copied into the code tree. Added `Mush/LICENSE.txt` (upstream text) and `Mush/ATTRIBUTION.md`, plus an in-game credit line.
- Character sprite strips have no alpha; each uses a solid background color that varies per file (inspected by decoding the PNGs). The client keys out the top-left pixel's color on a canvas at load time instead of shipping edited copies.
- Added a cosmetic `character` to `Seat`, assigned at random by the matchmaker. The 16 crew with both a sprite and a portrait match the planned 16 seats. It has no rules effect.
- Not verified visually by the assistant: no headless browser was available, so only typecheck, tests, build, and a dev-server smoke check ran.
- Follow-up: replaced the room-illustration scene plan with the original isometric ship. Wrote a build-time converter (`tools` workspace) from `ShipMap.png` + `tiles.xml` to typed JSON, reproducing the Haxe loader's rules instead of guessing color meanings. Added `@types/node` (approved).
- Needed correction: an early analysis claimed every map color was defined in `tiles.xml`; truncated output (`head`) hid four unknowns. One was a trailing space in the XML, three are genuinely undefined. The converter now fails on any color not explicitly allowlisted.
- Needed correction: `tiles.xml` says `params="top,left,..."` but the parser treats it as `x,y`; and `BmpGfx2` is `gfx_01.png`, not `gfx_02.png`. Both confirmed against the images.
- Switched the rules map from 7 placeholder rooms to the original ship (27 rooms with doors, original ids like `CORRIDOR_A`); start room `LABORATORY` per the user. The converter also emits `ship-rooms.json`, which the rules import, so the derived graph stays in the CC-licensed tree and the rules don't depend on the 400 KB art layout.
- Verification that worked: cross-checked the 40 door connections against the room geometry of eMush's minimap (supplied by the user). Every door joins two rooms that touch there. Used only as a check; nothing from eMush (likely AGPL) was copied into the project.
- Built the isometric room view in the DOM (user chose DOM over canvas). The placement math lives in a pure module ported from the Haxe client's projection and sort rules. Since the assistant has no browser, it rendered rooms to PNG offline with that same module and inspected them; this confirmed sprite centering (inferred, since the `mt.pix` library isn't in the archive), paint order, and door positions (which also matched the eMush minimap layout).
- Needed correction: standing spots near the room's centroid put people inside the motor room's machinery, and a first fix stacked several people on one cell. Final version ranks floor by open space around it and places people greedily at least a cell apart. Walkability now follows the original `Grid.isWalkable` (door and non-decal footprints block).
