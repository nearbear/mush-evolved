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

### 2026-10-14: Cryopod lobby look (CSS only)

- **Decided by the user:** make the lobby glass pane feel curved and like the inside of a cryopod; the assistant proposed the options (bulging `border-radius` vs. a clipped concave edge) and the user chose the radius route and the extra effects (glass shading, rim frost).
- **Decided by the assistant, with approval:** the outline is one `--pod-shape` variable shared by bezel and glass (percentage radii, fuller at the bottom); glass sheen and bottom shadow; breath fog, droplets, and a pulsing stasis LED; frost from inline-SVG `feTurbulence` noise (procedural, no image files); a darker ceiling so white frost contrasts.
- **What worked:** the user asked for the screenshot only after saying they couldn't see the frost; looking at it ourselves immediately showed why (pale frost on a pale ceiling), and a second look caught a new oval smudge before it was reported.
- **What needed correction:** (1) The first frost used radial conic streaks, which read as jets of light at the top and bottom; the user flagged it and it was replaced with noise. (2) The first noise frost was grey and read as dirt. (3) Raising the haze made a visible oval edge in the middle; fixed by easing the mask and gradient stops. (4) The vent's 2px outer shadow shifted the tile gutters beside it; fixed by insetting the vent 2px and dropping the shadow.
- **Not verified:** a real phone, and the reduced-motion paths were not looked at. Pre-existing unrelated failure: the i18n hardcoded-text baseline for `IsoRoom.tsx` is stale.

## 2026-10-14: Lobby panel matches the game; fixed-size panel with a browser test

- Replaced the lobby's terminal-style readouts (monospace, scanlines, cyan glow) with one in-game `.panel` (the glowing tooltip frame) holding the title, ship list, and queue status. Ship rows became `button.big`, since `web/CLAUDE.md` forbids custom button looks; the first instinct was restyling the rows as outline cards, which that rule caught before any code was written.
- The panel sits above the glass frost so its frame stays clean. Both lobby states (pick a ship, waiting) are stacked in one grid cell with the inactive one `visibility: hidden` + `inert`, so the panel is sized to the larger and never resizes on join.
- First real-browser test in `npm test` (`tools/src/lobby/lobby.test.ts`): Vite in-process, Playwright Chromium, `routeWebSocket` faking the matchmaker. Verified it fails when the hidden state uses `display: none`.
- Needed correction: the first phone pass overflowed at 360px in Spanish/French; only a per-language check caught it. `npm install -D vite -w tools` also silently bumped Vite and two sub-deps in the lockfile; reverted to declare only the existing 8.3.1.

## 2026-10-14: Days and daily morale loss
- Decision (user): 8 cycles per day; living players lose 1 morale at day end, clamped at 0, from day 1; UI shows "Day N · Cycle M". Asked four questions up front; the cycles-per-day number was already in rules-design.md.
- Kept `state.cycle` as a global counter and derived day/cycle-of-day (`dayOf`), so no state shape change or STATE_VERSION bump, and per-cycle dispenser logic is untouched.

## 2026-10-14: Curved cryopod lid on the lobby (CSS strips)

- Asked for a pod window that looks like a sheet of paper with its middle pushed away (a half-cylinder seen from inside). The old CSS had drawn the opposite: glass bulging toward the viewer (top highlight, oval outline widest in the middle).
- Options weighed: shading and outline only; real 3D strips; an SVG displacement filter. The filter was rejected because the spinning fan would force the warp to be redone every frame, which is slow on phones. Chose 3D strips: the window is drawn 24 times, each copy clipped to one vertical strip and placed on a cylinder with its own `perspective()` (so no `preserve-3d`, and the sleep blur filter on an ancestor stays safe). The text panel stays flat on top.
- Needed correction: the first version flared badly on phones, because perspective scaled with the width while the phone window is tall. Basing it on the longer side (`container-type: size`, `max(100cqw, 100cqh)`) fixed it. The old oval outline also hid the curve, so it became a plain rounded rectangle.
- Follow-up: the metal wall around the window stayed flat, so it is now the same cylinder, extended past the window by 16 more strips per side. Seams and evenly spaced rivets show the bend: the seams bow, and the rivets crowd together toward the sides. Added a placeholder manufacturer sticker on the wall below the window; the window now always leaves room for it under it (the sticker was cut off at 1366x768 and on phones).
- Checked with throwaway Playwright screenshots at 1600x1000, 1366x768 and a 360px phone. Frame rate was not measured; all strips together are 80 composited layers.
- Correction after review: rivets looked uneven because every third one landed on a vertical seam (the seams were every 6 strips, the rivets every 2). Now the panels are a fixed 13rem, with four rivets evenly spaced inside each, none on a seam. The sticker was crossing seams; it now sits square inside one panel, its bottom just above a groove moved further below the window. On desktop the window leaves 12rem of screen height free so that groove stays on screen at 1366x768.

## 2026-10-14: bonding, DTT, and STT

- **Decision (user):** bond is permanent and one-way (each side pays 1 AP); DTT and STT need a mutual bond and the same room, one participant pays 1 AP, both gain 2 morale, the pair shares a once-per-day cooldown; a DTT with one Mush adds 1 contamination to the human (capacity 3, hidden from everyone). The user asked that the acronyms never be expanded in code or docs.
- **What worked:** the user's first message was too vague for the `rule` skill, so I wrote a user story with seven open questions; two rounds of answers pinned the rule down. Keeping contamination off `PlayerState` mattered, because `viewFor` copies `you` whole and the owner would have seen it.
- **Needed correction:** my first reading of "write a story" was fiction. The user meant a user story for the game rules.

## 2026-10-14: action costs in the view (issue #19)

Decided by the assistant under "just do it": `PlayerView.legalCosts: ActionCost[]`, index-aligned with `legalActions`, built in `viewFor` from `ActionDef.cost`. Chose a parallel array over wrapping each action so existing `legalActions` consumers, bots and tests stayed untouched; the tradeoff is that alignment is by convention (tested). No UI shows costs yet (that is the stacked-actions issue).

### 2026-10-14: showing action costs on buttons

Follow-up to the entry above. The assistant first stopped at the view (`legalCosts`) and the user, clicking Bond, found no cost shown; the UI was the intended outcome of "do number 19", so I should have rendered it in the same pass. The user then specified the look over three rounds: cost in bold, `pa_slot1.png` icon, then label; drop the "AP" text; hide cost and icon when AP is zero; drop MP display ("there will never be MP cost actions"). An `alt="AP"` on the icon tripped the hardcoded-text i18n ratchet, so the icon is decorative (`alt=""`). The first test for the move cost also assumed a positive total; the real cost at 0 MP is `{ap: 1, mp: -2}`.

## 2026-10-14: Replays planned before the code could block them

Asked whether anything being built would get in the way of a replay feature (due by the end of private beta). The audit found the pure rules, seeded RNG, time as an input, and `viewFor` already support it. The blockers: `GameRoom` overwrites one snapshot so history is lost, state changes enter through five separate functions instead of one input reducer, and games don't record which rules version they ran on. Decided: replays show everything (including private channels), only after the game ends, publicly listed by date; moderators also see raw chat and a count of rate-limited messages, not the messages themselves. What worked: auditing the code against a future feature before building more rules on top of it. Caught by the AI and confirmed by the user: if replays show everything, private channels become public once the game ends.

### 2026-10-14: server tests without the Workers test pool

The user asked for server tests after a quality review flagged the server as untested. The assistant chose to mock `partyserver` (`FakeServer`, fake storage and sockets) under plain Vitest instead of adding `@cloudflare/vitest-pool-workers`, since CLAUDE.md says to ask before adding dependencies. The trade-off is that real Durable Object storage and hibernation behaviour is not exercised. The assistant also added `vitest` (already in the lockfile at the same version) to `server/package.json`, and said so. 33 tests cover seat tokens, per-seat views, the leak shape of what is sent, input authentication, rate limits, moderation storage, persistence and the matchmaker. What worked: reading `GameRoom.ts` fully before writing, so the tests target its real risks. What needed correction: the first chat test assumed links are blocked, but moderation rewrites them and keeps the raw text in the input record; the test was rewritten to match. One import (`createRng`) was invented and caught by typecheck.

### 2026-10-14: Inspect panel reset and phone peek bar
- User's complaint: the Inspect panel's X button was awkward. Decided by the user: clicking outside the panel resets it to yourself, and the X goes away.
- First attempt (assistant): a desktop-only `pointerdown` listener, since on phones the peek bar's "More" sits outside the panel and the reset would have cleared the selection as Inspect opened. The user hadn't considered phones; they then chose a permanent peek bar (shows yourself by default) over a tap-outside rule.
- The assistant kept an X on the peek bar for non-self targets and doors, reasoning there was no tap-outside on phones. The user replaced it with "tap empty floor resets the selection" (also yourself-tap), so the X is gone everywhere.
- Not visually checked (no screenshot run). The i18n hardcoded-text ratchet dropped as the two "Close" labels were removed; baseline lowered.

### 2026-10-14: Shift-click to take/drop items
The user asked for shift-clicking an inventory tile to move it between room and inventory. The assistant implemented it in `InventoryPanel.tsx` (decided by the assistant, a small UI shortcut, no rule change): it reuses the server's legal-action check, falls back to plain select otherwise, and suppresses text selection on shift-mousedown. Touch is unchanged. No corrections needed; visual check skipped.

## 2026-10-14: settings dialog (#5)

- Asked whether a dialog was the right container; recommended a Base UI `Dialog` over a popover because settings will grow and it works the same on the phone layout. The user chose it and wanted the gear in-game only.
- Reused the existing `LanguageSwitcher` (native select) with an `inline` prop instead of building a new control.
- Needed correction: first used an emoji gear; the user asked for `icons/ui/pam.png`. The existing `.tab-icon` class scales art to 18px, so the icon got its own 1x class.
- Not visually checked at 360px or in fr/es; fr/es strings are drafts for a native speaker.

### 2026-10-14: Faded neighbouring rooms in the iso view

- **Request:** show the rooms behind the doors in the isometric view, faded, with player characters in them only while ACTOPI is on.
- **Decided by the user:** the camera still stops at the current room's edges (neighbours fill the space around a room smaller than the panel, mostly on desktop); tapping a faded room acts like tapping its door.
- **Approach:** renderer-only. The view already gives everyone's room while ACTOPI is on and drops it while off, so drawing "people the view places in that room" gets the ACTOPI rule for free, and no hidden information is added. Rooms are separate drawings in the original data, so each neighbour is placed by putting its door back on the same cell as the current room's door (a test checks no neighbour floor lands on the current room's floor; only Corridor C's neighbours overlap each other a little).
- **Needed correction:** native scrolling no longer works once neighbours draw outside the room, because they widen the scroll range and break the stop-at-the-edges camera. The camera now moves an inner layer with a transform (`cameraOffset`), with the same jump-on-enter, glide-on-walk behaviour.

## 2026-10-14: development cheats (issue #148)

Checked the issue first and asked three things it left open: the dev gate (env var, any match), visibility when off (section hidden), and what "infinite" means (hold the stat at max after anything that spends or loses it, so costs and the legal checks see a full bar). Cheats are a `cheat` input, so they are recorded and replay; the flags live on `PlayerState.cheats`, which only reaches your own view. The server's `ALLOW_CHEATS` flag travels beside the view (`cheatsAllowed`) rather than inside it, to keep `viewFor` pure. Worked: the i18n ratchet caught an English error sentence and a duplicate "Unknown player" before commit, so both became error codes. Local flag lives in the gitignored `server/.dev.vars`.

### 2026-10-14: Iso depth sorting across wide furniture and neighbouring rooms

- Two layering bugs had one root cause: paint order came from the anchor cell's `x + y` alone, as in the original Flash client. A chair or a person at the front edge of the 4-cell-wide astro terminal tied with its anchor, so they drew behind it. Neighbouring rooms were separate layers behind the whole current room, which can't work when the front corridor wraps around hydroponics (in front of the garden on one side, behind it on the other).
- Fix (`placeScene` in `placement.ts`): every room in the view goes into one scene on a shared grid, ordered by a topological sort over sprites whose pictures overlap. Footprints decide between entities, and walls can cover entities across rooms but not within one (same as the original within a room). Flat decals stay under people, and people in your room are never covered by a neighbour. Worst case 3.2 ms per recompute (motor room, 7 rooms).
- Tradeoff: neighbours are now dimmed with `brightness()` per sprite instead of layer `opacity`, because per-sprite opacity would show what each sprite covers. Not yet checked visually in the browser at the time of writing.

### 2026-10-14: Stretched corridors, no doormats

- Removed the doormats beside each door (`HIDDEN_SLICES` in `placement.ts`). They were clutter once the neighbouring rooms were drawn.
- The user reported that Bay Beta sat "too close to the center" and pushed Bedroom Beta onto the Nexus. Checking every room's view showed this was the ship's only floor-on-floor overlap. The cause was Corridor C's doors being too close together for the rooms behind them, not the bay itself. The fix lengthens the corridor (2 rows, then 1), which moves Bedroom Beta out 2 rows and Bay Beta out 3. The bay-bedroom door, which had been off by one, now lines up exactly. The user agreed that Storage back and Icarus bay move too.
- Corridors widened from 2 to 4 floor cells, using the same mechanism: `tools/src/shipLayout/stretch.ts` copies a plain floor/wall line at build time (the user chose build time over doing it in the client), so `ship-layout.json` holds the stretched rooms and the staleness test covers it. It refuses to split anything standing on the floor. Doors straddling the line (the 2-wide top doors) are allowed because they sit on wall cells. Rooms behind the doors follow automatically, since they're placed door to door. The room graph (`ship-rooms.json`) doesn't change.

### 2026-10-14: player panel "extras" card and one-row layout

The user asked for an outlined card at the far right of the player panel, a home for resources that belong nowhere else (spores, free IT points), with the room and player inventories in a flex row. Decided by the user; implemented by the assistant.

- Needed correction three times. First I outlined the card in the panel-rim color, which is nearly the background, so the user could not see it; they also meant the same card style as the resource bars, not a bare outline. A broad `sed` for the border color also changed four unrelated borders, which I caught and reverted. I also gave the card a fixed 10rem width when it only needs to fit an icon and a number.
- The first spec was ambiguous (evenly wide cards, but room inventory twice the player inventory); the user clarified that inventory is one auto-sized row and the room zone fills the rest.
- Placeholder spore row (icon + 99) is marked `TODO(extras)` until real resources exist. No visual check was run.

### 2026-10-14: walls cover people (with an outline), lockers stop showing through walls

- **Asked:** lockers showed through walls, doormats were still on doors, and people were always drawn over walls; walls should hide them, with a glowing outline so nobody can hide behind one.
- **Found:** the lockers were a sorting loop, not a missing rule. Floors and walls were ordered among themselves by depth, while furniture was ordered against walls by footprint, and the two disagreed (wall → floor diagonal to it → furniture on that floor → wall). The loop-breaker then freed the earliest stuck sprite, which was often just queued behind a loop, so its own correct constraints were dropped. A throwaway script that listed "furniture drawn over a wall it is wholly behind" for all 27 views made this measurable: 33 cases, then 3 (all where two neighbouring rooms overlap each other, a known limit of the local layout).
- **Fixes:** footprints diagonally apart get no constraint at all (they can't cover each other on screen); footprints are cut to their room's floor (several reach into the wall rows); walls use footprint order against anything standing, in any room; the loop-breaker walks back to a real cycle. The "doormats" left were the front-edge doors (`DOOR_BL`/`DOOR_BR`), floor-level thresholds the original drew because it drew no front walls; they are now left out when the room behind them is drawn.
- **Outline:** an SVG filter (dilate, subtract, flood) on a copy of each person in a layer above the scene, shown only when a wall or something in another room is drawn over them. Furniture in their own room doesn't count, or half of every room would glow.
- **Tradeoff to revisit:** with neighbours drawn, the next room's back wall stands on every room's front edge, so in rooms with neighbours in front, most standing cells are partly behind a wall (30 of 34 in hydroponics). The original avoided this by drawing no front walls.

## 2026-10-14: spore extraction (#26)
- Owner decided: Mush only; per-Mush 4-cycle cooldown on the global cycle counter (ready at selection); per-Mush spore counts; faction-wide daily cap of 4 (modifier-adjustable later, not day-linked cooldown); at the cap the action is not offered; no per-Mush carry limit; `dirty` deferred until statuses exist.
- Worked: asking the four leftover questions (first cooldown, dirty, cap behavior, carry limit) in one call after reading the issue and rules-design.
- Needed correction: first test used a parsed object where `parseGameMessage` takes a raw JSON string. Pre-existing i18n test failures (stale baseline, `log`/`logs` key mismatch in fr/es) are unrelated; the new private log line adds one more English sentence to the baseline count.
- i18n follow-up (same day): renamed `log` to `logs` in fr.json/es.json to match en.json (the catalog tests had been failing since en was renamed). The hardcoded-English baseline for `shared` was already stale before this change (actions.ts 10 -> 12, items.ts 5 -> 8) and the new spore log line adds one; clearing it needs structured log events (a key plus params in `LogEntry`), which I did not invent on my own because the `logs.*` keys in en.json look like another contributor's design. Baseline left untouched on purpose.

## 2026-10-14: worktrees

Asked how to use git worktrees; the earlier attempt failed because a worktree's dev server collided with the main checkout's fixed ports (:8787/:5173), so the client talked to the wrong server. Fix: `tools/src/dev/ports.ts` derives per-worktree ports from the path (main checkout unchanged), used by `npm run dev` and `npm run screenshot`. Relaxed the "never branch" rule for short-lived worktree branches that Claude creates and merges into `main`. The user rejected the detached-HEAD + cherry-pick option as too much effort, so Claude owns the git steps.

## 2026-10-14: first status effects and satiety

- Decided by the owner: dirty (public, cheese icon), full belly (private, apple icon), hungry (private), satiety for humans only. Four questions went through AskUserQuestion first: dirty has no removal for now, coffee +1 and a placeholder ration +4, hunger count starts at cycle 1 and HP stops at 0, Mush have no satiety.
- Design choice: only `dirty` is stored; full belly and hungry are derived from satiety plus a `satietyZeroSince` cycle, so they cannot drift out of step. Statuses of others are sent only for people in the same room.
- Needed noticing: the i18n wire baseline and the lobby test were already failing before this change (not fixed here). Icons were checked on a contact sheet because the file names (`belly_full`, `stinky`) didn't say which was cheese or apple.

## 2026-10-14: shower and soap

Owner asked for a `shower` action (2 AP, 1 less with soap carried, removes dirty, 4 damage to a Mush) and a soap item that spawns in the Alpha dorm. I asked about edge cases (shower when clean, soap consumed or reusable, log visibility); the owner confirmed only-when-dirty, reusable soap, every shower works, and a private log (soap pickup/drop in public history is the only tell). One of my options was worded confusingly and the owner had me clarify before answering. Implemented via the action registry, new config values, and a `soap` item whose id matches its existing icon file, so no new art was needed.

### 2026-10-14: log entries became message ids (i18n)
- `LogEntry` now carries `key` + `params` instead of `text`; item, equipment and room names go over the wire as ids and the client names them (`web/src/i18n/names.ts`, catalogs `rooms`/`equipment`/`items`/`logEvent`). `name` was removed from `ItemView`/`EquipmentView`. This cleared the i18n ratchet failure for actions/items/equipment.
- French room and equipment names come from `Mush/data` (`Data.ods` rooms, `DataExt.ods` objects); the rest of fr and all of es are drafts. Phrasing uses "verb: Name" because the catalogs carry no grammatical gender.
- Worked: the ratchet test caught the regression immediately. Needed correction: the wire detector flagged the new message ids as English, so `logPublic`/`logPrivate` arguments only count as text when they contain a space or start with a capital.
- eMush (cmnemoi/eMush) translations are AGPL-3.0 (code) with assets CC BY-NC-SA 4.0; not copied.

## 2026-10-15: healing with the medikit

Owner decided: `heal` needs a medikit in your inventory (reusable), targets you or a living person in your room, costs 2 AP on others and 3 on yourself, restores 3 HP (modifier hook `healAmount` for skills and research), caps at max HP, always offered, public log. Implemented as `heal` in the action registry with tests in `heal.test.ts`. What needed correction: I asked "there is no med kit item yet" without grepping first, but a placeholder `medikit` already spawns in SICK_BAY, so the owner's "spawns in Laboratory" answer rested on a wrong premise. Kept SICK_BAY and flagged it. Lesson: grep for the thing before asking questions about it.

Correction to the entry above (2026-10-15): the owner said the existing SICK_BAY medikit is the very one they wanted the heal action on, so the "Laboratory" answer was only an artifact of my wrong question and nothing moved. Process slip, also mine: while fixing the first entry I read and rewrote `ai-workflow.md` with a script, against the append-only rule; the diff showed only my own lines changed, and I restored the original wording and appended this note instead.

## 2026-10-15: First skill, Creative

- **Decision (owner):** 3 human skill slots per player (a book slot later), skills pickable at any time via a future UI; for now everyone spawns with Creative and two empty slots. Creative: 50% chance to refund 1 AP when an AP-costing action fails, private log line. Skills stay out of other players' views until the skills UI.
- **What worked:** reading `Mush/derived/data/Data/skills.json` first surfaced two Creative rows (retained 50% vs an older 25%) and showed the effect only exists in the footnote, so the questions to the owner were concrete. Spotting that `ActionDef.chance` was declared but never called led to moving the success roll into `applyAction` first, so every future action with odds gets failure skills for free.
- **Needed correction:** the worktree tool branched from `origin/main`, one commit behind local `main`, so it had to be fast-forwarded. A first "skills are in no view" test failed because `you` is your whole `PlayerState`; your own skills reaching your own view is fine, and the test now checks that nobody else sees them.

### 2026-10-15: Extra resource counters in the extras card

- Added the nine extra point types from `PAColors.json` (`eng`, `exp`, `comp`, `garden`, `core`, `shoot`, `cook`, `heal`, `pilgred`) as `PlayerState.resources` (own view only, all zero), shown beside the real spore count in `SelfPanel`. Names and descriptions in en/fr/es.
- Needed correction: my first version used native `title` tooltips, which are hover-only and unreadable on phones. The user flagged it. Base UI's `Tooltip` is hover/focus only too; `Popover.Trigger openOnHover` (already used by `FactionCard`) covers mouse and touch, so no new library. Now `ResourceChip`.
- Data oddities: the source calls `ENG` "Points de Mécanique" but its description says Ingénierie (used Ingénierie); `EXP` has no description, so I wrote one (a guess).

## 2026-10-15: punch action (issue 29)

Owner decided: same-room targets only, 40% miss chance, public action. Cost 1 AP and 2 damage came from the issue and rules-design. I did not ask about death at 0 HP, per-cycle limits or cameras; I followed the existing "HP stops at 0" convention and left no limit, and flagged both. Worked: the `chance`/`fail` hooks from the dismantle work made the miss roll a few lines. Needed correction: my first miss test failed because the Creative start skill refunds AP on failed actions; the test now sets `startSkills: []`.

### 2026-10-15: medic skill, care points, sick bay healing
- Owner decided via questions: care points add 2 per day and stack, any heal auto-spends one and becomes free, anyone can heal in the sick bay without a medikit (normal AP cost), and nobody gets the medic skill by default.
- Worked: the unused `resources.heal` counter was already in state and the owner's view, so care points needed no state change. Skill = modifier with a new `carePointsPerDay` hook.
- Needed correction: the old heal tests used SICK_BAY as the generic room, which now allows medikit-free healing; moved them to LABORATORY. First AskUserQuestion had 5 questions (limit 4), so one was folded into a stated assumption.

### 2026-10-15: skills UI and the pick_skill action
- **Decided by the user:** all skills pickable for now (per-character sets later), picks free and permanent, Creative no longer a default, skills public to the room and shown only on the Inspect portrait (not the self panel), gold plus from the icon catalog for empty slots on your own portrait only, mobile layout the same as desktop.
- **What I did:** asked seven questions with defaults first; the user's answers settled all of them. `pick_skill` is an ordinary action, so the client lists choices from `legalActions`. I picked the 58 human, retained, non-beta skills from `skills.json` (all have icons). The en and es skill names are my drafts; fr comes from the original table.
- **Needed correction:** two existing tests assumed the old rules (Creative at start, skills hidden from roommates); I updated them instead of leaving them failing. Not verified in a browser yet.

## 2026-10-15: spiking action
- Decision (owner): `spike` is Mush-only, 1 AP + 1 spore, targets a living human in the room, always succeeds, contamination +1 (cap 3), no conversion yet. Bystanders see the log line, the victim does not.
- Worked: the `rule` skill's question step surfaced target, cost, failure, and conversion scope in one round.
- Needed correction: I first described the log as `logSecret` with "victim not told", but `logSecret` counts the victim as a witness, so my own test failed. Asked the owner, then added a `hideFrom` parameter to `logSecret`.

### 2026-10-15: skill tooltips
- **Decided by the user:** use the same hover card as the extras-card resources (Base UI Popover with `openOnHover`), with the original descriptions from the derived data, translated to English where none existed.
- **What I did:** each filled skill slot opens a card with the name, the flavor text (`desc`) and the effect lines (`footnotes`) from `Mush/derived/data/Data/skills.json`. That data is French only, so fr is the original text with its `:pa:`-style icon codes and `*` markup turned into plain text (PA, PM, PMo, PV). The en and es translations are mine (best effort). The tapped-name caption from the first version is gone, since the popover also opens on tap.
- **Caveat:** these are the original game's descriptions, not our rules. `medic` here still says "+2 HP on Heal", while our implementation gives care points, and most skills have no effect yet.

## 2026-10-15: nurse skill and the `onPick` hook
Owner asked for the nurse to gain 2 care points each day and when taking the skill, and left "inheritance or not" to me. Chose a `careSkill(configKey)` factory plus a generic `onPick` modifier hook over a base class: hooks already fold over a registry, so skills compose without a hierarchy, and future skills (shooter's free shots) reuse `onPick`. Side effect: `medic` also gets its points on pick. Nurse maps to the `first_aid` id (English label "Nurse"); the skill text says +1 AP, but the owner's 2 points was followed.

Correction, same day: the owner said medic was a mistake on their part; medic's perk is +2 HP per heal, not care points. Removed `medicCarePointsPerDay`, added `medicHealBonus` via the existing `healAmount` hook (which now also receives state). Nurse keeps the care points.

## 2026-10-15: Infection (conversion at capacity)

- Decided by the owner: a human converts to Mush at once when contamination reaches capacity; a private log line tells only them, without naming who caused it; skills stay (Mush can still pick human skills); spore extraction is ready immediately; no HP or morale effect; no cure for the MVP.
- Claude wrote a plan first, listing the open questions (timing, what the convert is told, what carries over, cure) and flagging the tradeoff: immediate conversion lets a spike victim guess the Mush in the room. The owner chose immediate.
- What worked: one `contaminate` helper in `shared/src/infection.ts` replaced two copies of the cap logic (spike, DTT), and a test checks a bystander's whole view is identical before and after a conversion apart from the spike line.
- Needed care: the full test run hit an unrelated i18n failure from uncommitted iTrackie work in the same tree; Claude briefly stashed the tree to compare against main, which it should not have done with someone else's in-progress edits there (they were restored).

## 2026-10-16: Contamination status for Mush (debug aid)

- Owner reported conversion "didn't seem to work" in the running game and asked for a status that shows Mush a human's contamination level, invisible to the human themself. Rules tests already showed conversion working, so the status is the tool to find what differs in play (likely: a human held at 3 under the old capped code needs one more spike, and the 4-cycle extraction cooldown makes three spikes slow).
- Built as `OtherPlayerView.contamination` (Mush viewer, living contaminated human, same room only; the room limit was Claude's default to match other statuses) and drawn by `StatusIcons` with the original spore icon and a count. Two older tests asserted contamination was in no view at all; they were narrowed to human viewers.

## 2026-10-16: Iso view walls between rooms

- Asked to keep walls of "the current room" lit like doors back to it. Claude first misread it (keyed on cells, then a bounding box that lit a far wall in an L-shaped corridor); what worked was asking for a concrete example (the walls beside the refectory door) and checking the layout data for it: those walls belong to the neighbour, so a neighbour's wall next to your floor now stays lit.
- Missing walls turned out to be the original's open front edges. Synthesizing walls on every open neighbour edge covered whole rooms; only filling cells with floor on both sides, plus floor under doors and across one-cell strips, held up.
- Claude couldn't see the problems from tests, so it added `npm run ship-view` (whole ship, `--walk` into a room, `--clip` to zoom) and compared before/after shots. That made the iteration much faster than describing screenshots.
- The user's diagnosis, that corridors need an odd width so end doors get two walls each side, was the real fix. Widening all corridors to five collided at the shuttle bays (their doors are 4 cells apart), so only the front corridor is five wide.

## 2026-10-16: cook action
- Owner asked for a 1 AP cook action turning uncooked rations in the refectory into cooked ones, and for the refectory to spawn uncooked rations. The rule skill had me ask four questions in one call (reach, result, log visibility, equipment); owner took all recommended defaults: carried or floor, replaced in place, public log, room only.
- Implemented as `actions/cook.ts` driven by `ItemType.cook` and `config.cookRooms`/`cookAp`, so more recipes or rooms need no new code. No corrections needed.

### 2026-10-16: markdown chat messages with author-only checkboxes

Asked for GitHub-flavoured markdown, multi-line messages, and checkboxes only the author can toggle. Checked with the user first: react-markdown + remark-gfm (new web deps), text formatting only (no links, images, tables), toggling edits the stored message text so replays and late joiners agree. Moderation used to collapse all whitespace, so multi-line needed a change there (newlines kept, 12-line cap). Toggling is addressed by source line, not checkbox index, so the client and rules can't disagree about which box was meant; the rules re-check that the line really is a task item outside a code fence. Worked: a render test caught that react-markdown's `input` node has no source position (every checkbox was disabled); the line now comes from the parent `li`. Needed correcting: new English error strings tripped the i18n ratchet, so they became codes.

Follow-up, same day: the maximize button on the chat composer became a markdown preview toggle (rendered preview on the top half of the thread area, text box on the bottom, tab title and feature drop-down stay visible). The user asked for it; the assistant built it. A slicing mistake in the CSS edit left a stray `.chat-grip { display: none }` that would have hidden the resize grip everywhere; found on re-reading the file, not by a test. Visual check was not run.

### 2026-10-16: Mush channel (server side)

Asked three rule questions before coding (iTrackie needed? message content? conversion message?). Decided: the `mush` channel needs no iTrackie, only a living Mush reads or posts; each contamination increase posts a system message with the human's name and new level (never the Mush responsible); reaching capacity posts a conversion message. System messages are `ChatMessage`s with `from: null` and a `system: {key, params}` the client translates like a log entry. `pushChat` (`shared/src/chat.ts`) is shared by players and the game. A convert gets the full channel history on conversion, like picking up an iTrackie. The client has no Mush tab yet.

### 2026-10-16: Mush channel tab (client)

The user asked for an "eye-tracky" tab on the far right that appears conditionally. I read that as eye-catching (not confirmed): a faction-pink tab shown only when the server lists the `mush` channel, pulsing while the newest Mush message is unread, steady glow under reduced motion. Not checked visually or on a phone. Log keys live under `logEvent`, not `log`; I first guessed wrong and the typecheck did not catch it (the lookup falls back to the key), so I fixed it by reading `useNames().logLine`.

### 2026-10-16: Iso view walls and doors, follow-up

- Correction to the entry above: the front corridor ended up four wide, not five. Doors are two cells wide, so only even widths are symmetric; the user spotted that the doors looked like "one and a half tiles", and asked to go back to four once that was clear. Who decided: the user, at each step.
- Doors: Claude first lowered them 11 px and drew a wall behind them (measured against the wall art), which the user rejected: the door's own ridge is the ceiling. What held: no wall on a door's second cell, no doormats, floor under both door cells, one tile for both (a path pattern wins over plain floor), owned by the room whose back wall holds the door. Claude got that ownership backwards first; the user caught it.
- What worked: pixel measurements with the generator's PNG decoder, `ship-view --scale` for magnified crops, and before/after shots. What didn't: guessing from the user's screen-space descriptions without mapping them to cells. Lessons are in `web/src/iso/CLAUDE.md`.
- Still open: lit walls don't join at corners.

## 2026-10-16: Item attributes and Heavy

- Asked for a user story; the owner then said to just implement it and answered the open questions (penalty does not stack, freezer is the heavy test item and spawns in the refectory, Solid also gives +1 punch damage, room-to-room moves only, Solid is the `sturdy` skill).
- Worked: the existing `movementRules` fold was the single place to add the penalty, so `moveCost` and `legalCosts` needed no changes. A new `ignoresHeavy` modifier flag and a `punchDamage` hook followed the existing hook pattern.
- Needed correction: I assumed the skill id was `solid`; it is `sturdy` (found via the "Robuste" row in `skills.json`). Adding the freezer broke the cook test that listed every refectory spawn.

## 2026-10-16: Death, phase 1 (#28)

- Claude first planned to check for death at every place HP could reach 0 (punch, hunger, shower). The user pushed back: a common damage function is better. It became `damage()` in `shared/src/death.ts`, the only way HP goes down, with a source-scanning test in `tools` (shared tests can't read files) so a new damage source can't skip the death check.
- The user added that corpses are heavy (an existing item attribute) while phase 1 was starting.
- Found while implementing: the dev `infiniteHp` cheat used to refill HP after it hit 0, so `damage` now honours it directly and `applyCheats` skips the dead.

## 2026-10-16: modifiers.ts fold refactor
- Review feedback: nine near-identical fold functions, `ignoresHeavy` special-cased inline, one flat registry. Replaced the loops with one generic `fold(hook, base, state, player, registry)`; every numeric hook now takes `(value, player, state)` and the public accessors (`apGain`, `healAmount`, ...) are one-liners. The heavy penalty became a `heavyMpPenalty` fold (sturdy returns 0) so no modifier logic lives outside the registry. Each modifier moved to its own file under `shared/src/modifiers/`. No behavior change; the existing tests passed untouched.

### 2026-10-16: rules.ts split, legalActions computed once
A review noted `rules.ts` mixed the game loop, `viewFor`, and all chat/channel logic (~40%). Moved `chatChannels`, `sendChat`, `toggleCheckbox`, `createChannel`, `inviteToChannel`, `leaveChannel` and the chat constants into `chat.ts`; shared `clone`/`findPlayer`/`fail`/`ActionResult` went to a new `helpers.ts` (chat.ts can't import rules.ts without a cycle). Refreshed the stale SKELETON header. `viewFor` now computes `chatChannels` once, and `scheduleBots` calls `legalActions` directly instead of building three full views per bot per tick. The i18n baseline moved 4 hardcoded error strings from rules.ts to chat.ts (no new debt).

- 2026-10-16: QC pass on `docs/code-map.md`. Checking every backticked name and path against the code (a throwaway grep loop) found a stale bots banner contradicting CLAUDE.md, a nonexistent `actionLabel` in `targets.ts`, a nonexistent `roomName` in `log.ts`, `toast.css` missing from the styles list, the minimap described as rendered when it is stubbed out, and about 20 unmapped files (mostly in `web`). The map was restructured to one line per file; the "Implemented rules" section moved to `docs/implemented-rules.md` (confirmation dates dropped, since `config.ts` and `rules-design.md` hold them; bullets added for ready, move, and dismantle), and the iso view's behavior moved to `web/src/iso/CLAUDE.md`. The `rule` and `wrap-up` skills, CLAUDE.md, and the README now point at the new file. What worked: a mechanical existence check caught errors a read-through missed (`roomName` passed a first grep only because the name still exists in `web`). Possible follow-up: make that check a test.

## 2026-10-16: Death, phase 2: the dead player's view (#45)

- Kept `chatChannels` meaning "may post" (bots and the chat box already relied on it) and added `readChannels` for reading, instead of changing what the existing field means.
- Found while implementing: `viewFor` sent every player's room, dead or alive, so with ACTOPI on anyone could see where a body lay, and the minimap would draw the dead standing there. A dead player now has no room in anyone's view and isn't counted in the ACTOPI-off head counts; the corpse item is what marks the spot.
- Judgment call, flagged to the user: "no room log" for the dead also drops their own past private lines, since every log line is tied to a room.

## 2026-10-16: Death, phase 3: jettison (#28)

- `jettison` followed the existing action pattern (cook's config shape: `cost` plus `rooms`), so it was mostly wiring: config, the `Action` union, the wire parser, the client's target/label tables, and en/fr/es strings.
- Adding a config section changes stored state, so `STATE_VERSION` had to be bumped even though no `GameState` field changed: saved games carry their config.

## 2026-10-16: Death, phase 5: client (#28, #45)

- Phase 4 (leaving the ship after death) was split out into its own story, #182, at the user's request.
- The lying-pose art had already been found on the cast sheet (`www/img/art/char.png`) in a separate commit for the corpse item icon, so the floor rendering reused it (`lyingFrame`) instead of rotating a standing sprite. Reading `Mush/clients` directly is denied by project settings; looking in `web/src/art/assets.ts` first found the answer faster.
- Corpses join the iso scene as actors (same paint order and wall handling as people), but skip the see-through outline layer: that exists so people can't hide behind walls, and a corpse is an item.
- The dead player's screen is a UI choice, not a rule: a notice where the room was, global chat as the default tab, and no Room or Private tabs. No visual check was run (the `play` skill runs only when asked).

## 2026-10-16: Antique Perfume skill
Owner asked for the skill; the original text ("2 cycles of immunity after each shower") left four gaps (blocked behaviour, stacking, visibility, sources), settled with one question call. Built as a modifier with a new `onShower` hook and a derived `immuneUntil` cycle (no per-cycle tick). Worked: shower and infection already existed. Needed correction: my first test read `view.you.statuses`; own statuses are `view.statuses`.

## 2026-10-16: Logistics skill
- Owner's request was one line ("1 AP at random to a player in the room"). The original data says it fires every cycle, so I asked about trigger, cap handling, and visibility instead of guessing; owner chose automatic per cycle, skip capped players, free, private lines.
- Added a generic `onCycle` modifier hook (`cycleChanged`) rather than special-casing the skill in `advanceCycle`. No corrections needed.

## 2026-10-16: blueprints (sofa only)
- Asked first what the original Mush folder says about blueprints (item `BLUEPRINT`, `BUILD` action, `blueprints.ods` recipes); the Haxe source has no build logic, only data and item helpers, so the rules had to come from the owner.
- Owner decided: always consumed, no failure chance, anywhere by anyone, ingredients from inventory or room floor, 3 AP, sofa as room equipment, thick tube as a new item.
- Snag: sofas are fixed map equipment, so a built one has no sprite in the iso view; left as a known gap rather than inventing placement. Added a thick tube to the corridor so the blueprint is buildable.

### 2026-10-16: terminal access windows
- Asked Claude what Mush/ says about terminals; it read objects.json, actions.json and the tutorial text and found a terminal is just equipment with the `MODULE_ACCESS` status, entered through a generic `ACCESS` action. It could not read `Mush/clients` (deny rule), so how the original evaluates `IsAccessing`/`HeroModuling` is unconfirmed.
- Owner asked for a blank pop-up per terminal and an access action. Claude chose free, unrestricted, stateless access (the client opens the window) instead of asking, and flagged it as a default. Needed correction: the pinned legal-actions test in actions.test.ts had to learn about the lab terminal.
- 2026-10-16: added the rocket launcher blueprint (original `MISSILE_LAUNCHER`, icon `missile_launcher.jpg`). The recipe data had two conflicting versions, so the owner picked one. This forced recipes to produce either equipment or an item (`makes`).

### 2026-10-16: Iso camera always centred on the player

- **Decided by the user:** the camera no longer stops at the current room's edges; it always keeps your character centred. In a large room the edge clamp pushed a corner door into the panel's corner, which made moving between rooms awkward. This reverses the earlier "stops at the room's edges" decision.
- The neighbouring rooms already draw around the current one, so the space past a room's edge is filled. `cameraOffset` and its tests were removed; the offset is now just `panel / 2 - you`.

### 2026-10-16: research foundation
- Owner asked Claude what it could see of research; it found the original table (`research.json`, French only) and 24 card images, but no rules in our code beyond the lab terminal. Owner then decided the numbers: 2 AP = +25%, no repeat penalty, anyone not dirty, every researched-with-an-icon entry, best-effort translation, public list.
- Claude filled the unspecified gaps with defaults and flagged them (done at the lab terminal, finished researches locked, many in progress at once, no completion effect). The original's difficulty, samples and prerequisites were deliberately ignored.
- Claude could not view the card PNGs (read deny rule on `Mush/`), so their size and transparency are unchecked; they render with a max width. fr/es names are drafts (French from the original names).
- Needed correction: the pinned legal-actions test had to learn about 24 new actions; state shape changed, so `STATE_VERSION` went to 29.

### 2026-10-16: unaffordable actions shown disabled

`viewFor` now sends `unaffordable`: candidates whose only failing check is `cant_afford`, with cost and which of AP/MP fall short. The client shows them as `aria-disabled` buttons (not `disabled`, so hover, focus and tap still work) with a popover giving the reason. This relies on every action's `check` returning `cant_afford` last; the first draft crashed because `move`'s cost is undefined when unaffordable, so moves are excluded. Candidates are the same ones that feed `legalActions`, so no new information is exposed.

## 2026-10-16: caffeinomaniac skill
- Owner decided (after one batched question round): +2 AP on consuming a coffee, capped at maxAp, coffee only, NERON project bonus skipped. Defaults came from the original skill text in `Mush/derived/data/Data/skills.json`.
- Added an `onConsume` modifier hook (run by `consumed` from the consume action) rather than special-casing the skill in `consume.ts`. No corrections needed.
- Correction: I added `config.caffeinomaniac` without bumping `STATE_VERSION`, so a room saved before the change crashed on consume (`config.caffeinomaniac` undefined). Config lives in persisted state, so any new config key needs the bump (now 30).

### 2026-10-16: Coffee item icon

The `coffee` item had no icon (no `coffee.jpg` in `www/img/icons/items/`). A contact sheet showed `ration_7.jpg` is a steaming coffee cup, so `ICON_FILE` maps `coffee` to it. Skipped `coffee_thermos.jpg` (a separate item, the thermos) and `ui/coffee.png` (a 16x16 inline UI glyph, not an inventory tile). Noted in `docs/mush-assets.md` that the `ration_N` files are distinct foods.

## 2026-10-16: Computer Scientist skill

"Add the computer scientist skill" turned out to mean the in-game `computer` skill, not a Claude skill; I grepped the repo to find that out before asking. The owner decided: a separate Computer point pool (cap 4, +2 per day and 2 on pick, carries over, private), spent as 2 points instead of 2 AP on research; no hacking, no NERON bonus. Built as a `computerPointsPerDay` fold plus `onPick`, reusing the existing `resources.comp` counter. Needed no correction.
Correction (owner, same day): I had read the points as a currency worth 2 AP. A resource point instead makes one instance of an action free (like care points for a heal), so one Computer point makes one research cost 0 AP.

## 2026-10-17: Mush-eating bacteria research
- Owner decided: completing it raises the contamination needed to infect a human from 3 to 4. I applied it ship-wide, to all humans (no per-player state), via `contaminationCapacity`, and did not ask follow-ups. Humans already at 3 when it completes are not converted retroactively; that was my default, not an owner decision.
- First research with a completion effect; `RESEARCH_STATUS` now has its first entry.
- Wrap-up caught that `config` is persisted inside `GameState`, so the new `infection.mushophageBonus` field would be missing in saved games (`NaN` capacity once the research completed). Fixed by bumping `STATE_VERSION` to 31 in `server/src/GameRoom.ts`; I had missed it when implementing.

## 2026-10-17: Covert actions and cameras

- **Decision (owner):** a fourth log visibility, covert: bystanders never see it, only a camera in the room makes it room history. Secret actions are revealed by a camera too. Asked via the `rule` skill: a camera means a `camera` item in the room's inventory until installation (#35) exists; a camera's reveal is ordinary room history; it overrides `hideFrom`, so a filmed spike's victim sees it; spike and jettison move from secret to covert.
- **What worked:** checking issues #35/#36 first showed cameras only exist as a placeholder item, which turned "presence of a camera" into a concrete question instead of a guess.
- **Needed care:** the default config puts that placeholder camera in Front Corridor, so an existing "unwitnessed secret" test there would have started failing; the test now removes the camera explicitly.

### 2026-10-17: Sitting in chairs (cosmetic)

- The user asked for clicking a chair to show the sitting pose from `char.png`, purely cosmetic. Decided by the assistant (no rule involved): it is client-only state next to the walk target, so other players don't see it; a server-synced version was offered, not built.
- Found the poses by cropping the cast sheet in a Playwright page (no PIL): each row starts with four 32x48 frames (stand face, stand back, sit face, sit back). The other two directions are mirrors.
- Unverified guess: chair `dir` to pose mapping (`left`/`up` back, `down`/`right` face, with flips), inferred from the refectory layout where chairs face a table. No visual check was run yet.
- Wrap-up found `npm run typecheck` failing in `web/src/hud/ITrackie.tsx(104)` (`roomLog[i - 1]` possibly undefined); not in files this change touched, left alone.

### 2026-10-17: Porting a collaborator's camera branch (#35)

A collaborator's `Camera-Only` branch sat on a base many commits behind `main` (actions were still one file, tests beside the source). Merging would have conflicted everywhere, so the ideas were ported instead. Reading `main` first showed two things the branch missed: `hasCamera` already counted `camera` room items (so consuming the item and adding "Camera" equipment would have broken covert logging), and every room's layout already held a camera tile, so the branch's server-sent `roomTiles` and hard-coded position (which was not even the real corridor spot) were unnecessary. Install now moves the item into the room, and the client draws a room's own camera tile only when `view.roomItems` has one. The branch's docs called the costs "decided"; the issue said otherwise, so the owner was asked before they were written as decided.

### 2026-10-17: Camera swivel animation
The user asked for the camera tiles to swivel as in the original and pointed at `Mush/clients/iso/xml/Camera.xml`. Reading `Mush/clients` is denied to the assistant, so the user pasted the two `<slice>` entries instead. `ship-layout.json` already carried the same data (14 frames of 26x26, an auto ping-pong anim, rhythm 6), so `IsoRoom` just steps `sx` through `anims[0].frames` on a timer, only while the room has a camera. The tick length (30 ticks/s, so 200 ms a step) is the assistant's assumption about the Flash client, not in the XML. Not checked visually.

### 2026-10-17: Cameras become equipment (#35)

The first port kept an installed camera as a `camera` item lying in the room, which was the smallest change but let a loose item count as a camera. The owner corrected the model: an uninstalled camera is not room equipment, uninstalling removes it from the equipment, and dismantling (installed or not) leaves a metal scrap. `hasCamera` now reads `CAMERA` equipment only, `install` uses up the item, and `uninstall` and an equipment form of `dismantle` were added. Three existing tests had relied on a camera item filming a room; they now install one. Test states share `DEFAULT_CONFIG` by reference, so a test that adds equipment must clone the config first (`tests/cameras.ts`). The uninstall cost is a placeholder the owner has not set.

## 2026-10-17: Show success chance on action buttons

User asked for the percent chance of success in parentheses on actions. Added `PlayerView.legalChances: number[]` (parallel to `legalCosts`, same convention) and `chance` on `UnaffordableAction`, both from `ActionDef.chance` in `viewFor`, so the client still computes nothing. `ActionLabel` appends `actions.chance` ("(60%)", "(60 %)" in fr/es) only when the chance is below 1, so certain actions keep their plain labels. Today only punch and dismantle can fail. The chance is the viewer's own odds from config/own modifiers, so no hidden info is exposed.

## 2026-10-17: Visibility icons on action buttons

- Each action class declares `visibility` (public/private/secret/covert), read by the client through `actionVisibility(type)`; `ActionLabel` draws an icon after the label: `icons/ui/lock.png` (private), `camera.png` (secret), `discrete.png` (covert, the hushing hand). The request named "covert" twice; secret→camera, covert→hand was assumed.
- Visibility is declared by hand next to each action's log call, not derived from it. Share (DTT/STT) is marked private though the recipient is told too; dismantle stays public (only its failure is private). No action is secret yet, so the camera icon is unused for now.
- Follow-up (owner): extract spore is now secret (`logSecret`, log line in third person with the name); STT/DTT stay private. Asked whether "public only on success" needs its own category; recommended not (see below).
  Recommendation given: the icon describes what happens when the action succeeds, and failure visibility stays a per-action rule (punch misses are public, dismantle failures private), unless the owner decides on one rule for all failures.

## 2026-10-17: Myco alarm item
- Owner gave the trigger list (nine Mush abilities) and the research yield (three alarms); the issue (#159) said spore use. Asked one batch of questions: triggers (list, wire what exists), yield location (lab floor), dismantle (standard config), items (normal). Only spiking exists, so only it is wired; plain human punch is not the Mush skill, so it does not ring.
- Worked: `ringMycoAlarms` takes no actor, so the log entry cannot identify anyone. Corrected: nothing yet; the `danger` level is skipped because no log levels exist (#20).

### 2026-10-17: graveyard chat for the dead
The owner asked for a dead-only chat tab on the iTrackie, with the skull icon from the catalog (`ui/dead.png`, found by grepping `docs/catalogs/icon-catalog.md`). Modelled it on the Mush channel: a new `GRAVEYARD_CHANNEL` that `readChannels` and `chatChannels` give only to the dead, so `viewFor` and the server needed no changes. Assumed (not asked): no iTrackie needed, new arrivals see the history. Needed correction: three existing tests asserted that the dead post nowhere; and the new tab's hook used `graveyard` before it was declared (caught by typecheck).

### 2026-10-17: Wrap-up, visibility icons and secret spore extraction

- Decided by the owner: icons per visibility on action buttons, extract spore secret, STT/DTT private. Icon mapping (secret→camera, covert→hand) assumed by the assistant from an ambiguous request ("covert" named twice) and flagged; not corrected by the owner.
- Worked: deriving each action's visibility from its existing log call. Needed correction: the assistant had kept extract spore private, matching the code, but the owner wanted it secret.
- Leak check: `visibility` is static per action type, so exposing it reveals nothing. A secret extraction tells witnesses (or a camera) the extractor is Mush, which is the intended consequence of the owner's decision.
- Correction (owner, 2026-10-17): the icon mapping was the wrong way round. Secret is the hushing hand (`discrete.png`), covert the camera (only a camera reveals covert actions). The assistant's guess from the ambiguous request had swapped them.
- Decided (owner, 2026-10-17): no general visibility rule for failures; each action decides how its failure is logged (punch misses stay public). The proposed follow-up issue was dropped.

## 2026-10-17: Timed actions with a queue and action bars

- **Decision (owner):** every action takes 2 s and happens when its bar runs out, with "happen at once, then cooldown" kept behind `config.action.resolveAt`. Moving takes 2 s too. Queue of 3 behind the action under way; Clear queue cancels both; cost checked and paid at the end; End cycle stays instant and actions under way carry over. Bars show to roommates for any action whose log entry could reach them (public, secret, covert on camera), not private ones.
- **Design (AI-proposed, accepted):** the rules stay clock-free: the server stamps each action input with `at` and sends a `tick` input from a Durable Object alarm at `nextDue`. The action under way and the queue live in `GameState`, so `viewFor` stays the single place hidden information is filtered and replays rebuild the timeline exactly. The first plan kept the queue in the server, but resolving at the end of the bar meant others had to see a pending action, which moved it into the rules.
- **What worked:** asking the open questions in one batch (cost timing, what Clear cancels, queue cap, End cycle) before writing code; splitting `applyAction` into a checking wrapper and a mutating `performAction` left the ~300 existing rule tests untouched.
- **Needed correction:** a first leak test serialized whole views and matched "bond", which other players' own legal actions contain; narrowed to the entries describing the actor. The i18n ratchet caught a duplicated "Illegal action" string from the refactor.
- **My defaults, flagged to the owner:** `access` is untimed (it only opens a window); `pick_skill` is timed.

## 2026-10-17: Names hidden during a game

Owner asked to remove player and bot names from the UI and the view until the game ends. `Seat.name` stays in server state; `viewFor` strips it from `you` (new `YouView`) and `OtherPlayerView`, `ChatMessage` lost its copied `name` (chat is rebuilt field by field in `viewFor` so older stored messages can't leak one), and log/system params now carry character ids that the client names via `characterName`. The reveal at game end is #191, blocked by #27. Worked: typecheck found every client use; a single "no `Player ` anywhere in any view" test covers the leak. Needed care: log params were a second, easy-to-miss channel for names.

## 2026-10-17: Lie down action (#34)
Owner decided via questions: free, keep the existing +1 AP modifier (the issue's "+2" read as the total with base gain), any other action ends it plus an explicit get up. Implemented `lie_down`/`get_up`; "other action" reuses the `timed` flag so End cycle doesn't wake you. Examine and pick_skill also end it (they are timed); not asked, flagged to the owner. First test run failed because it passed an object to `parseGameMessage` (takes a JSON string) and forgot that the cycle only advances when everyone is ready.

## 2026-10-18: Inventory moved to an overlay on the room view

- Moved `InventoryPanel` out of `SelfPanel` into a new `InventoryOverlay`: a sack button (`icons/ui/stock.png`, already bundled as the Features "Inventory" icon, drawn at 1x) in the room view's lower-right corner, with a badge counting the room's items. It opens the same room/inventory zones over the iso scene. It stays open across take/drop and closes on the button, Escape, or a press elsewhere in the room view, so the Inspect panel stays usable beside it. Both layouts; hidden when dead. `SelfPanel` keeps the summary, resources and credits.
- Asked first about scope (only the inventory moves), mobile (yes, in the Room tab, replacing the block in the Inspect tab), the badge, and dead players; the user took the proposed defaults.
- Needed correction: the panel art (`tipbg`) is see-through, which was fine under the room but made the overlay hard to read over the scene on phones; it now has a solid `--panel-fill` backing. Re-serializing the locale JSON with Python reflowed unrelated inline objects; switched to a text insert to keep the diff to the new keys.
- Screenshot script: the take steps now open the overlay. The 02/03 desktop steps fail independently of this change (they wait for `.inspect-name`, which person targets no longer render since the name-chip change).
- Follow-up: the self panel's resources now run in one wrapping row under the summary on desktop too (they were a tall column on the right that set the panel's height), which gives the room view the height the inventory freed.
- Fixed the screenshot script's failures, none caused by the overlay: 02 waited for `.inspect-name`, which person targets no longer render (now waits for `.inspect-figure-name` to change from you), and picked the first `.iso-actor`, which can be a faded person in a neighbouring room whose click acts as that room's door (now current-room people only, skipping when there are none; m02 likewise). 03 read the equipment name from `.iso-viewport .tooltip`, but the hover label is now portaled to `<body>`, so it waited for "You examine the ." (`ship-view --walk` had the same bug via a long-gone `title` attribute). Once 02 stopped spending 30 s timing out, its shot caught the cryo wake-up intro, so `join` now waits for it to finish. FAIL lines now include Playwright's "waiting for" locator.

## 2026-10-18: Walking in the iso view

- Replaced instant moves with client-only walking (`web/src/iso/useWalkers.ts`): a 4-direction BFS over walkable cells (`walkPath`), one cell per 250 ms with CSS slides and the walk strip looping, facings from the face/back strips mirrored. You enter a room at the door you came from (`doorSpot`); others reshuffling to new spots walk too. Never blocks or delays intents.
- Checked the strips' directions with `npm run contact-sheet` first (face = down-left, back = up-right) rather than guessing; reading `Mush/clients` directly is denied, which pushed toward the existing tool.
- Measured `placeScene` per step with a throwaway test (7 ms default fog, 21 ms whole ship) before deciding not to split neighbour placement from actor placement.
- Correction (same day): I read the strips' directions off the contact sheet wrongly, so all four facings were mirrored (unflipped face is down-right, back is up-left, as the sitting poses already said). Lesson: when the code already states a convention (`seatFor`), trust it over my reading of a contact sheet, or ask. Per-step CSS transitions plus a separately transitioned camera and grid-axis paths looked choppy; replaced with a requestAnimationFrame loop (whole-pixel shifts from React's placed cell, camera shifted in the same frame) and line-of-sight path smoothing. The user didn't want a walk-in on entering a room, so you now stand at the entry door.
- Second correction (same day): the frame-driven walking never moved in dev. React StrictMode mounts, unmounts and remounts effects; the unmount cancelled the animation frame but left its id set, so the loop believed it was running and never restarted. Unit tests couldn't catch it (the pure helpers were fine). A throwaway Playwright probe sampling the sprite's position and the camera transform every 100 ms found it; I should have run that before reporting the rewrite as done.
- Third correction (same day): it still didn't walk for the user. I had made walking jump under `prefers-reduced-motion`, which Windows sets when its animation effects are off; the headless probe passed because it doesn't set it. Confirmed by running the probe with `reducedMotion: "reduce"` (one camera position instead of twelve). Walking now ignores the preference, since it carries information. Lesson: when "works for me, not for you", list what differs between the environments (OS accessibility settings included) before re-checking my own setup.
- Follow-up (same day): acting on something walks you up to it (`web/src/iso/useActingOn.ts`). Chose "when it begins" over "when clicked" so a queued action doesn't pull you away from the one under way: walks at once when idle, otherwise when the view shows it begun (`begun`, unit-tested). Verified with a Playwright probe (select a person, Examine from the Inspect panel, you end up next to them) before reporting this time.
- Follow-up (same day): the user wanted the staircase walking back as a style choice, so `smoothPath` is gone. Moving rooms walked nowhere: every action, a move included, takes 2 s on the server and the room changes at its end, so the move now walks you to the door when it begins (`useActingOn`), and `LeavingIsoRoom` keeps the old room on screen if the walk outlasts the move. The first probe showed a 2 s gap before walking; reading `config.action.durationMs` explained it. Lesson: check how the server times an action before deciding when its animation should start.

## 2026-10-18: jettison back to secret

Owner asked to make jettisoning a secret action (it had been moved to covert on 2026-10-17). Changed `jettison.ts` to `visibility = "secret"` with `logSecret`, rewrote its visibility test (alone, witness, camera), updated the rules docs. No ambiguity to resolve, so no questions asked.

## 2026-10-18: lying down becomes visible and blocks moving

Owner decisions: a lying player can't move between rooms until they `get_up` (0 AP), and everyone in the same room can see who lies down and in which bed. Added `PlayerState.lyingIn` (bed id, bumped `STATE_VERSION` to 36), `OtherPlayerView.lying` (same-room only), and a client lying sprite placed on the bed's middle footprint cell and mirrored for `bed_right`. Tests cover the move block and the same-room/elsewhere visibility. Not checked visually: which of the two bed orientations needs the mirror (a guess from footprints), and the lying sprite's paint order against the bed art.

Correction (same day): I had read "can't move" as the `move` action and made it illegal while lying. The owner meant walking around the room: double-clicking a door must still move you and get you up, and `get_up` exists only to stop accidental wake-ups. Reverted the rule change; the client now ignores floor, equipment and chair clicks while lying. Also `get_up` had no target in `targets.ts`, so no button ever showed; it is now aimed at yourself, like `extract_spore`. The lying person is drawn over the bed via an `onTop` flag on the paint-order actor.

## 2026-10-18: Action tags (#30)

- **Decision (owner):** actions carry tags. `aggressive` (punch; no effects yet, groundwork for Ian's Pacifist status) and `spore` (spike; not spore extraction, for balance). The myco alarm now rings for any `spore`-tagged action when it resolves, success or failure, so it no longer hard-codes action types. Tags go in the player's view, with no UI yet.
- **What worked:** checking the original data before planning. Motion Twin's `actions.json` groups actions by `secteur` ("Agression"), and Pacifist, Crazy Eye and Cease Fire all key off that category, which confirmed that tags fit. The plan also noted that tags alone don't get Pacifist working: it needs cost modifiers and an effect from another player in the room.
- **Owner's improvement:** the owner asked why the view's affordable and unaffordable actions were separate lists. There was no reason, so four parallel lists (`legalActions`, `legalCosts`, `legalChances`, `unaffordable`) became one `actions: ActionOption[]`, with an empty `lacks` meaning affordable rather than a separate boolean.
- **Refactor first:** every cost is now read through `Action.cost` (`canAfford` used to call `getCost` directly), so a later surcharge can't show one price and enforce another. This is the base-class method rather than a new `actionCost` in rules.ts, which would have created an import cycle.
- **Needed correction:** `tsc` doesn't cover the test folders, so the old field names only showed up when Vitest ran (shared and server). A screenshot run was blocked by an unrelated broken dev server; the owner said to skip it.

- 2026-10-18: Clicking equipment no longer walks you to it (only acting does), and queuing any timed action gets you out of bed (`getUp` in `queueAction`) and off a chair (client). I asked before touching the bed because it changes when the lying bonus ends; the chair is client-only.

- 2026-10-18: Made the rules tests less fragile. The owner suggested a test ship (one room with every terminal, a second for movement). I looked at what actually breaks first: the `Action.cost` change had edited about 20 test files, nearly all mechanically (`view.legalActions` to `legalIn(view)`), and 30 files each kept their own copy of seats, `player`, and `mustApply`. So the work was (1) one `shared/tests/support.ts` with those helpers plus `offered`/`option`/`costOf` for reading what a view offers, and (2) asserting from config, not literals: each feature pins its confirmed numbers once and derives them elsewhere. The test ship is deferred until equipment placement moves into config, and would come with real-ship checks so the fixture can't hide a misconfigured map.
- **Needed correction:** the script that swapped in the imports dropped imports still in use, because its "is this name used" check skipped `...DEFAULT_CONFIG` as if it were a property access. The owner's uncommitted work was in the same files, so `git checkout` wasn't an option; a second script rebuilt each file's imports from the union of HEAD's and the current ones, then pruned them again correctly. Running the tests after each step caught it straight away.

## 2026-10-18: Cost hooks, room effects, Pacifist, repriced queue

- **Decisions (owner):** Pacifist applies to Ian's own aggressive actions too; it is kept on conversion (losing it would out him); it stays private for now, as a modifier rather than a status, until the owner builds the UI; holders stack. A queued action whose price changed is cancelled rather than charged.
- **Design:** `Modifier.actionCost` changes the holder's own prices. `Modifier.roomActionCost` is read on demand from the living players in the actor's room ("pull"), rather than adding and removing surcharges as people move ("push"), so nothing goes stale. Both run inside `Action.cost`, which the previous refactor had made the one place prices are read.
- **Caught before coding:** taken literally, "cancel if the cost differs" would cancel the second of two queued moves across an AP-to-MP conversion, and a second heal on one care point. The owner chose to compare only the modifier adjustment, recorded per queued entry. The view still sends plain actions, so the client (which the owner was editing at the time) didn't change.
- **Needed correction:** a flat 0 floor on hooked prices broke moves, whose MP "cost" is a net change and can be negative. The floor is now 0 or the base, whichever is lower. One new test also assumed a second bond to the same person was still legal.

## 2026-10-18: Iso view performance pass, and a PixiJS story

- **Review:** asked to find performance problems in the iso view and whether three.js would fix them. The AI read the code and ranked the problems without profiling (only the `placeScene` timings in `web/src/iso/CLAUDE.md` were measured). The verdict: a WebGL renderer fixes the DOM-bound costs (thousands of filtered divs, reconciliation) but not paint-order sorting. A 2D library (PixiJS) fits this art better than three.js. The owner approved three DOM fixes and a story for PixiJS (#194, `needs-staging`).
- **Done:** `placeScene` split into `prepareScene` (the tiles, once per room and fog depth) and `placeActors` (people only, each cell step): about 11.5 → 2.2 ms per step on average, ~21 → ~5 ms with whole-ship fog. The camera swivel's 200 ms timer moved into its own component, so it no longer re-renders the whole scene. The walker frame loop uses the nodes found at the last commit instead of `querySelectorAll` every frame.
- **What worked:** a throwaway test checked the new code against a copy of the old one on every room × fog depth × random people (333 scenes, 8,578 cycle breaks): output identical. Keeping the cycle-breaking walk exact meant ranking predecessors in the order the old left-to-right sweep found them.
- **Needed correction:** the first cut at stripping sort-only fields also dropped `onTop`, which the old output kept. The equivalence test caught it.

- 2026-10-18: Spiking is now tagged `aggressive` (plus `spore`), so Pacifist's +2 AP surcharge applies to it. One-line tag change, test added, rules docs updated.

## 2026-10-18: Profiling the iso view; PixiJS chosen over three.js

- **Decision (owner):** PixiJS is the next renderer for the iso view; three.js is not planned. Recorded in `CLAUDE.md` (Stack) and #194, which has the production baseline. The `pixi.js` dependency still needs approval when the spike starts.
- **Evidence:** the owner recorded Firefox and Chrome profiles; the AI parsed them with throwaway Python scripts. The dev-build recording overstated JavaScript (~20% in Firefox, mostly React dev overhead). In production, Firefox's main thread was still saturated while people walked, ~73% of it display-list painting and 7% JavaScript, with 31% of frames over 16.7 ms. Chrome's page thread was only ~20% busy, but its GPU process was at 100% for the whole walk, at ~39 frames a second shown. Same cause in both: thousands of filtered sprite elements redrawn every frame.
- **Needed correction:** the profile parsing went wrong twice before giving sensible numbers. The Firefox format (preprocessed v75) keeps its stack tables in `shared` with offset-encoded prefixes and carries no frame categories, so the first pass counted every sample as idle. Firefox's own C++ frames also have source files, so the second pass counted all of them as JavaScript. Both were caught by sanity checks (a busy page can't be 100% idle). The profile files weren't in the folder the owner named; they were in Windows Downloads.

## 2026-10-18: Buildable sofas, and a query tool for the ship layout

- **Decision (owner):** a sofa is a bed built from its blueprint, following the French wiki that the owner pasted in: any room, more than one per room, never there at the start, dismantled for 3 AP into 1 plastic scrap (usual 12% odds, owner's pick), occupant gets up. Drawn once per room at hand-picked spots that Claude proposed for the owner to review.
- **Needed correction:** the request said "cameras" but meant sofas; Claude asked instead of building a camera blueprint. The owner first said one sofa per room, then chose the wiki's "two allowed" when Claude pointed out the conflict.
- **What worked:** reading `ship-layout.json` was denied (by design, it is large), so instead of loosening the rule we added `npm run layout-query`, which prints only matching lines, and allowed just that command. A throwaway script then listed wall-backed spots near each room's camera that keep the floor connected, and a temporary "draw every sofa" patch plus `ship-view` checked all 25 spots in one screenshot. A web test pins the spots to free floor that stays connected.

## 2026-10-18: Renderer seam for the iso view (Pixi phase 1)

- Before adding PixiJS (#194), split `IsoRoom` into a controller and a renderer behind a seam, DOM only: `describeScene` (`web/src/iso/scene.ts`, pure, unit tested) turns placed sprites into a renderer-neutral `Scene` (image frames, positions, flips, `SceneAnim`s, effects by meaning such as `fogged`/`selected`, see-through outlines), and a renderer is a component taking `{ scene, ref }` that draws it and takes per-frame camera/walker offsets via `ref.setFrame`. `useWalkers` no longer touches the DOM. Badges and bubbles moved to a DOM `SceneOverlay` above the scene.
- Chose imperative Pixi over `@pixi/react` (the user asked for the tradeoffs): thousands of mostly static sprites plus a per-frame hot path that bypasses React anyway; a class boundary keeps Pixi out of components. Chose hand-written filters over `pixi-filters`. Version to pin: `pixi.js@8.22.0`.
- Deviation from the plan as first sketched: the seam is a React component contract (`SceneRendererProps`) rather than a bare `mount/setScene/setFrame/destroy` interface, because the DOM renderer is naturally React; a Pixi backend wraps its imperative class in a thin component.
- What the refactor surfaced: effect precedence was implicit in CSS specificity (a hovered reachable door outshines its selection; selected equipment keeps its glow when hovered). It is now explicit in `describeScene` and tested. Derek's walk strips are 192x64, not 192x48; the old CSS squashed them to 48px tall (non-integer scaling). Measured the opaque rows (others' feet at rows 41-45, Derek's at 57) and now read his frames from row 15 at 1x, which also fixes his hit mask.
- Found while planning, not yet fixed: two atlases (`BigFill.png` 2393x4758, `BigFill2.png` 5573x4508) exceed the 4096px texture limit of many phone GPUs, so they need splitting before the Pixi backend.
- Correction to the entry above: the Derek fix was reverted before landing. `derek` isn't a `CharacterId` (typecheck caught the comparison), so his 192x64 strip is never drawn. Lesson: check that the asset is reachable from the code before fixing it.
