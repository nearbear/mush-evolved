# Replay viewer (plan)

2026-11-05. A plan for [#156](https://github.com/nearbear/mush2/issues/156), split into stories to become its sub-issues. Reviewed with the owner 2026-11-05; the answers are marked "owner, 2026-11-05". Not built. Builds on the closed groundwork: #333 (`GameView` without a socket), #334 (`fullViewFor`, `perspective`), #335 (history in the record), #336 (copy to R2, `shared/src/replayChunks.ts`), #337 (`GET /api/games/<id>/replay[/<n>]`, `server/src/replayRoutes.ts`). The format and storage decisions are in `docs/rules/rules-design.md`, "Replay history and storage" and "Full view".

## What exists

- **Data:** the index (`ReplayIndex`: format version, rules version, end time, each seat's starting role and character, and per chunk its cycle, first input, input count and time range) and one chunk per cycle (`ChunkEntry[]`: each input's time and history step). `rebuildHistory` turns a chunk's steps into a full view after every input. `perspective(full, seat)` is the view the seat had.
- **Serving:** only ended games that are in the games list and have a confirmed copy; otherwise `404`, or `409 not_ready` while the copy is unconfirmed. Single-player replays are only for the account that played them. The rate limit is 60 requests a minute.
- **Client:** `GameView` renders any `PlayerView`, and without `send` it hides or disables every intent. `/games` lists finished games. Nothing links to a replay yet.
- **Not in R2:** the inputs themselves. A replay knows what changed at each step, never which action caused it.

## Decided (owner, 2026-11-05)

1. **All-seeing follows a seat.** The all-seeing mode is a seat's view with every hidden thing added: the camera stays in the followed character's room, and switching seats moves it. There is no free camera over the ship, because the HUD (`SelfHud`, the inspect panel, the room list) is built around a "you".
2. **What all-seeing reveals about the crew:** role (human, alpha Mush, beta Mush), spores and contamination, private stats (HP, morale, AP, MP, private statuses) and inventories.
3. **Skipping bookkeeping:** with skipping on, Next and autoplay stop only on steps that add a log line or a chat message, or that start a cycle. Steps with no visible change, such as `seen` or a tick with no line, are skipped. Moves write log lines, so they still stop. Raw stepping, one input at a time, is always available.
4. **Older games get a summary:** a new `GET /api/games/<id>` returns one game's games-list entry (winner, ending, cycles, crew), with the replay's privacy. A replay the viewer can't read shows that summary beside the notice.
5. **All-seeing shows all history:** every log line and message up to the step, with no room-log window, paged so a long game isn't one huge list. A seat's own perspective shows exactly the window that seat had (it comes from `perspective`, so this is automatic).
6. **The room-log window** (a rule, `docs/rules/rules-design.md`, "Room log window, Tracker"): a seat sees 8 cycles of room log, a Tracker 16. Chat has no window; #355's pages stand.

## Prerequisites (not in these stories)

The history the replay reads is the full view, so it inherits how the state keeps log and chat. Today the state deletes old chat (200 per channel), so it isn't append-only. (A Transfer no longer rewrites past `visibleTo`: private lines stay with the body since #281 step 1.) These land first, or the stories below have to follow them later:

- **Log entry ids** (built 2026-11-05, with #367): `LogEntry.id`, increasing per game like `ChatMessage.id` (`GameState.nextLogId`, written only by `pushLog` in `log.ts`). Once the log is windowed or trimmed, positions and lengths stop identifying entries (live, `web/src/announce.ts` now uses `PlayerView.logSeen` instead, #365). Every replay lookup below keys log lines and messages by id. Live views never carry log ids (owner, 2026-11-05): the counter is per game, so a gap would show a witness that a hidden line was written, such as a conversion. `viewFor` strips them; `seatViewFor` and `perspective` keep them as a `SeatView`, which only the replay uses (Biome forbids both in `server/src`). Chat ids have the same flaw, fixed under #355 with a per-channel `seq`.
- **Private lines addressed by seat** (#281 step 1): `mind.ts` stops rewriting old entries on a Transfer, so the log only grows at the end.
- **The room-log window** (#365, built 2026-11-05): `viewFor` filters to 8 or 16 cycles (`config.logWindow`). The rules also drop room lines older than the longest window any rule needs (16 cycles; ship-wide lines are never windowed, so they stay), so the live state, snapshot and per-cycle full copies stop growing with the game (most of #338 for the log). The record keeps every entry, so nothing is lost to replays.
- **Chat pages** (#355): sealed pages leave `GameState.chat`, which, like the log trim, shows up in the history as removals.

So in the history, entries leave the front of both lists while new ones append at the end. The replay treats log and chat as **streams**: an entry is new at the step whose change appends it, and all-seeing collects every entry seen from chunk 0 up to the step, by id.

## Stories

The order is the build order. Stories 1 and 2 don't depend on each other. Story 3 needs nothing but the existing API (story 2 adds only its summary call). Story 4 needs 1 and 3. Stories 5 and 6 need 4.

### 1. (#367) Replay helpers in shared (pure, tested). Size M. Label `leak-risk`. **Built 2026-11-05** (`shared/src/replayView.ts`).

The logic the page needs, kept out of components (architecture rule 3).

- **`revealFor(full, followSeat): { view: PlayerView; reveal: Reveal }`**: the all-seeing mode.
  - `view` is `perspective(full, followSeat)`, with the hidden log and chat added from the streams (Prerequisites): every log entry in the followed room since the game began, whatever its visibility and with no window, plus the followed seat's own lines from elsewhere; every channel and every private channel, with all their messages. These are ordinary `LogEntry` and `ChatMessage` values, so the log and chat panels need no change to show them, apart from paging. Older pages need older chunks, which load when the reader pages back to them.
  - `reveal` is a separate object for what a `PlayerView` has no field for: per seat, role, spores, contamination, HP, morale, AP, MP, private statuses, inventory; per log line and message (by id), who originally saw it (taken from `visibleTo` and the channel's members). A line's kind and whether it leaked are not here: they will be in the live view (`docs/rules/rules-design.md`, "Log line kind").
  - **Why separate, not new optional fields on `OtherPlayerView`** (decided, owner, 2026-11-05): the live game builds the same `PlayerView` type, so a field added there could one day be filled by mistake and reach a live client. A `Reveal` type that no server code imports can't be. Tradeoff: the HUD gets one more prop to pass down. A Biome `noRestrictedImports` rule checks that `server/` never imports `revealFor`.
- **`stepMarks(frames, firstStep): Mark[]`**: one mark for each step that adds a log line or a message, or starts a cycle, with a kind: `death`, `conversion`, `fire`, `chat`, `cycle`, `other`. The kind comes from the log keys the step adds (for example `death`, the conversion line, fire lines). Next event, previous event and the pips on the step scrubber all read it, so decision 3 lives in one tested function. It compares the highest log and message id between frames, never lengths: a trim or a sealed page removes entries in the same step that adds one. A room restart's `base` step is never an event (owner, 2026-11-05), even when the loaded view differs from the frame before it.
- **`lineStep(frames, kind, id)`**: the step whose frame first holds that log line or message, for click-to-jump.
- **`seatsAt(full, index)`**: each seat (a mind) with the character it is in at that frame, its starting character, and whether a Transfer moved it. The perspective switcher reads it.
- **Tests:** `revealFor(...).view` contains `perspective` (the extra lines are the only difference); a hidden line from another room is not added; `stepMarks` on a recorded random game (the `#335` measurement harness: 2,090 inputs, 14 cycles), with no mark for an empty step; a Transfer across a frame in `seatsAt`.
- **Leak-check:** this module shows every hidden thing by design. The check is that only the replay page reaches it, and that `revealFor` runs only on data the server already serves as public (`fullView.ts` header).
- **As built:** `revealFor` takes the streams as an optional third argument (`mergeStreams` over the frames so far; without it, what the full view still holds). `Reveal.seats` is by body id and holds each body's own `you`, statuses and inventory (as its player saw them, for story 5 to reuse the self panels) plus contamination. `seenBy` is filled only for non-public lines and for messages in private channels (members at the frame) and the Mush channel. `stepMarks` takes the chunk before's last view as an optional `before`; without it, a chunk's first step (a cycle's full copy) counts everything of its new cycle as added, which gives the same marks. Kind priority: death, conversion, fire (a fire starting or going out: `ignited`, `fireStarted`, `fireExtinguished`, `extinguishFailed`; not `fireBurns`, which is written every cycle a fire burns with people present, owner 2026-11-05), cycle, chat (a player's message), other (order confirmed by the owner, 2026-11-05). `lineStep` takes the chunk's `firstInput` and returns record positions, `-1` for a line the launch state holds. `seatsAt(full, index)` takes the index's seats for order and starting character.

### 2. (#368) One game's summary: `GET /api/games/<id>`. Size S. Label `leak-risk`. **Built 2026-11-06** (`gameSummaryRoute` in `server/src/replayRoutes.ts`, `GameStore.finished`); the replay page's header is left to story 4, since the page doesn't exist yet.

- Returns the game's `FinishedGame` entry from D1 (`gameStore.ts`), the same object `/api/games` lists. Single-player games go only to the account that played them; anyone else, and any game not in the list, gets a `404`. This reuses `replayAccess` and the `mayView` check in `replayRoutes.ts`, so share links later are still one change in one place.
- Cached like the replay index for a public game, `no-store` for a single-player one. Added to `openapi.ts` and `apiSchemas.ts`, with route tests next to the replay route tests.
- The replay page also uses it for its header (who won, how it ended, who was who), so the header doesn't wait for the last chunk.

### 3. (#369) Loading a replay (`web/src/replay/useReplay.ts`). Size M. **Built 2026-11-07** (`web/src/replay/`).

- Fetches the index. The cycle bar draws from `index.chunks` alone.
- Fetches a chunk when it is first needed and the next one in the background. `rebuildHistory` runs once per chunk.
  - **Debounced** (owner, 2026-11-05): while the cycle scrubber is dragged (or PageUp/PageDown held), nothing is fetched; the bar updates from the index and the stage keeps the last frame, dimmed, labelled with the cycle under the thumb. A chunk is fetched once the position has rested ~200 ms. A fetch for a chunk no longer wanted is aborted (saves bandwidth and parsing, not rate limit: the server already counted it).
  - **Cache** (owner, 2026-11-05): the current cycle's chunk and its 4 neighbours (2 before, 2 after); others are dropped and fetched again when needed (public ones come from the browser cache). Rebuilt frames are dropped with their chunk.
  - **`429`:** shows "Too many requests, retrying…" and retries after `Retry-After`, or the `not_ready` backoff below. A frame's `PlayerView` (from `perspective` or `revealFor`) is computed only for the step on screen and memoized, so dragging the scrubber doesn't compute a view for every input it crosses.
  - **Request budget:** a 14-cycle game is about 16 requests (index, summary, 14 chunks), well under 60 a minute. Public chunks are cached as immutable, so a revisit costs only the index.
- **`409 not_ready`:** shows "Preparing replay…" and retries the index after 1, 2, 4, 8 and 15 s, then offers Retry. The usual case is someone clicking through from the end screen before the copy is confirmed.
- **Frames are normalized** (#384, reversing 2026-11-01's "no migrations"): the hook passes the frame on screen through `readFrame` (`viewHistory.ts`: the upgrade steps the frame's `build.stateVersion` still needs, then `normalizeFullView`, memoized) before `perspective` or `revealFor`. So an older additive shape reads.
- **Too old to read:** if `index.v !== HISTORY_VERSION`, or `readFrame` or `perspective` throws `HistoryError` (a frame newer than this build, one the normalizers reject, or an old action shape in a queue that `viewFor` can't read), it shows the notice and the story 2 summary: winner, ending, cycles, and each seat's starting role (from the index) and ending role (from the summary). Decided (owner, 2026-11-06): the hook reads the first frame of the first chunk it loads, so an unreadable game is caught at load rather than mid-playback.
- **Recorded on an older build:** a frame whose `build.rulesVersion` isn't the current build's carries a small badge, read per frame (a game spans deploys), since an old state `viewFor` reads without throwing could still be shown wrong. A frame with no `build` (recorded before the stamps) counts as older.
- **Not found:** the same screen for a game that doesn't exist, one that hasn't ended, and a private one, matching the server's `404`, which doesn't reveal which of those it is.
- **Tests:** the hook's reducer, as a pure function, under Vitest: chunk bookkeeping, the backoff schedule, the version check.
- **As built:** the reducer is `replayState.ts`, the step's view `replayViews.ts`, the notices `ReplayNotice.tsx` (with `OlderBuildBadge`; the page places them). The hook takes the seat to follow and the mode, and returns the shown step, whether it is `stale` (an older position kept while the position's chunk loads), the view, and `olderBuild`. Any `seek` to a chunk not loaded waits the 200 ms, not only a drag; a loaded chunk shows at once. All-seeing's streams come from the run of loaded chunks ending at the step (at least 2 cycles back with the cache), so older lines wait for story 5's paging. "The current build" is the client's own `RULES_VERSION`, stamped into the bundle by `vite.config.ts` (`git describe`, as the server's deploy scripts do; "dev" on the dev server). A `429` without `Retry-After` uses the `not_ready` backoff and keeps its last wait rather than giving up. The summary is fetched with the index, for story 4's header.

### 4. (#370) The replay page and transport (`/replay/:id`). Size L.

- **Route:** lazy-loaded from `main.tsx`, like `/games`.
- **`ReplayPage`** renders `GameView` with no `send`, the step's `PlayerView`, and the frame's time:
  - **The clock is frozen at the step's time** (owner, 2026-11-05): `GameView` takes a `now` (ms) that it reads instead of `Date.now() + clockOffset`, so the cycle countdown, action bars and door moves stand still while paused and jump with each step. A fixed `clockOffset` isn't enough: `CycleCountdown` and `recentDoorMoves` add it to a running `Date.now()`, so they would keep moving.
  - Walk animations play forward and snap when stepping backward or jumping (the walkers hook already snaps on large jumps; to check).
- **URL state (deep links, in this story; owner, 2026-11-05):** `?input=<seq>&seat=<seat>&reveal=1`. `input` is the record position (`input:<seq>`, from each chunk's `firstInput`), so a link never depends on how the history is chunked; `input=-1` is step 0, the launch state. Not meant to be readable: the transport shows day and cycle. All-seeing is its own parameter, since it always follows a seat; without `reveal` it is that seat's own view. A position past the end clamps to the last step. Updated with `replace`, so a link opens the same moment and Back leaves the replay instead of undoing steps. It also prepares share links (#156, owner comment of 2026-11-01).
- **Transport:**
  - cycle selector and cycle scrubber (from the index);
  - step back and forward one input;
  - previous and next event (story 1's marks);
  - play/pause, at 1×, 2× and 4× (owner, 2026-11-05: 1× is 1 step a second when skipping, 4 steps a second raw);
  - the skip toggle, on by default;
  - the perspective switcher: "All-seeing" plus every seat, each shown as its character at that step, with a Transfer marked "now in <character> (started as <character>)". The mode is always shown as a badge: "All-seeing · following Kuan Ti" or "Seen by Kuan Ti".
  - Keyboard: ←/→ step, Shift+←/→ event, PageUp/PageDown cycle, Space play. Handled only when focus is on the page or the stage (owner, 2026-11-05), never inside an input, slider, tab list, scroll area or (for Space) a button, which use those keys themselves.
- **Layout:** `GameView` gets a `transport?: ReactNode` slot. On desktop it is a bar above the stage. Below 1024px it is a compact strip docked above `BottomNav`, outside the panels, so Room, Log, Chat and Crew all keep it. The phone strip holds step back, play, step forward, the cycle and the switcher; the speed and skip toggle go in an overflow menu.
- **Default on open:** all-seeing, following the first seat, at step 0: the launch state before the first input (`frames[0].base` of chunk 0), a step you can land on like any other (owner, 2026-11-05).
- **i18n:** every new string in en/fr/es.
- **Decided (owner, 2026-11-08):**
  - **Step vs event.** With skipping on, Next stops on every mark (decision 3); next and previous *event* stop only on marks of kind `death`, `conversion`, `fire` and `chat`, never `cycle` or `other`.
  - **Cycle countdown.** Shown in a replay of a game whose cycles ran on a clock, frozen at the step's time and counting to when the next cycle actually started (the next chunk's `from`); hidden otherwise (today, single player). The index says which with a `realTime` flag the server writes (`replayIndex` in `shared/src/replayChunks.ts`, from `server/src/replayStore.ts`): about the clock, not the mode, since that's all it's for. Optional, so `HISTORY_VERSION` stays; an index without it hides the countdown.
  - **The frozen clock is a React context** (`ServerClock`: an offset live, a fixed time in a replay) read through one hook, replacing the `clockOffset` prop passed down through the HUD.
  - **Built in three commits**, each passing `verify` on its own: the clock and the transport slot in `GameView`, the pure transport logic, then the page and its UI.

### 5. (#371) All-seeing details in the HUD. Size M. Label `leak-risk`.

The overlays from the suggestions, shown only when the page passes a `reveal`, which only the replay page does.

- **Crew:** a role badge (human, alpha Mush, beta Mush) on portraits and in the room list. The inspect panel for anyone shows spores or contamination, HP, morale, AP, MP, private statuses and inventory, reusing the panels a player sees for themselves.
- **Account names** may show in a replay (owner, 2026-11-05): hiding them matters only while a game runs. The full view holds them (`Seat.name`); they are always shown through `moderateName`, the end screen's filter. A moderator's uncensored view is later, not in this epic.
- **Visibility badges:** a small badge on every log line and message that wasn't public: private (padlock), secret (hushing hand), covert (camera), each its own badge, the same icons the action buttons use (`VISIBILITY_ICONS`; owner, 2026-11-05), and the same badge the live log will show once lines carry their kind, showing whether a secret or covert line leaked (reached anyone besides the actor), with a tooltip naming who saw it (for example "Seen by: Kuan Ti, Paola"). A private channel's messages carry the channel's name.
  - **Needs a prerequisite:** a log line doesn't record its kind today, only `visibleTo` and `level` (and `level: "warning"` marks both a leaked secret or covert line and an alarm). The owner will add the kind and whether it leaked to the log entry and the view (2026-11-05; #366, with a live UI later). Story 5 reads those fields.
- **Pips:** story 1's marks drawn on the step scrubber for the loaded cycle, coloured by kind, each with a label for screen readers.
- **Click to jump:** a log line or message jumps to the step that wrote it (`lineStep`).
- **Leak-check:** the component props: `reveal` is optional everywhere and `GameScreen` never passes it.

### 6. (#372) Links to replays. Size S.

- `/games`: each entry links to `/replay/<id>` (`GamesPage.tsx` already plans for it).
- The end screen: a "Watch the replay" link. `GameScreen` passes `ticket.roomId` to `GameView`, and `GameView` hands it to `EndScreen`. Story 3's "Preparing replay…" handles a copy that isn't confirmed yet, so the end screen doesn't need to know whether it is.
- The replay page links back to `/games`, and to `/` for a single-player game.
- In-game the end screen stays as it is. In a replay, at the last step, it shows with its close button, as it does live.

## Risks and later

- **Ordering with the prerequisites:** if a story lands before #355, the log ids or the window, whichever comes second carries the change. Keying everything by id from the start keeps that change small.
- **The scope of `HistoryError`:** `perspective` catches an old state shape that makes `viewFor` throw. An old shape that `viewFor` reads without throwing but gets wrong would show a wrong view. Accepted for now: the databases are empty, and nothing has been released.
- **Later, not in these stories:** a time scrubber (decided as later, 2026-11-01), share links for single-player replays, a free camera over the whole ship, and spectating a running game (never: hidden information).
