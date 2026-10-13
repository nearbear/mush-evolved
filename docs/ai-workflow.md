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

### 2026-10-11 (later)

Three-panel layout (inspect | isometric world | iTrackie) with Base UI, AP/MP pip bars, MP movement, room log, and global chat.
- MP rules from the user: a move costs 1 MP; with none, 1 AP becomes 3 MP; start 0, cap 12. Made extensible as asked: a modifier registry of pure hooks keyed by id, with player state holding only ids (state must stay JSON). `moveCost` is the one place a move is priced.
- Room log rules from the user: current room's history; private actions never shown to others; secret actions become room history only with a witness. The server filters, so other rooms' history never leaves it.
- Chat is a rules function, not an `Action`, because free text can't be listed in `legalActions`. Moderation and rate limiting are the server's job before the rules see the text; the moderation code is in `shared` so it's unit-tested.
- Added a stored-state version so games saved in the old shape are discarded instead of crashing on missing fields.
- Needed correction: the background dev server failed silently after a session restart had cleared `/tmp`; the smoke test then timed out. Recreated the directory and reran.

### 2026-10-11 (tooling)

Added Playwright (`tools`, user-approved) with `npm run screenshot`, plus two project skills: `play` (launch and visually check the game) and `rule` (ask before inventing rules, implement purely, test hidden info, record the decision).
- What worked: the first real-browser run confirmed the three-panel UI, pip bars, inspect, chat, and door movement, which until then had only been checked with offline PNG renders and WebSocket scripts.
- Needed the user: Chromium on WSL needed system libraries via `sudo npx playwright install-deps chromium`, which the assistant can't run (no password).

### 2026-10-11 (site chrome)

Skinned the existing UI with images from `Mush/www/img/design/` (asked: use as many as possible, infer placement, skip anything unsure).
- No CSS or templates survived in the archive, so placement was inferred from file names, sizes, and the images themselves (rendered as contact sheets in headless Chromium, since the machine has no image tools).
- Used only where a matching UI element already exists: page backgrounds (`bg`, `bg_start` for the lobby), the 3-slice button with hover/pressed states, the larger `but2` button for "Find game", iTrackie tabs (`tabon`/`taboff`), the chat field (`chatbox`) and enter-key send button (`buttonchat`), and the loading spinner. Styled in CSS via `url()` into `Mush/`, no new dependencies.
- Deliberately skipped: images for features the slice doesn't have (shop/gold, packs, rankings, XP/levels, skills, NERON terminals, health/morale, alarms, popups, tooltips), Mush logos (trademark), and pieces whose original place couldn't be identified with confidence.

### 2026-10-11 (HP and morale)

Added HP and morale to player state and the top bar (AP/MP stacked, HP/morale stacked, 3x5 `lifebar`/`lifebar2` pips).
- Decided by the user when asked: caps of 14 (the original's `Const.hx` `MAX_HP`/`MAX_MORAL`), starting at 14 HP and 7 morale, visible only to their owner. Nothing changes them yet.
- Values live in `GameConfig`; `viewFor` passes them only in `you` (other players' views list fields explicitly), with tests checking `"hp"`/`"morale"` appear once in each serialized view. Bumped `STATE_VERSION` to 3.

### 2026-10-11 (AP cap)

AP changed from "refill to 4 each cycle" to start 8, +1 per cycle, cap 12, unspent AP carries over (user's decisions).
- The user added "+2 while in a bed". No bed action exists, so per the user's choice this became an `apPerCycle` modifier hook plus a registered `lying_down` modifier (+1); a lie-down action that adds and removes it is a separate rule change. The original game has the same idea (`LAID` status; beds in the bedrooms, a medical bed in the sick bay).
- What worked: asking before coding. "AP max 12" alone was ambiguous between refill-to-12 and accumulate-to-12, and the bed rule only surfaced in the answers.
- Bumped `STATE_VERSION` to 4 (config shape changed).

### 2026-10-11 (skills)

Added four project skills, at the user's request after the assistant suggested them: `asset`, `bot`, `leak-check`, and `wrap-up`. Each one encodes a CLAUDE.md rule that's easy to skip under momentum: licensing and "skip if unsure" for art, the bot architecture rules (own-seat view, spend cap, chat as prompt injection), the hidden-information rule, and verify-then-log.
- Turned the improvised contact-sheet script from the site-chrome session into `npm run contact-sheet` (`tools`, Playwright, no new dependencies), which the `asset` skill uses.

### 2026-10-11 (inventory)

Added an inventory: three private slots per player, unlimited storage per room, free `take`/`drop` actions logged as public room history (all decided by the user when asked; the request itself only gave slots and room storage).
- Kept abstract as asked: every item lives in one `Container` (a player or a room) in `GameState.items`. `capacity()` (config `inventorySlots` folded through a new `inventorySlots` modifier hook) and `canReach()` in `shared/src/items.ts` are the single places to change slot counts or add access controls later. No access controls added.
- Items are effect-less placeholders (Wrench, Blaster, Medikit) in `ITEM_TYPES`, placed via `config.startItems`, so the panel has something to show.
- `viewFor` sends only your own inventory and the current room's items; tests check that other inventories, other rooms' items, and item locations never appear. Bumped `STATE_VERSION` to 5.
- Correction during implementation: room items first listed in creation order, so a dropped item could appear above older ones. Transfers now move the item to the end of the list.

### 2026-10-11 (inspect and examine)

Made people, room equipment, and items selectable in the inspector, with "examine" as the only action for now. Nothing selected means you're inspecting yourself.
- Decided by the user when asked: examine is a real server action (so later actions plug into `legalActions` the same way), free, with a private log line; it works on everything you can see, yourself included. Equipment is the original per-room list, leaving out cameras and the help drone. The names are English, translated by hand from the French in `DataExt.ods`.
- Equipment comes from `tiles.xml` bindings. Four bindings (supercomputer, drug distiller, mycoscan, antenna upgrade) have no sprite in their room (things built later in the original), so `placedEquipment` only keeps bindings with a placed tile. Several bindings share one sprite (three beds, three patrol ships), and each claims the next unclaimed tile in order; which patrol ship is which on screen is a guess. The same function feeds `ship-rooms.json` for the rules and the renderer's click targets, so they can't disagree.
- The converter imports `shared/src/shipLayout.ts` directly instead of the package index, because the index loads `config.ts`, which reads the JSON the converter writes.
- Character inspection now uses the full art in `Mush/www/img/art/char/*.jpg` (user's choice).
- Bumped `STATE_VERSION` to 6 (config shape changed).

### 2026-10-11 (mobile layout)

Made phones a first-class target (user: "very important"). Below 1024px the game is tabbed: the top bar always shows, a bottom nav switches Inspect | Room | iTrackie (layout specified by the user), and the rest of the screen is one panel.
- Decided by the user when asked: tapping something in the room shows a peek bar (name, legal actions, More) instead of jumping to Inspect, and the ship map is hidden on phones. With no map, the assistant made door taps open the peek bar with a Go button, since double-tap is unreliable on touch browsers.
- The user asked the assistant to look for flaws in its own plan before building it. That review found four problems, which the user had added to the plan:
  - Measured from the layout data, wide rooms would have shrunk to 0.47x (Motor Room) and 0.5–0.7x (corridors, bays) on a phone, breaking the pixel art and making doors too small to tap. Phones now never go below 1x and scroll wide rooms sideways, centred on you.
  - The top bar would have taken too much of a landscape phone's height. It's now a single compact row there.
  - iOS doesn't shrink the page for the on-screen keyboard. Added `interactive-widget=resizes-content` (Android) and hid the nav while typing. **Still unverified on a real iPhone.**
  - A hidden panel measures 0×0, so the room must ignore that instead of scaling to nothing.
- Panels are hidden with CSS rather than unmounted, so chat drafts and the iTrackie tab survive switching. A hidden chat feed can't scroll, so it jumps to the latest message when it becomes visible again.
- The screenshot script now runs a phone pass (emulated iPhone 13, touch) in the same match as the desktop pass, and fails on any sideways page scroll.
- Needed correction, caught by the phone screenshots:
  - The nav's iTrackie button had the class `itrackie`, so it picked up the whole iTrackie panel's styles.
  - The desktop grid's `align-items: start` let a wide room push the panel off screen instead of scrolling.
  - The top bar wrapped to three rows until the name was allowed to shrink with an ellipsis.
- Plan deviation: the plan said the landscape top bar would drop the role label, claiming it was visible in Inspect on yourself. It isn't, so the role stays, and it fits.
- Follow-up (user): 360px is the minimum width to support. The phone pass now defaults to a 360x740 device (Galaxy S8), and landscape rotates whichever device is used. At 360px, the HP/morale stack wrapped below AP/MP and the top bar was 122px tall. Measured the elements in the browser instead of guessing, then trimmed spacing (gaps, label columns, value margins, side padding) without resizing the pixel-art pips. The stats now fit on one row (bar 85px), and the "Morale" label column was widened to its measured 43px so the HP and morale pips line up. In landscape, the cycle now sits under the name, as in portrait, which gives the name about 70px more.

### 2026-10-11 (pixel hit detection)

Replaced bounding-box clicks in the isometric room with hit detection on drawn pixels (user's request, after the assistant flagged that a big sprite like the cryo module blocked clicks on people behind it).
- Sprites no longer take pointer events. The viewport converts the pointer to room pixels and calls `hitTest`, a pure function that walks sprites in reverse paint order and returns the first one opaque at that point. Any opaque sprite blocks, interactive or not, so you click what you see. Hover (mouse/pen only) uses the same path and sets a `.hover` class and the tooltip.
- Alpha comes from `hitMask.ts`: each frame is drawn into a frame-sized canvas once and cached as a mask (the largest atlas is about 5600x4500, too big to read whole). Crew strips are color-keyed like `keyedSprite.ts`. Pixels under alpha 64 don't count, so soft shadows click through. Until an image loads, its sprite falls back to its box.
- The screenshot script can't click element centers any more, since centers may be transparent or covered. Its `pointOn` helper moves the mouse over the sprite until hit-testing marks it hovered, then clicks or taps there, so the script exercises the real hit path. A one-off probe found about half of the cryo module's box now falls through.

### 2026-10-11 (item icons)

Made all 152 icons in `Mush/www/img/icons/items/` available (`ITEM_ICONS`, `itemIcon(type)` in `web/src/art/assets.ts`) and showed them in the inventory panel, as the user asked.
- Item type ids already match icon file names (`wrench`, `blaster`, `medikit`), so the lookup is by type with no mapping table. `empty.jpg` is the bare blue slot tile, used for empty slots. Skipped `archive/`: older versions whose names collide with the main set.
- Needed a correction: Vite inlines files under 4 KB as base64, and the icons are about 2 KB each, so the JS bundle doubled (449 KB to 925 KB). `web/vite.config.ts` now never inlines files from `Mush/`, and the bundle dropped to 326 KB because other small Mush art had been inlined too.

### 2026-10-12 (package boundaries)

Asked the assistant whether the project structure was sound. It flagged three issues; the user chose fixes for each.
- `shared` imported `../../Mush/derived/ship-rooms.json`, a relative path out of its own package. The user chose to keep derived data in the CC-licensed tree (next to its license) and import it by name instead: `Mush/package.json` makes the folder a private workspace, `@mush2/assets`, whose `exports` allow only `derived/*`. The alternative, generating the file into `shared/`, was rejected so adaptations stay with their license.
- Needed correction: `npm run typecheck --workspaces` failed on the new package, which has no scripts. The root script now passes `--if-present`, rather than adding tooling scripts to the asset folder.
- Moved `Bot` and `WanderBot` from `shared` to `server/src/bots.ts`. Model-backed bots need network calls, secrets, and a spend cap, which break the "rules are pure" rule, and only the server runs bots anyway.
- Wrote `docs/testing.md`, a prioritized list of what to test and why. Writing it surfaced two real gaps: player names aren't moderated (though everyone sees them and they'll reach bot prompts), and a bot whose `decideAction` rejects goes unhandled in `scheduleBots`.

## 2026-10-13: iTrackie item, feature threads, Features tab

- **Decided (user):** each ship feature (botany, research, inventory, space battle, comms center, Pilgred repair, NERON projects) gets a crew-wide chat thread with global chat's permissions, shown with a feature-specific tracker above it, so players can track things without switching tabs. Everyone starts with an iTrackie; it is a normal item (takes a slot, can be dropped or taken), and carrying one is required to read and post in global chat and every feature thread. Trackers will be private, server-persisted, and tied to the iTrackie; private channels (host can invite and kick, members can only invite, kept for replays after everyone closes them) come later.
- **This pass:** threads are real (protocol whitelist, moderation, per-seat rate limit, per-channel history cap, `STATE_VERSION` 7); trackers are a UI-only notes list; private channels are an empty collapsible. Tabs: Room log | Global chat | Features (a native `<select>` picks the feature, which works well on phones).
- **What worked:** asking the open rule questions in one batch (global-chat gating, item behaviour, private-channel scope, tracker scope) before coding. Tests serialize the view to prove that dropping the iTrackie hides all chat text.
- **Needed correction:** the first restatement treated the feature tabs as tabs in a row; the user clarified a drop-down on mobile, with the room log and global chat always present. Pressure on the global chat history would have evicted feature threads, so the cap is now per channel.
- **Follow-up (same day):** added `npm run asset-index`, which writes every file name and size under `Mush/` to `Mush/derived/asset-index.txt`. The project's read-deny rules on `Mush/www` and `Mush/clients` also blocked `ls`, so assets couldn't be found by name. With the index, a grep found three candidates; a contact sheet showed them, and the user picked `super_talky.jpg` (Claude had guessed `talky_walky.jpg` from memory; corrected by the user). The item type is now `super_talky`, exported as `ITRACKIE_ITEM`.

### 2026-10-13 (wrap-up)

- Typecheck, all tests (shared 56, tools 12, web 17), and the web build pass. Leak check passed for the chat changes. No visual check was run.
- Decided by the user: feature list, iTrackie gating of global chat and threads, iTrackie as a normal item, private channels deferred to a stub, UI-only trackers, the `super_talky` icon, and the commit split (lobby, asset-index, iTrackie and features as three commits).
- Needed correction: the assistant guessed the wrong icon (`talky_walky`) from memory; the earlier log entry above used a `##` heading where this file uses `###`.
- Process note: `/wrap-up` can't be invoked by the assistant, so the user had to run it.
