# Code map

Where each file lives and what it is for, one line per file. Read it when you need to find something. What the rules do is in `docs/implemented-rules.md`; what is tested is in `docs/testing.md`; how the isometric view works is in `web/src/iso/CLAUDE.md`.

Tests live in a `tests/` folder next to `src/` in each package, mirroring the `src/` layout. The one exception is `tools/src/death/hpWrites.test.ts`, which sits with the tool that scans the source.

## shared

Other packages import from `@mush2/shared` (`shared/src/index.ts`, the barrel). Inside `shared`, import types from `types.ts`.

**Engine**

- `rules.ts`: `createGame`, `applyAction`, `legalActions` (both via the action registry), `viewFor`, `dayOf`, `setCheat`, `setActopiCheat`; private `advanceCycle` (cycle and day boundaries) and `grantCarePoints`. State is plain JSON (persisted and cloned via JSON). `viewFor` is the single place hidden info is stripped; extend its tests whenever `PlayerView` grows.
- `actions.ts`: the action registry (`ACTIONS`), `visibleTargets`, and the `ActionDef` / `ActionCost` types. Adding an action means adding a file in `actions/` and registering it here.
- `actions/action.ts`: the `Action` base class: `getCandidates` (what to offer), `check` (why not, as a reason code, or null), `getCost`, `apply`, and optionally `getSuccessChance` and `fail`.
- `actions/<type>.ts`: one class per action: `bond`, `consume`, `cook`, `dismantle`, `dispense`, `examine`, `extract_spore`, `heal`, `move`, `pick_skill`, `punch`, `ready`, `share` (`dtt`, `stt`), `shower`, `spike`, `transfer` (`take`, `drop`).
- `modifiers.ts`: the modifier registry. Players hold modifier ids; numeric hooks all go through one `fold`, each with a one-line accessor (`apGain`, `healAmount`, `punchDamage`, ...). Other hooks: `movement` (`movementRules`; `moveCost` is the single place a move's price is computed), `onActionFailed` (via `actionFailed`), `onPick` (via `skillPicked`).
- `modifiers/<id>.ts`: one file per modifier: `creative`, `first_aid`, `lying_down` (not applied until a lie-down action exists), `medic`, `sturdy`; `careSkill.ts` is the factory behind `first_aid`.
- `replay.ts`: `Input`, `GameSetup`, `applyInput` (the single entry point for changing a game; the server calls nothing else), and `replayGame` (re-runs a record and throws on a rejected input).
- `rng.ts`: the seeded RNG (its state is part of `GameState`).
- `helpers.ts`: `ActionResult`, `fail`, `clone`, `findPlayer`.

**Rule areas** (see `docs/implemented-rules.md` for what each does)

- `chat.ts`: chat storage (`pushChat`, `removeFromChannel`), `chatChannels`, `sendChat`, `toggleCheckbox`, private channels (`createChannel`, `inviteToChannel`, `leaveChannel`), limits (`MAX_CHAT_LENGTH`, `MAX_CHAT_LINES`, `CHAT_HISTORY`).
- `death.ts`: `damage` (the one way HP goes down) and `killPlayer`.
- `infection.ts`: `contaminate` (the one way contamination rises) and conversion; `contaminationSeenBy`.
- `items.ts`: item types (`ITEM_TYPES`) and containers (every item is in one `Container`, a player or a room); `capacity`, `canReach`, `carriesHeavy`, `itemsIn`, `produceItem`, `CORPSE_ITEM`, `ITRACKIE_ITEM`.
- `equipment.ts`: room equipment types (`EQUIPMENT_TYPES`, hand-translated from the French data).
- `log.ts`: room log helpers (`logPublic`, `logPrivate`, `logSecret`).
- `resources.ts`: per-player skill point pools (`RESOURCE_IDS`, `emptyResources`); only `heal` (care points) is used so far.
- `skills.ts`: the pickable human skills (`SKILLS`) and `SKILL_SLOTS`.
- `statuses.ts`: stored and derived statuses (`statusesOf`, `isFullBelly`, `isHungry`, `STATUS_PUBLIC`).
- `cheats.ts`: development cheats (`CHEATS`, `ACTOPI_CHEATS`, `applyCheats`; issue #148). The server refuses the `cheat` input unless `ALLOW_CHEATS=true` (local `server/.dev.vars`); the view message carries `cheatsAllowed` so the settings dialog only shows the section then.

**Types, config, and data**

- `types.ts`: the small shared vocabulary (`PlayerId`, `RoomId`, `Role`, `Seat`, `LogEntry`, `ItemState`, `Container`, `Target`, the `Action` union); re-exports `types/`.
- `types/config.ts`: `GameConfig`, `MovementRules`, `Equipment`. Tuning is nested by feature, with each action's `cost` (what the player pays) split from its `effect` (what happens), and conditions (`rooms`, `successChance`, cooldowns) beside them, e.g. `config.punch.cost.ap`, `config.punch.effect.damage`.
- `types/player.ts`: `PlayerState`, `ResourceId`.
- `types/chat.ts`: `FEATURE_CHANNELS`, `MUSH_CHANNEL`, `ChannelId`, `PrivateChannel`, `ChatMessage`.
- `types/state.ts`: `GameState` (server-only).
- `types/view.ts`: `PlayerView`, `OtherPlayerView`, `ItemView`: the only game data a client or bot receives.
- `config.ts`: `DEFAULT_CONFIG` and `SEAT_COUNT` (8, a placeholder: `docs/rules-design.md` decided 16 seats with 2 Mush, or 1 when 8 or fewer players; not implemented). The map and per-room equipment come from `@mush2/assets/derived/ship-rooms.json`. Actions read every number from `state.config`; nothing is hard-coded in the action classes.
- `protocol.ts`: wire message types plus `parse*` validators for untrusted client input.
- `moderation.ts`: `moderateChat` (normalize, strip invisible characters, remove links, mask a starter word list). Called by the server, not the rules.
- `characters.ts`: cosmetic crew identities (`Seat.character`), assigned by the matchmaker. No rules effect.
- `shipLayout.ts`: types for `Mush/derived/ship-layout.json`, plus `placedEquipment`, the one rule for which sprite draws which equipment (used by both the converter and the renderer).

## server

All under `server/src/`.

- `index.ts`: the worker entry; routes requests with `routePartykitRequest` and exports the Durable Object classes.
- `Matchmaker.ts`: single instance (`matchmaker/global`). Queues players, fills empty seats with bots after 5 s, creates a `GameRoom` via `getServerByName` and calls its `setup()` over RPC, then hands each human a secret seat token. This is still the bot-filling model; the decided MVP model (a per-language queue into an open pre-selection ship, no bots in multiplayer) is not built yet.
- `GameRoom.ts`: one per game (`game-room/<uuid>`). `?token=` maps a connection to a seat. Persists state to DO storage on every change (`STATE_VERSION`; mismatched saves are discarded) and records the game for replays: `setup` once, then `input:<seq>` per accepted input in the same atomic `put` as the snapshot; moderation-blocked text goes to `blocked:<seq>`; rate-limit rejections are only counted (`Stored.rateLimited`). `env.RULES_VERSION` is "dev" locally and the commit hash on deploy. Sends each connection its own `viewFor`, runs bots with a deliberate delay, and handles chat (rate limit, then moderation, then `sendChat`).
- `bots.ts`: the `Bot` interface and the scripted placeholders `WanderBot` and `LogParrotBot` (chosen by `Seat.botKind`). Bots live in `server`, not `shared`, because model-backed bots need network calls, secrets, and a spend cap.
- `rateLimit.ts`: the per-seat `RateLimiter`.
- `testing/fakes.ts`: `FakeServer` (plus fake storage and sockets), so tests run the rooms without the Durable Object runtime.

## tools

All under `tools/src/`.

- `shipLayout/` (`npm run ship-layout`): the build-time converter. `convert.ts` drives it; `png.ts` and `xml.ts` are hand-written decoders (no dependencies); `stretch.ts` applies our own room-shape changes (corridors widened to 4 cells, back corridor lengthened); `shipPlan.ts` writes `Mush/derived/ship-plan.json` (the 2D deck plan for the minimap) from `Map.hx`, decoded by `haxe.ts` (a minimal Haxe unserializer).
- `play/screenshot.ts`: `npm run screenshot` (desktop and phone passes; see the `play` skill).
- `play/shipView.ts`: `npm run ship-view` (see `web/src/iso/CLAUDE.md`).
- `contactSheet/contactSheet.ts`: `npm run contact-sheet`.
- `assetIndex/assetIndex.ts`: `npm run asset-index`.
- `odsData/`: `npm run ods-data`; `ods.ts` reads the spreadsheets.
- `dev/`: `npm run dev` (`dev.ts`) and the per-worktree ports (`ports.ts`, `npm run ports`).
- `i18n/`: catalog checks (`catalog.ts`) and the hardcoded-text ratchet (`hardcoded.ts`, `baseline.json`); run by `tools/tests/i18n/`.
- `death/hpWrites.test.ts`: fails if any file other than `cheats.ts` and `actions/heal.ts` writes `.hp`.

## web

All under `web/src/`. The client never computes legality or costs; it uses `view.legalActions` and `view.legalCosts`. UI rules are in `web/CLAUDE.md`.

**App shell**

- `main.tsx`: React entry.
- `App.tsx`: lobby or game; keeps the seat ticket in sessionStorage.
- `net.ts`: PartySocket connections (`matchmakerSocket`; host from `VITE_PARTY_HOST`).
- `Lobby.tsx` + `lobby.css`: the cryopod landing page (window and wall drawn as tilted vertical strips to bend them into a half-cylinder).
- `WakeUp.tsx` + `wakeUp.css`: the wake-up overlay shown when you enter a game.
- `GameScreen.tsx`: three panels on desktop, tabbed on phones; sends intents. The minimap is stubbed out here (`TODO(minimap)`).
- `Toasts.tsx`: transient messages (rate limits, rejected actions).
- `useMobile.ts`: the phone-layout media query (`MOBILE_QUERY`).
- `fogDepth.ts`: the per-viewer fog depth preference (how many rooms out the iso view draws), in localStorage.
- `styles.css`: only `@import`s of `styles/*.css` (tokens, base, buttons, top-bar, layout, inspect, self-panel, items, itrackie, chat, iso, minimap, toast, responsive); `responsive.css` must stay last.

**hud/**

- `TopBar.tsx`: cycle, End cycle, Leave, settings; on phones also the `PlayerSummary`.
- `PlayerSummary.tsx`: portrait, name, faction icon, and AP/MP/HP/morale bars.
- `PipBar.tsx`: the original pip bar redrawn in SVG (`Mush/derived/pip-bar/`), tinted by CSS `color`.
- `SettingsDialog.tsx` + `settings.css`: the settings button and dialog (fog depth, cheats when allowed).
- `SelfPanel.tsx`: under the room on desktop (summary, room items, inventory); in the Inspect tab on phones.
- `InventoryPanel.tsx`: the room and inventory item zones; drag between them to take/drop, with a tap-and-button fallback for touch.
- `InspectPanel.tsx`: the selected person, equipment, or item (yourself by default), with buttons for its legal actions.
- `SkillSlots.tsx`: skill slots over the Inspect portrait, with the picker dialog.
- `StatusIcons.tsx`: status icons in the Inspect panel. `ItemAttrIcons.tsx`: item attribute icons (heavy, ...).
- `ITrackie.tsx`: the right panel: room log, global chat, Features, and Private tabs.
- `FeatureSelect.tsx`: the Features drop-down (Base UI Select with icons).
- `IconButton.tsx`: `IconButton` and `IconTab` (emoji or image tabs with tooltips).
- `Markdown.tsx`: chat message rendering (react-markdown + remark-gfm, restricted).
- `ActionLabel.tsx`: an action button's label with its cost.
- `targets.ts`: finds the selection in the view (`resolveTarget`, `actionsOn`, `costOf`, `actionLabelKey`).
- `BottomNav.tsx` (phone only): the panel switcher. `PeekBar.tsx` (phone only): the tapped person, equipment, or door (yourself by default) with its actions.

**iso/** (details in `web/src/iso/CLAUDE.md`)

- `placement.ts`: pure layout math: projection, paint order (`placeScene`, `fillGaps`), `neighborRooms`, walkable cells, `cellAtPoint`, `standSpot`, `hitTest`.
- `IsoRoom.tsx`: renders the scene at 1x with a following camera, and handles clicks.
- `hitMask.ts`: per-frame alpha masks for pixel hit-testing.
- `shipLayout.ts`: fetches the layout JSON and maps atlas sheets to image URLs.

**scene/**

- `Minimap.tsx`: SVG deck plan (currently not rendered; see `GameScreen.tsx`). `plan.ts`: its pure path and dot-placement helpers.
- `CrewSprite.tsx`: a character's sprite.
- `StatusBadges.tsx`: public status icons over a character's head.
- `useSpeechBubbles.ts`: global chat messages shown as speech bubbles over their senders (drawn by `IsoRoom`).

**art/**

- `assets.ts`: maps characters, room types, and item types (ids match icon file names in `www/img/icons/items/`) to files in `Mush/`.
- `keyedSprite.ts`: `useKeyedSprite`, which makes sprite backgrounds transparent at load time.

**i18n/** (see the `i18n` skill)

- `index.ts`: i18next setup. `locale.ts`: language choice and persistence. Catalogs are `web/src/locales/{en,fr,es}.json`.
- `names.ts`: `useNames()`, display names for ids the server sends (rooms, equipment, items, log events).
- `LanguageSwitcher.tsx` + `languageSwitcher.css`: the lobby language picker.
