# Handoff: #370, the replay page and transport

Build plan for [#370](https://github.com/nearbear/mush2/issues/370) (story 4 of [#156](https://github.com/nearbear/mush2/issues/156)). Written 2026-11-08 from a read of the code at `0fd91c4`. The spec is `docs/plans/replay-viewer.md`, story 4, including the owner's decisions of 2026-11-08 at its end; this file is only the build order. Work on `main`, three commits, each passing `npm run verify` on its own (plus `npm run build`, since `web` changes).

## Housekeeping first

- [#369](https://github.com/nearbear/mush2/issues/369) is built (`72344e6`) but still open: close it and tick it in #156's checklist.

## What already exists (don't rebuild)

- `web/src/replay/useReplay.ts`: index, summary, chunk fetching and cache, settle debounce, 409 and 429 retries, the step's view. It gives `status`, `index`, `summary`, `position`, `cycle`, `step` (`seq`, `chunk`, `at`, `view`, `build`), `stale`, `view` (`StepView`: `{ view: SeatView, reveal }`), `olderBuild`, `seek(seq)`, `retry()`. Options: `{ start, seat, allSeeing }`.
- `web/src/replay/replayState.ts`: `lastSeq`, `clampSeq`, `chunkOf`, `cycleAt`, `stepAt`, `LoadedChunk` (`frames`, `at`). The reducer's `chunks` aren't returned by the hook yet: expose `chunks` (read-only) for the marks and the switcher.
- `web/src/replay/ReplayNotice.tsx`: `ReplayNotice` (every non-ready status) and `OlderBuildBadge`.
- `shared/src/replayView.ts`: `stepMarks(frames, firstStep, before?)` (`Mark { step, kind }`, kinds `death | conversion | fire | chat | cycle | other`), `seatsAt(full, index)` (`SeatAt { seat, body, character, start, moved }`), `lineStep` (story 5).
- `shared/src/helpers.ts`: `dayOf({ cycle, config })` gives `{ day, cycleOfDay }`.
- `GameView` (`web/src/GameView.tsx`) is already read-only without `send`: no actions, no channels, no tip card, no body-taken dialog. `SeatView` is `PlayerView` with log and chat ids, so it can be passed as `view`.
- Base UI `slider`, `select`, `menu`, `toggle-group`, `popover` are installed. No new dependencies.

## Commit 1: a frozen clock and a transport slot in `GameView`

Live play must look and behave exactly as before.

1. **`ServerClock` context** (new, e.g. `web/src/hud/serverClock.ts`): value `{ offset: number } | { frozen: number }`. `useServerNow(tickMs?)` returns the server time: `Date.now() + offset`, re-rendering every `tickMs` when asked (the countdown's 1 s); the fixed time when frozen, never ticking. Default context: `{ offset: 0 }`.
2. `GameView` takes `clock?: ServerClock` instead of `clockOffset` and provides it. `GameScreen` passes `{ offset: clockOffset }`.
3. Remove the `clockOffset` prop from `TopBar`, `CycleCountdown`, `ShipResources` (`ExpeditionAway`), `IcarusPanel`, `LeavingIsoRoom`/`IsoRoom`, `SceneOverlay`, `ActionBar`; they read the context. Also `web/src/designKit/HudSections.tsx` (it passes `clockOffset={0}`).
   - `useCountdown(at)` reads `useServerNow(1000)`.
   - `ActionBar`: elapsed from the clock. When frozen, add `animation-play-state: paused` and key `Timed` by the frozen time too, so each step re-renders the bar at its point.
   - `recentDoorMoves(view.log, view.players, now)` in `GameView` uses the clock's time.
4. **`transport?: ReactNode`** slot: desktop, between `TopBar` and `.three-panel`; phone (`useMobile()`), just above `BottomNav`, outside the panels so every tab keeps it. Phone layout CSS in `web/src/styles/responsive.css` (the strip's height must come out of the panel area, not overlap it).
5. **Walks:** check that `web/src/iso/useWalkers.ts` snaps when the view jumps (stepping back, a cycle jump). If it doesn't, add `snapWalks?: boolean` to `GameView`, passed down like `teleport`, and have the replay set it on any move that isn't a single step forward.
6. **Screen readers:** stepping through frames must not fire the live announcements (`RoomList`'s `announce`, the log announcer in `web/src/announce.ts`). Check, and turn them off when read-only if they fire.
7. Tests: `useCountdown` and `ActionBar` frozen (no tick, paused at the right point); live unchanged.

## Commit 2: the transport logic, pure (`web/src/replay/transport.ts`, tests in `web/tests/replay/transport.test.ts`), and the index's `realTime` flag

- **`marksOf(chunks, index)`**: `stepMarks(chunk.frames, info.firstInput, chunks[n - 1]?.frames.at(-1)?.view)` per loaded chunk, memoized per `LoadedChunk` (`WeakMap`).
- **`EVENT_KINDS`** = `death`, `conversion`, `fire`, `chat` (owner, 2026-11-08). Skip stops are every mark; events are marks of these kinds only.
- **`nextStop(pos, mode)`**, mode `raw | skip | event`:
  - raw: `pos + 1` (clamped; null at the end).
  - skip: the next mark after `pos` in loaded chunks; past the last loaded mark of the current chunk, the next chunk's `firstInput` (it starts a cycle, so it's a stop known from the index alone). Null if `pos`'s chunk isn't loaded (the button waits).
  - event: the next event mark in the loaded chunks; if none is loaded ahead, the next chunk's `firstInput` so playback moves on and loads it (document this in the function).
- **`prevStop(pos, mode)`**: the same backward; for skip and event with the previous chunk not loaded, that chunk's `firstInput`. The launch state (-1) is the first stop.
- **Cycle jumps:** `cycleStart(index, n)` = `index.chunks[n].firstInput`; PageUp/PageDown go to the previous/next chunk's start (PageUp within a cycle goes to its own start first).
- **Labels:** `dayOf({ cycle, config })` with `cycle` from `cycleAt(index, pos)` and `config` from the shown frame (fixed for a game), so the label follows the thumb while dragging.
- **Playback:** `playInterval(speed, skip)` = `1000 / speed` with skip, `250 / speed` raw (1×, 2×, 4×). The page's timer doesn't advance while `stale` and stops at `lastSeq`.
- **URL:** `parseReplayParams(search)` and `replayParams({ input, seat, reveal })`: `?input=<seq>&seat=<seat>&reveal=1`, `input=-1` the launch state, `reveal` only when all-seeing. Round-trip tests, junk values ignored.
- **Keyboard:** `ownsKey(target, key)`: true (leave it alone) inside `input`, `textarea`, `select`, `[contenteditable]`, `[role=slider]`, `[role=tablist]`, a Base UI scroll area, and for Space on a `button`. Bindings: ←/→ step, Shift+←/→ event, PageUp/PageDown cycle, Space play/pause.
- **Real-time flag (owner, 2026-11-08):** `ReplayIndex.realTime?: boolean`, true when the game's cycles ran on a clock. Written by the server: `replayIndex` (`shared/src/replayChunks.ts`) takes it in `meta`; `server/src/replayStore.ts` passes `!singlePlayer` (the room's flag; `GameRoom.nextCycleAt()` already returns null for single player). Optional, so no `HISTORY_VERSION` bump; missing means no countdown. Add it to the index's schema in `server/src/apiSchemas.ts`/`openapi.ts` if the index is described there, and a test in `server/tests/replayRoutes.test.ts` or the store's tests. It is not hidden information (a single-player replay is private to its player anyway), but say so in the leak-check.

## Commit 3: the page, the transport UI, the route

1. **Route:** `/replay/:id`, lazy, in `web/src/main.tsx` beside `/games`.
2. **`web/src/replay/ReplayPage.tsx`:**
   - Reads `?input&seat&reveal` once for `useReplay(id, { start, seat, allSeeing })`. Defaults: all-seeing, the index's first seat, `input=-1`.
   - Writes position, seat and mode back with `setSearchParams(…, { replace: true })` (Back leaves the page).
   - Not ready: `ReplayNotice`, with a link back to `/games`.
   - Ready: `GameView` with `view={replay.view.view}`, no `send`, `clock={{ frozen: step.at }}`, `nextCycleAt` = `index.realTime ? index.chunks[step.chunk + 1]?.from ?? null : null`, `onLeave` to `/games`, the `transport`, and a `data-stale` wrapper or class that dims the stage while `stale`.
   - Doesn't pass `reveal` to anything (story 5).
   - Playback timer here (`setInterval` from `playInterval`, cleared on pause, end, unmount); the keyboard listener on `document` filtered by `ownsKey`.
3. **`web/src/replay/Transport.tsx`:**
   - Desktop bar: cycle select · cycle scrubber (Base UI slider over chunk numbers; drags call `seek(firstInput)`) · step ◀ ▶ · event ⇤ ⇥ · play/pause · speed 1×/2×/4× · skip toggle (on by default) · perspective switcher · mode badge · `OlderBuildBadge` when `olderBuild` · a small summary line (date, winner) from `replay.summary`.
   - Phone strip: step ◀ · play · step ▶ · cycle label · switcher; a "⋯" Base UI menu with speed, skip, events, cycle select and the summary.
   - Switcher: "All-seeing" (a toggle) plus each `seatsAt(readFrame(step), index)` entry as its current character; a moved seat reads "now in X (started as Y)". Badge: "All-seeing · following X" or "Seen by X".
   - A polite status line, "Day 2 · cycle 3", for screen readers.
   - Every control has an accessible name.
4. **i18n:** every string in `web/src/locales/{en,fr,es}.json` (the `i18n` skill).
5. **Docs:** `docs/code-map/web.md` (the new files), `docs/process/testing.md`, story 4's "As built" in `docs/plans/replay-viewer.md`; tick #370 in #156.

## Checking it end to end

- Replays should work in dev: `wrangler dev` simulates the `REPLAYS` R2 bucket locally (not checked yet). What's missing is a quick, documented way to get a game to its end in dev so it is copied: `docs/process/commands.md` has none, and no cheat ends a game (win conditions: return to Sol, all humans dead, ship destroyed). Look at `CYCLE_SECONDS` (short cycles), the test environment's End cycle, and the cheats, pick the shortest route to a finished multiplayer game and a finished single-player one, and add it to `commands.md`. If there is no short route, ask the owner before adding a dev-only way to end a game.
- `play` skill: `/replay/<id>` on desktop and at phone width: step, events, cycle jumps, scrubber drag (dimmed stage, label under the thumb), play at each speed, skip on/off, seat switch, a Transfer if the game has one, a deep link reopening the same moment, Back leaving the page, the countdown frozen (multiplayer) or hidden (single player).
- Run the `leak-check` skill at the end: nothing is revealed in this story, but the page reads the full view.
- One `docs/process/ai-workflow.md` entry for the whole story (`cat >>` only).
