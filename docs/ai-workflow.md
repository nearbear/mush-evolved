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

## 2026-10-13: i18n readiness review and checking tests

Asked the AI whether anything blocked adding English/French/Spanish later. It found the real constraints by reading the code: the game log is stored as finished English sentences, item/equipment/room names are resolved on the server, and errors are English strings on the wire. It also separated UI language (per player) from ship language (chat community), which I'd conflated.
Then had it write the checking tests (`tools/src/i18n/`) before any translation work, using a baseline ratchet so existing hardcoded text is recorded and can only shrink.
What needed correction: its first test fixtures were sloppy (an `undefined` cast, a wrong expected order), and the scanner flagged `aria-label={t("close")}` and a `className` string until it was told to skip translation keys and class names. A review of every finding by hand caught a trimmed-whitespace bug that hid `return \`the ${x}\`` in rules.ts. It also surfaced a real bug, `\b` ignoring accented letters in chat moderation, recorded as an `it.fails` test.

## 2026-10-13: Minimap with fog of war (replaces the room list)

- Asked for a plan first: fogged view of other rooms, plus a hover-to-expand minimap with room names and door markers. The AI found that the iso rooms have no shared coordinates, so drawing faded neighbours around the current room would mean inventing a layout; it recommended putting the fog in the minimap instead, and I agreed. Decisions: clicking a room in the minimap selects it (Go when reachable) rather than moving immediately; fog is grayscale; other players' locations stay public.
- Data: the obvious source, `starship_map.png`, turned out to be a 99x51 stylised picture. The original's color-coded plan image isn't in the archive, but `Map.hx` keeps its decoded result as a Haxe-serialized string. The AI wrote a small unserializer and converter (`ship-plan.json`) and checked it before writing the converter: same 27 rooms, and its 40 doors give exactly the rules' door graph. That check is now a test, and it would catch a wrong enum-to-room mapping.
- Mobile: the minimap shows on phones too, since nothing is hover-only (tap expands, tap selects, Go is a button).
- Needed correction: a hand-written Haxe IntMap test string was malformed, and the screenshot helper first used DOM types the tools package doesn't have. The new i18n ratchet (in progress in the same tree) flagged the minimap's 6 strings; there is no `t()` yet, so they went into the baseline for now.

## 2026-10-13: i18n seam (react-i18next)

Installed `i18next` and `react-i18next` (approved) and added the seam: `web/src/i18n/` (language choice, init, switcher), catalogs in `web/src/locales/`, typed keys via `CustomTypeOptions`. Converted only `BottomNav` and the lobby, as a proof the whole chain works; everything else stays on the hardcoded-text baseline for a later comprehensive pass.
Worked around a parallel AI session editing the minimap: touched only new files plus `main.tsx`, `BottomNav.tsx`, `Lobby.tsx`; kept the switcher's CSS in its own file instead of `styles.css`; left `GameScreen.tsx`, `styles.css`, `scene/*` and the ship-layout files alone. The model can't read `node_modules`, so library option names (`initAsync: false`) were checked by the compiler and a test rather than from the types.
Needed correction: the key-usage test read comments (a `t("...")` in a doc comment counted as a real key), so comments are now stripped first.
French and Spanish strings are first drafts and need a native speaker's review.

## 2026-10-13: i18n skill

The user asked whether an `i18n` skill was worth having and said they didn't know how to judge it. The assistant proposed three tests (the task recurs, it has conventions tests can't enforce, mistakes are costly to fix later), concluded yes, and wrote a short one (`.claude/skills/i18n/SKILL.md`) that leaves mechanical rules to `tools/src/i18n` and keeps only judgment calls. Not yet exercised; delete it if it never triggers or only repeats what the tests say.

### 2026-10-13: Linter choice
Asked whether a linter was needed; proposed ESLint + typescript-eslint (hooks deps, no-floating-promises, import restrictions). Checking peer deps before installing showed typescript-eslint caps at TypeScript <6.1 while the repo is on TS 7, so we switched to Biome (lint only). Trade-off: Biome's noFloatingPromises is nursery and not fully type-aware. First run flagged 17 existing items: 16 hook-dependency warnings that were intentional trigger deps (annotated with biome-ignore + reason) and 1 real unhandled promise rejection in useShipLayout (added .catch).

## 2026-10-13: Scheduled plans for coordinated actions

Planned an addition to the original action system: players post plans (ordered jobs, each one normal action) in private channels, and the server runs them at a set time or once every job is filled, all-or-nothing. It is meant to fix the relay problem in research and projects, where players otherwise have to be online at the same time. Plan in `docs/action-plans.md`.

- What worked: holding to "a planned action is a live action run later" (one shared legality path) answered most edge cases. A Q&A loop with the user closed the gaps: locked AP with a cross-hatch, 3-hour cycles, expiry, and tie order.
- Needed correction: the AI asked whether claimers should add their own movement jobs. The user pointed out that travel is implied by the action's room, so travel became part of every job. Writing the decisions down also exposed hidden-information leaks the first draft had: preflight hints showing others' AP, failure reasons revealing inventory, and auto-following a target revealing its location. Hints are now limited to the player's own jobs, failures show only who, and target rooms are fixed by an author who can see them.

## 2026-10-13: Action registry refactor (Phase 1 of action plans)

Replaced the per-action branches in `legalActions`/`applyAction` with one `ActionDef` per action in `shared/src/actions.ts`, with no behavior change. Log helpers moved to `log.ts` to avoid a circular import.

- Needed correction: the AI's first test checked that `applyAction` accepts exactly what `legalActions` offers. Deliberately breaking a `check` showed it could never fail, because both now call the same `check`, so they agree by construction. It was replaced with a test that pins the full legal set at game start plus the broke and full-inventory cases. Both deliberate breakages now fail it. Lesson: after a refactor that unifies two code paths, a test that they agree is a tautology. Sabotage a test before trusting it.
- TypeScript: `ActionDef<T>` keyed by the type tag (through `Extract<Action, {type: T}>`) is invariant, so the definitions couldn't be treated uniformly. Keying it by the action type itself (`ActionDef<A extends Action>`) fixed it without casts.

## 2026-10-13: glowing panel style and theme tokens

- Asked how to reproduce the original `tipbottom.png` edge effect in CSS. The `Mush/www` read deny blocked me from viewing it, so I first answered from the file names and sizes (a 3-slice tooltip) and asked the user to run `npm run contact-sheet` instead. Their permission in chat didn't override the deny rule, and I didn't route around it. The contact sheet showed a navy fill with a blue edge glow, so I replaced the sprites with pure CSS (inset `box-shadow` plus a translucent gradient) rather than shipping more art.
- Panels, the top bar and both tab sets (iTrackie and the phone bottom nav) now share one surface rule built from tokens (`--surface-top/bottom`, `--glow`, `--glow-rim`) with `color-mix` for the alphas, so a theme only sets variables. Removed the `taboff`/`tabon` gif use.
- Replaced the hard-coded colours (gold highlight, danger, badge, room background, ink) with tokens. Remaining theming blockers are the 3-slice button sprites and the `bg.jpg` backgrounds.
- Caveat: the glow values were estimated from a contact sheet whose labels covered half of each tile, and no screenshot check was run yet.

## 2026-10-13: private channels

Built Phase 2 of `docs/action-plans.md`: `PrivateChannel` in state, `createChannel`/`inviteToChannel`/`leaveChannel` in `rules.ts`, membership-only visibility in `viewFor`, protocol messages and server routing, and a real list in `ITrackie`. Planning questions to the user came first (who can invite, history for new members, dead players, limits); they answered all but dead players, which became a to-do rather than a guess.

- Decision I made without asking: invitees need only be alive (not carry an iTrackie), because refusing "no iTrackie" would let an inviter probe who carries one. All invitee-side failures return one error code for the same reason (limit, dead, unknown).
- Needed correction: the i18n ratchet rejected new English error strings in `shared`; switched to codes through a `fail()` helper. The client does not translate those codes yet.
- Not checked in a browser: the UI typechecks and lints, but no screenshot run at 360px or desktop.

## 2026-10-13: self panel under the room

- The request said "player information in the upper left"; I first read it as the Inspect panel, and my clarifying questions were built on that. The user corrected me: Inspect stays on the left, so they meant the top bar's player info. Lesson: when a description of a screen location is ambiguous, name the candidate components in the question instead of assuming one.
- Moved the portrait, name, role and stat pips (`PlayerSummary`), the room's items and the inventory into one `SelfPanel` under the iso room, room items on the left. On phones the summary stays in the top bar (so stats stay visible) and the item lists go in the Inspect tab. Added a `.room-view` wrapper so the minimap's absolute positioning stays tied to the room, not the whole column.
- Not yet checked visually (no screenshot pass run).

### 2026-10-13: private channels moved to a tab, then emoji icon buttons and tabs

- The user rejected my first UI (a collapsible below the iTrackie tabs) and asked for a tab like Features. I rebuilt it with the same drop-down-then-thread layout.
- Needed correction: the user asked for "icon buttons for these" and I took "these" to mean the three channel buttons. They meant the tabs, to fix the 360px width problem, on desktop too. I should have asked or named the tabs as the likelier reading. Redone as `IconTab`; the channel buttons stay icons as well. The user chose the approach (emoji placeholders, text in a tooltip); I added the Base UI Tooltip and wrote the code without being able to read `node_modules` (denied), relying on typecheck.
- Known gap I flagged: tooltips need hover or keyboard focus, so on touch the tabs are emoji only (`web/CLAUDE.md` says nothing important may be hover-only). Not checked in a browser at 360px or on desktop.

### 2026-10-13: Inventory as drag-and-drop tiles
- Requested by the user: drag and drop by default, bigger items, label moved inside the item box at the bottom. The assistant implemented it in `InventoryPanel.tsx` and `styles.css` (76px tiles, HTML5 drag between room and inventory zones, zones highlight only when `legalActions` allow take/drop).
- Decided by the assistant, not asked for: keep a Take/Drop button on the *selected* tile as the touch fallback. Reason: HTML5 drag is unreliable on phones, and Inspect/peek bar only offer Examine, so removing the buttons would have made take/drop impossible on mobile. User can remove it if they want drag-only.
- Verified with typecheck, lint, tests, and build. No visual or drag check was run, so the 360px layout and the drag behavior are untested.

### 2026-10-13: Plans revised from the "real-time optional planning" note
- The user asked what the scratchpad note would take. The assistant compared it with `docs/action-plans.md` and found conflicts (trigger, single vs. multi-actor, rollback, shadow targets vs. "author must be in the target's room", fixed start room), plus stop conditions that depend on mechanics that don't exist yet. Asked rather than picked.
- Decided by the user: shadow targets; optional jobs with partial completion and no rollback (reason: a saboteur removing an apron or a gun shouldn't undo everyone's work); a required failure stops the whole plan; no fixed start room; every plan has a time, with an author checkbox to run as soon as all jobs are filled; multi-member plans; auto-created jobs only as templates for actions known to need coordination (medic example). Race conditions noted for later (idea: artificial action durations).
- Contributed by the assistant and recorded: shadow targets only avoid a location leak if checks never run early ("no lookahead"), so learning a target's absence costs the same as walking there; item jobs name a type, resolved at run time. Updated `docs/action-plans.md`; open question left: should a claimer be able to secretly do something other than their declared job.
- Follow-up, decided by the user: secret substitution. Any job's holder may swap in any action; the plan card shows it as done (failed only if interrupted), so players deduce what happened. Motivation: an item fetched and handed over by a plan (coffee) must not be provably unspiked. The assistant flagged that "replace" means the declared step doesn't happen, so spiking a delivered coffee needs either a spare step or "insert before" semantics; left open, with when it can be set and which same-type item a job uses.
- Follow-up, decided by the user: secrets can both replace a job and run before it; a fixed completion step at the end of every plan covers "after the last job" (no "run after" option); secrets can change until the run. Secrets are recorded as macros through the shadow character in planning mode. The assistant proposed plan-local item handles to answer "which coffee" and listed open details (empty replacement, failed "before" secrets, ordering of concurrent secrets), and flagged the macro recorder as the largest UI piece.
- Follow-up, confirmed by the user: failed "before" secrets are skipped silently; secrets before the same step run in the order set; placeholder shadow items (plan item handles) answer "which coffee". The user expects an empty replacement of a required job to fail the plan; the assistant pointed out that by the "done means it ran" rule an empty macro would show done, and proposed treating empty as failed (awaiting confirmation). The user asked about natural pacing between steps; recorded as future work with tradeoffs (thinking time in recordings, secrets lengthening the timeline as a tell, mid-plan interleaving).
- Follow-up: the `/play` visual check was attempted twice and `npm run screenshot` hung both times, so the user chose to commit unverified visually and tracked the screenshot hang as a to-do in `docs/plan.md`.
- Build plan written (user asked for instant execution first, pacing later): ten steps in `docs/action-plans.md`, rules first (registry additions, posting, claiming and locks, executor, secrets), then server, a plain plan card, planning mode, bots, and the cycle timer. While writing it the assistant caught a contradiction it had left in the doc: preflight hints were described as simulating on a clone of the real state, which would be lookahead; changed to a "knowledge sandbox" built only from what the player already knows.

## 2026-10-13: tab icons
User supplied icon names for 14 tabs. Only Global and Private exist as iTrackie tabs, so only those got art; the other 12 are recorded in `docs/tab-icons.md` as wanted. Two names didn't match files exactly (`favorite.png` -> `fav.png`, `neron.png` -> `icons/ui/neron.png`); flagged to the user. Typecheck, lint, build pass; no visual check yet.

## 2026-10-13: coffee machine (dispense and consume actions)

- **Decided by the user:** pulling a coffee is free and works once per cycle per machine; a full inventory means the coffee is knocked over into the room, and that holds for every item-producing action; drinking is free, gives +2 AP capped at `maxAp`, works on a coffee in the inventory or on the room floor; all three log lines are public. Satiety is a to-do (coffee gives none, as in the base game).
- **Built:** `dispense` and `consume` actions, `produceItem` helper, `EquipmentType.dispenses`, `ItemType.consume`, `GameState.dispensedOn` (STATE_VERSION 10), client labels via i18n keys.
- **Worked:** asking the rule questions in one batch up front; the registry made each action a small definition.
- **Needed correction/decision:** the i18n ratchet failed on new English log lines in `shared`, since no structured log events exist. The user chose to raise the baseline by 2 rather than build them; I hand-edited the baseline (and lowered the `targets.ts` UI entry after moving its labels to `t()`).

2026-10-13 (follow-up): user added icons for room log, features, bottom nav (inspect, iTrackie), new-channel button, and wanted tabs (global log, astrophysics, space combat); NERON projects switched to `conceptor.png`. "glodplus" read as `goldplus.png`.
2026-10-13 (follow-up 2): icons for comms (comm.png), inventory (stock.png), books (learned.png; feature TBA, not built).
2026-10-13 (follow-up 3): phone nav Room = awake.png; expeditions (survival.png) recorded as wanted tab.
2026-10-13 (follow-up 4): Features drop-down replaced with a Base UI Select (native <select> can't show images); no new dependency. Not visually checked yet.

## 2026-10-13: pre-share asset license pass and code license

- User chose MIT for the code (considered AGPL, which eMush uses; MIT preferred for portfolio reuse, and the NC assets already block commercial use). Added root `LICENSE` with a note that `Mush/` is CC BY-NC-SA 4.0.
- Audited `Mush/` for third-party material: no fonts, audio or video; the `.swf` bundles have no font or sound tags; only third-party code is the Haxe Foundation MIT headers in `src/as/Hash.hx` and `IntHash.hx`. Found third-party marks left over: European Indie Game Days award logos (`www/img/loc/*/eigd.png`, `www/img/art/eigd_award_en.png`). `docs/mush-assets.md` was stale: it says `www/img/social/` still holds Motion Twin promo art, but the folder is gone.

### 2026-10-13: Single-player mode and the eMush-style join queue

- Discussed a single-player mode (one human vs. bots, "End cycle" button, server-side save slots) as an easier demo than live multiplayer. The AI pointed out that rate limiting by time doesn't cap spend, since cost scales with cycles played; proposed per-game and per-user token budgets with scripted fallback instead. Recorded in `docs/todo.md` as discussed, stage undecided.
- The user kept multiplayer in the MVP with a simpler model than the existing matchmaker: one queue per language that drops players into an open ship in a pre-selection phase (no Mush yet), forced to start on day 3 cycle 8. The current fill-with-bots timer will be replaced. Not implemented yet.
- Follow-up the same day (user decisions): a full ship starts early; no minimum player count (1 Mush at 8 or fewer, else 2); no spore actions and no combat during pre-selection; multiplayer has no bots, which are single player only. This settled the long-open "bots in live games" question, so CLAUDE.md, `docs/todo.md`, `docs/mvp-plan.md`, and `docs/rules-design.md` were updated. The assistant's first pass had left these as open questions instead of guessing, which worked: the user answered them directly.
- Single player (user decision): the human is always the only Mush, against 8 bots who are all human. The assistant noticed that 9 players would get 2 Mush under the multiplayer rule and asked; the user chose an explicit single-player exception. Side effect: bots never need to lie, only investigate, which simplifies the bot design.

### 2026-10-13: ACTOPI and minimap head icons

- **Request:** show small head icons on the minimap, toggled by "ACTOPI"; without it, only `mush.png`, so other players' locations stay secret.
- **Correction needed:** I first read this as "hide locations", and planned to stop sending other players' rooms. The user clarified that locations stay public and only identities are hidden (a dot on the bridge could be one of two people). That changed the design to room-only entries in `PlayerView.unidentified`, with `room` omitted from `OtherPlayerView` for strangers.
- **Decided by the user:** ACTOPI is a ship-wide in-game system state, default on, and for now a flag only. Its trigger is undecided.
- **What worked:** asking before coding found that the old view sent every player's room next to their id, so a client-side toggle alone would have hidden nothing.
- **Left open:** move log lines in your own room still name the destination ("left for X"), which links a person to a room they walk into.

### 2026-10-13: Player nameplate with faction icon

- **Decided by the user:** replace the text role badge with a card: faction icon (human, `starter.png` for alpha Mush, `mush_progressive.png` for beta Mush) with a hover goal popover; avatar inside the nameplate, faction on the right; flat blue background like an empty item slot, also behind the AP/MP and HP/morale stacks; fuchsia and light blue as faction colors (`--mush`, `--human` tokens, currently unused).
- **Decided by the assistant, with approval implied:** green `p_alive` astronaut as the human icon; a new `alpha` flag on `PlayerState` (own view only) since the state didn't record initial Mush; a Base UI popover instead of the tooltip because touch has no hover; `STATE_VERSION` bumped to 12.
- **Needed correction:** I wrote invented human goals into the tooltip and had to cut it to what the user said. I over-read "no styling" and removed the background the user wanted. The stat stacks first had padding but not the nameplate's height; fixed with flex stretch. A browser `EMPTY_SLOT_ICON is not defined` error was a stale hot reload, not a code bug. A visual check was never run.

### 2026-10-13: Nameplate restyle and stat stack layout (follow-up)

- **Decided by the user:** the nameplate is an MUI-style outlined card (1px outline in the faction color, same color at 25% opacity over the slot blue); the Mush color is sampled from the pink of `design/logo.png` (`#ff4c84`, the assistant did the sampling in headless Chromium since WSL has no image tools); the character name is a small white label with the item-label shadow; stat labels and values are white with a text shadow; on phones the two stat stacks sit side by side at equal widths.
- **Decided by the assistant:** stacked backgrounds (a one-color gradient over the slot image) as the overlay instead of a pseudo-element; scoping the stat text color to `.stat-stack`; keeping the stacks content-sized in landscape phones so equal flex doesn't collapse them.
- **Needed correction:** several rounds on text contrast (dark ink on bright plate, then muted gray on the tinted fill) before the user's own label-shadow idea fixed it; I over-saturated the first fuchsia. The 360px fit of the AP stack (12 pips) is a known risk and was never checked visually.

## 2026-10-13: GitHub Projects pilot

- Moved the UI, Rendering, Rules (including Open rule decisions), and Architecture to-dos into GitHub issues: 4 epics with 42 sub-issues, milestones MVP / Private beta / Public beta / Release taken from the draft `docs/mvp-plan.md`, and a user-level project (nearbear/projects/1). Items the draft plan marks (?) or leaves out got a `needs-staging` label instead of a milestone.
- Duplicate items (an open decision plus its matching Rules item) were merged into one issue, with the open questions as a checklist in the body.
- `docs/todo.md` stays the source for now; migrated lines end in `(#N)`.
- What worked: the issue list was written as a data file and created by a script that saves its progress, so when `gh project item-add` failed with a transient GraphQL error just after the project was created, a re-run with retries resumed without duplicating anything. Sub-issues needed the REST `sub_issues` endpoint, since `gh` 2.46 has no command for them.
- What needed correction: the first draft of the script forgot the project step, and one `(#N)` annotation key did not match the bold text in `todo.md`. Both were caught on review before the run.

### 2026-10-13: design catalog and panel restyle from `quote.png`
- **Decided by the user:** make a catalog of `Mush/www/img/design` like the icon catalog, group both catalogs in `docs/catalogs/`, sample `quote.png` for a panel style, make it the default for every panel, and give the iTrackie tabs and the mobile bottom nav the same look (same rim and corner radius).
- **Decided by the assistant, no approval asked:** the panel shadow value (`0 0 6px` at 0.55 alpha, tuned by eye to the sampled falloff), a bright-blue rim as the active-tab marker, and rounding the bottom nav on all corners (the iTrackie tabs are rounded on top only).
- **Worked:** the contact sheets, then zoomed re-renders of the tiny files, gave enough to describe all 325 design files. Sampling pixels with the existing `decodePng` in `tools/` gave exact values (fill `#1a1b4a`, rim `#26378c`, 1px rim plus about 5px of shadow).
- **Needed correction:** "move these into a folder" was ambiguous. I read it as the two catalogs, not the assets, and said so. Nothing checked visually; the screenshot pass was skipped, and the active-versus-idle tab contrast at 360px is unverified.

### 2026-10-13: slotted frames behind the AP/MP/HP/morale bars
- First attempt cropped and rotated `pabar.png` (11x79, vertical, 12 slots) with CSS background tricks. It looked blurry and fragile (half-pixel offsets, slot count fixed by the sprite), so the user had it rolled back.
- Second attempt: vector redraws in `Mush/derived/pip-bar/*.svg` (start cap, slot, thin slot, end cap; `currentColor`, `crispEdges`), assembled by `PipBar.tsx` into one inline SVG for any slot count. The sprite's size came from `file`, which the sandbox only let the user run.
- Not yet visually checked in a browser.

## 2026-10-13: GitHub Projects, full migration

- Migrated the rest of `docs/todo.md` after the pilot was approved: 6 more epics with 71 sub-issues (Site and accounts, Moderation, i18n, Testing, DevOps, Project management), and 12 standalone epics labelled `needs-breakdown` for single large items (original game data, the wiki) and the "Sections still to add". 135 issues in total; every unchecked to-do line now ends in `(#N)`.
- Merged cross-section duplicates (e.g. CI with "Run tests in CI", the per-language word lists listed under both Moderation and i18n) and flagged items whose wording predates the no-bots-in-multiplayer decision as "outdated in part" instead of silently rewriting them.
- What worked: a dry-run check that every annotation key matched exactly one unmigrated line before any issue was created, and reusing the resumable script (one transient GraphQL error on project item-add retried cleanly).

## 2026-10-13: Retired docs/todo.md

- The user approved the GitHub Projects setup, so `docs/todo.md` was deleted (it stays in git history) and every pointer to it was moved to the issues: CLAUDE.md "Open decisions" (with the `gh` commands to search and read issues), the README, `docs/mvp-plan.md`, `docs/rules-design.md`, `docs/code-map.md`, and the `rule` skill (which now reads the rule's issue and its comments, where the owner may answer). Historical log entries were left alone.
- The `wrap-up` skill gained an issues step, at the user's request: `Fixes #N` in the commit for finished work (the issue closes when the push reaches `main`, not before), `Refs #N` plus ticked checklist items for partial work, a comment and label removal for answered rule decisions, and follow-up issues only proposed, created after a yes.
- The migration footer on all 135 issue bodies said `todo.md` was still the source; it was updated to say the file is retired.

### 2026-10-13: Panel frame from the tooltip sprites; outline cards inside

- Panels and the top bar now use the original tooltip frame (`design/tiptop`, `tipbg`, `tipbottom`), each piece three-sliced sideways with `border-image`. A first try with stacked `background` layers showed stray vertical lines 247px in from each edge (a layer can't crop the far side's border column); `border-image` slices properly.
- The old flat quote-box look moved to "outline cards": the nameplate, the stat stacks, and a card filling the iTrackie under its tabs (the active tab overlaps the card's top rim by 1px so it opens into it with no line).
- Corrections: I read "use the blue from before" as the card fill and reverted the cards, when the user meant the pip-bar frame tint (back to #3d5fc4, which only clashed with the old slot-blue card). I then made the whole iTrackie a card, when the user wanted the glowing panel kept with a card inside. Both were quick to undo; asking which element was meant would have been cheaper.
- `npm run contact-sheet` now prints each image's natural size, since reading `Mush/www` is denied and WSL has no image tools.

### 2026-10-14: Isometric view fixed at 1x, no scrollbar
The user (not the assistant) decided to drop auto-fit scaling in the iso view: sprites draw one screen pixel per source pixel, and the panel never shows a scrollbar (rooms bigger than the panel still pan by touch or wheel). The assistant removed `fitScale` and the `fillPanel`/`minScale` props, hid the scrollbar in CSS, and added the no-scrollbar rule to `web/CLAUDE.md`. Worked: the change was mostly deletion. Not verified: no visual check was run; half-pixel centring from `margin: auto` is a possible leftover blur.

### 2026-10-14: Inspect panel buttons, no location/status, acting opens the room log

- The user asked for wider, larger action buttons (font +4px), removal of Location and Status from the inspect panel, and for any action to jump to the Room log. The assistant implemented all three; the user decided the behavior, including "always" (so moves and ready also jump, and on a phone the screen switches to iTrackie).
- The taller button height (30px) was the assistant's addition so the larger font fits. Acting is signalled to ITrackie with a counter prop rather than lifting tab state.
- Needed correction: a stray `biome-ignore` that had no effect (removed), and the i18n hardcoded-text ratchet failed because text was deleted, so the baseline was lowered with `UPDATE_I18N_BASELINE=1`.
- Visual check skipped (not requested).

### 2026-10-13: Iso room camera follows the player; click-to-walk (client-only)

- Clicking floor moves your sprite to that tile; clicking equipment selects it and steps you up to it (`standSpot`: middle of the wider footprint edge, camera-facing side first, with fallbacks). Purely cosmetic local state in `IsoRoom`; nothing is sent to the server.
- Manual panning removed (`overflow: hidden`); the camera scrolls to follow you, clamped at room edges. `web/CLAUDE.md` updated.
- Worked: checking the real ship data before trusting the "widest edge, centre" rule surfaced the ambiguous cases (free-standing consoles, square and 1x1 footprints, turret consoles with no adjacent floor). The `dir` field on equipment bindings looked like a facing hint but didn't map consistently to one edge, so it isn't used.
- Who decided: the user asked for click-to-walk, camera follow with no panning, and the "widest edge, centre" rule for equipment. The assistant chose the tie-breaks and fallbacks (camera-facing side first, left-middle on even edges, nearest floor when nothing touches the object) and reported them as open for the user to confirm. Refs #17 (sync to other players still to do).
