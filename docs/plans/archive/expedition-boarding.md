# Expeditions: instant landing, boarding the Icarus, next-sector sight, one-sector Sabotage

Handoff plan, 2026-11-17. Every rule below was decided by the owner in conversation on 2026-11-17; none is open.
Follows `docs/plans/archive/expedition.md` (phases 1-5) and closes the last "not built" note of slice D (#358).

## Decisions (owner, 2026-11-17)

1. **Instant landing.** The landing event resolves at takeoff, not `stepMs` later. The first sector comes one
   `stepMs` after takeoff. Same for patrol-ship solo landings (`land_on_planet`). The owner says the delayed landing
   was never intended.
2. **Traitor's Sabotage covers the next sector only.** Still free, secret, unrecorded and once per expedition. This
   corrects the 2026-11-08 reading ("from the next step on, every sector"), which was a misstatement.
3. **U-turn and Traitor holders see the next sector**, as in eMush: the tag of the next sector, shown only while it
   is next, to a holder still with the crew (`onExpedition`: not lost, not dead). This includes patrol-ship solo
   landings. **No UI work:** the owner is redoing the UI, so this only goes into `PlayerView`.
4. **Boarding the Icarus.** The Icarus becomes a room you board, like a patrol ship:
   - **`board_icarus`**: a free action, targeted on the Icarus (`ICARUS:ICARUS_COMMAND`) in the Icarus Bay. It is
     allowed only:
     - while the Icarus is docked (not away, not lost);
     - while the ship orbits a planet with an unexplored sector;
     - while there is room aboard (`maxCrew`, 6 with `ICARUS_LARGER_BAY`);
     - if the planet has an Oxygen sector **or** the player carries a working spacesuit. We have no "worn" state;
       carrying one is the equivalent.

     It writes a **public line in the bay** ("X boards the Icarus").
   - **`leave_icarus`**: a free action from inside the docked Icarus, back to the bay. It writes a public line in the
     bay.
   - **Takeoff from inside.** `icarus_takeoff` works as now (same AP cost, `PATROL_SHIP_LAUNCHER` modifier, anyone who
     `canFly`), but only from inside the docked Icarus. The crew is whoever is aboard, launcher first; `pickCrew` and
     its random pick are gone.
   - **Spacesuit recheck at takeoff** (option A): on a planet with no Oxygen sector, anyone aboard without a working
     spacesuit (say green jelly broke it after they boarded) is put off in the bay, with a private line saying why.
     If the **launcher** is the one without a suit, the takeoff is **refused** (`no_spacesuit`).
   - **A spacesuit that breaks once the expedition is under way changes nothing.**
   - **No dropping while docked aboard:** `drop` is refused inside the Icarus room while it is docked. The ban
     already in place while away is unchanged. Handing items over (`transfer.ts` other than `drop`) stays allowed;
     the takeoff recheck covers a suit handed away.
   - **Leaving orbit or jumping** (`travel.ts`, `leave_orbit.ts`, through `strandExpedition`) moves everyone aboard
     the docked Icarus back to the bay, with a private line.
   - The old **suitless** mechanism goes away: `ActiveExpedition.suitless`, `explores` (now just `withCrew`), the
     `noSpacesuit` and `grounded` report lines at takeoff, and "with nobody suited the expedition ends at once". Keep
     the `noSpacesuit` and `grounded` event kinds and their locale strings, because old stored reports contain them.
     Nothing produces them any more.
   - **Bots:** "board, then launch". The launcher bot boards and then takes off. Crew bots that answer a summon walk
     to the bay and board.

Claude's readings (not asked; flag them to the owner if they matter):

- Boarding is allowed while a patrol ship's solo expedition is out; only the takeoff is refused then
  (`expedition_away`).
- When the last living person leaves the docked Icarus (by `leave_icarus` or being put off), whatever is on its floor
  (a body, say) goes onto the bay's floor, so nothing is left in a room nobody can reach.
- Sprinter now counts every member at takeoff. Before, it counted only those who explored, but everyone aboard is
  suited now.
- A Sabotage can no longer touch the landing, since nobody can act before it resolves.
- The next sector is shown from takeoff on, since the landing is already over by then.
- **Leak accepted (owner, 2026-11-17, after the leak check):** boarding's spacesuit check counts unrevealed sectors
  (`needsSpacesuit`), so whether `board_icarus` is offered to someone without a suit shows, for free, whether the planet
  has an Oxygen sector. The owner keeps it as is.

## State of the working tree (uncommitted, partly done)

**Another session is editing this checkout at the same time** (ceasefire: `shared/src/actions/ceasefire.ts`,
`ceasefires` in `GameCore`, `ceasefireUsed` on players, locales, `GameView.tsx`, ...). Some of its edits sit in the
same files as this work (`types/state.ts`, `normalizeState.ts`). Don't revert whole files. Commit only the hunks that
belong to this work.

Done so far for this plan, untested and not yet compiling:

- `shared/src/expeditions.ts`:
  - New: `aboardIcarus`, `icarusDocked`, `boardRefusal`, `leaveIcarus(state, p, quiet?)`, `disembarkAll` (called at
    the top of `strandExpedition`), `nextSectorFor(state, p)`, and `land` (the landing, split out of `expeditionStep`).
  - `runExpedition`:
    - rewritten: the spacesuit recheck, the crew taken from `aboardIcarus`, the landing at once;
    - with `instantExpeditions` it runs to the end; it returns at once if there's no sector or nobody is left;
    - `board(p, craft)` is gone for the Icarus, since the crew is already aboard.
  - `expeditionStep` now handles sectors only, and clears `sabotageNext` after each sector.
  - `returnExpedition` lost its `landed` parameter, and its "never touched down" patrol branch is gone.
  - `turnBack` calls `returnExpedition(state)`.
  - `expeditionReturnAt` is `nextAt + (sectors.length - 1) * stepMs`.
  - `explores` is removed; its callers use `withCrew`.
  - `resolve` reads `sabotageNext`, and `sabotage` sets both flags.
  - `pickCrew` is removed.
  - The header comment is updated.
- `shared/src/types/state.ts`: `ActiveExpedition` lost `landed` and `suitless` and gained `sabotageNext`.
- `shared/src/normalizeState.ts`:
  - `STATE_VERSION` is 121, with `upgradeTo121` dropping `game.expedition.landed`/`suitless`.
  - The normalizer is updated: `sabotageNext` defaults to `raw.sabotaged === true`, so an expedition sabotaged
    before the change keeps its next sector covered.
  - **The step bumps the version: it must land in a deploy of its own** (`docs/ops/deploy.md`).

Log keys used but not yet in the locales: `icarusLeft` (public, `{ name }`), `icarusDisembarked` (private, no
params), `icarusNoSpacesuit` (private, `{ planet }`). Still needed: `icarusBoarded` (public, `{ name }`), used by
`board_icarus`.

## Remaining slices

**Slice 1 is done** (2026-11-17, uncommitted): `shared` and `npm run typecheck` are clean. `infantryman`,
`takeoffThruster` and `mush_skills` tests are updated (Traitor and U-turn are now "full"). Still failing, as expected:
`shared/tests/expeditions.test.ts` (slice 5) and the two `expeditionLaunch` cases in `server/tests/goals.test.ts`
(slice 4). `server/tests/reportShare.test.ts` and `leakFields.ts` already have the new `ActiveExpedition` shape. The
drop ban uses the existing `on_expedition` code. The old `noSpacesuit`/`grounded` comments in `types/config.ts` and
`types/state.ts` now say they're only in old reports.

### 1. Rules (`shared`) (done)

- **`actions/board_icarus.ts`** (new): `{ type: "board_icarus"; equipment: string }`, free.
  - `getCandidates` and `validate` use `boardRefusal` plus the old `icarusHere` check (the equipment is in the
    player's room). Move `icarusHere` out of `icarus_takeoff.ts` or share it.
  - `apply`: `endPushToLeave`, then `logPublic(state, bay, "icarusBoarded", { name })`, then
    `board(p, config.expedition.craft)` from `actions/takeoff.ts`. Log first, then move, as patrol takeoff does.
- **`actions/leave_icarus.ts`** (new): `{ type: "leave_icarus" }`, free, untargeted (it shows when you select
  yourself).
  - Valid while alive in `config.expedition.craft` and `icarusDocked`.
  - `apply`: `leaveIcarus(state, p)`.
- **`actions/icarus_takeoff.ts`**: make it untargeted (`{ type: "icarus_takeoff" }`, no `equipment`).
  - Valid only in `config.expedition.craft` while `icarusDocked`.
  - Keep `cant_fly`, `icarus_lost`, `icarus_away`/`expedition_away`, `not_in_orbit` and `explored`.
  - Add `no_spacesuit` when `needsSpacesuit(planet) && !hasSpacesuit(state, p)`.
  - Keep exporting `ICARUS_EQUIPMENT`, which `rules.ts` and `InspectPanel.tsx` use.
  - A changed `Action` shape needs no state step, since the queue is dropped on load. Update the
    `icarus_takeoff` sample in `shared/tests/protocol.test.ts` and `web/src/designKit/samples.ts:105`. That design-kit
    sample must board first now.
- **`actions/land_on_planet.ts`**: no rule change. Its comment still compares with "the Icarus, whose suitless
  members just stay aboard"; reword it.
- **`actions/transfer.ts:32`**: also refuse `drop` when `player.room === state.config.expedition.craft` (docked).
  Same reason code `on_expedition`, or a new `in_icarus`.
- **`actions/sabotage_expedition.ts`**: update the doc comment ("the next sector only").
- **Register** `board_icarus` and `leave_icarus` in `ACTIONS` (`shared/src/actions.ts`), `ACTION_NAME_KEYS`
  (`web/src/i18n/names.ts`) and `SAMPLES` (`shared/tests/protocol.test.ts`). The compiler flags each one that's
  missing.
- **View**: add `next?: PlanetTag` to `PlayerView["expedition"]` (`types/view.ts:364`), filled in `expeditionView`
  (`rules.ts:~900`) with `...(nextSectorFor(state, you) && { next: ... })`.
- `grep -rn "landed\|suitless\|explores\|pickCrew" shared server web` for leftovers. `death.ts` and `patrol.ts`
  comments mention landing; check `onPlanet` handling, since U-turn before the landing no longer exists.
- `skills.ts:291-294`: `fast_backward` and `traitor` are now fully built; drop "not seeing the next sector".

### 2. Locales (en/fr/es; `i18n` skill)

- Log lines: `icarusBoarded`, `icarusLeft`, `icarusDisembarked`, `icarusNoSpacesuit`, next to `icarusTakeoff`
  (`web/src/locales/*.json` ~1204).
- Action names: `actions.board_icarus`, `actions.leave_icarus` (near `actions.icarus_takeoff` ~441).
  `icarus_takeoff`'s label "Launch an expedition" still fits.

### 3. Client, minimal (keeps it playable only; no design work) (done)

Done 2026-11-17 in the `icarus-boarding` worktree: `GameView` shows `IcarusPanel` while away or in `ICARUS_CRAFT`
(`ICARUS_CRAFT` is now exported from `shared`); docked, the panel shows the room name, `icarus_takeoff` and
`leave_icarus` as `ActionButton`s, and who is aboard. `verify:web` and `build` pass. Also fixed slice 1's two lint
errors in `expeditions.ts` (unused `shipState` and `rollShuffle`).

The docked Icarus is the room `ICARUS_CRAFT`, which has no iso layout. In `web/src/GameView.tsx:~242`, show
`IcarusPanel` whenever `you.room === ICARUS_CRAFT`, not only while `view.expedition?.report` is set. Let the panel
take a null `expedition`: no countdown or report while docked, and two `ActionButton`s for `leave_icarus` and
`icarus_takeoff` taken from `view.actions`. Nothing more; the owner is redoing this UI. Don't render `next`.

### 4. Bots (`server/src/bots/goals/expeditionLaunch.ts`; `bot` and `bot-strategy` skills) (done)

Done 2026-11-17 in the worktree; `server` tests, typecheck and lint pass:

- `expeditionLaunch`: on a planet with no Oxygen sector (by the shared planet; unknown counts as airless) the Pilot
  first picks up a spacesuit, from the floor or the nearest room bots know holds one. With no suit to be had, it gives
  up for this orbit before summoning, so it doesn't summon a crew it can't fly. Otherwise it walks to the bay and
  summons. During the cycle of the summons it waits while summoned holders stand in the bay, so they can board. Then
  it boards and takes off from inside. A Pilot short on AP boards and waits aboard.
- `expeditionPrep`: a ready holder in the bay boards once the plan's author is in the bay or aboard (or is dead or
  unknown; the author is now remembered in `ExpeditionPrepMemory`). It waits aboard at most `ICARUS_BOARD_WAIT_CYCLES`
  (3), then gets off, gives up on the plan, and picks its iTrackie back up. Boarding as soon as they reached the bay
  made the crew time out before the Pilot came (survival seed 11).
- New `leaveIcarus` goal (priority 101, above every other): it gets any bot aboard the docked Icarus off when it isn't
  a launcher who can still take off and isn't crew still waiting. Nothing else can be done from inside.
- `WanderBot` only moves, so it never boards.
- Survival harness, seeds 1-12, against `main`: 13 expedition reports shared vs 12; days lasted mean 4.93 vs 4.95,
  same endings.

The original notes:

- The launcher's flow becomes: walk to the bay, `summon` (if they wrote the plan), `board_icarus`, then
  `icarus_takeoff` from inside.
  - `options` checks `offered(view, "board_icarus")` in the bay, or `icarus_takeoff` once aboard.
  - The "can't take off" memory (`noTakeoffKey`) applies to both.
- Crew bots that answer the expedition plan's summon must board when they reach the bay. Find the goal that walks
  them there (grep `summon`/`expedition` in `server/src/bots/`).
- Make sure no bot sits in the docked Icarus forever. If the launch never comes, `leave_icarus` after a while, or
  when the plan closes.
- `WanderBot` takes any legal action. Check that it can't get stuck aboard (it can always `leave_icarus`).

### 5. Tests (`shared/tests/expeditions.test.ts`) (done)

Done 2026-11-17 in the worktree; `npm run verify` passes (one run hit a timing flake in the model-bot backoff test of
`server/tests/GameRoom.test.ts`, which passes alone and on the rerun). `go()` now boards (`aboard()`: the launcher
first, then everyone in the bay who may) and takes off from inside; `why()` reads an action's refusal code. Every item
below is covered. The suitless tests became the takeoff recheck, the launcher's `no_spacesuit` and "a suit that breaks
while away changes nothing"; "the suitless list never reaches a view" and "with nobody suited..." are gone (boarding
refusals cover them). `leakFields.ts` was already updated in slice 1; `replay.test.ts` builds no Icarus action.

The original notes:

The fixture `game()` puts p0-p3 in the bay (`ICARUS`) and gives everyone a spacesuit; `go()` takes off from the bay.
Change `go()` to board each bay player (p0 first) and then take off from inside. Then:

- **Rewrite**:
  - "takes everyone in the bay...": now everyone aboard.
  - "takes at most maxCrew": now a boarding refusal (`icarus_full`).
  - "takes the crew into the Icarus... until the landing a step later" (~526): the landing is in the report at
    takeoff, and the first sector is at `T0 + step`.
  - The return-time and `nextDue` expectations in phase 2.
  - The slice C suitless tests (~962, ~991, ~1072): they become boarding refusals and the takeoff recheck.
  - Sprinter "one left in the Icarus without a spacesuit doesn't" (~1188).
  - Traitor (~1233, ~1257): only the next sector is negative, the one after is drawn as usual, still once per
    expedition.
  - "nothing can be dropped..." (~1475): add the docked Icarus.
- **New**:
  - Boarding: each refusal (not in the bay, Icarus away or lost, not in orbit, all explored, full, no suit on an
    airless planet), allowed on an Oxygen planet without a suit, the public lines, and free.
  - `leave_icarus`: the public line; the floor is emptied into the bay when the last person leaves.
  - Takeoff from the bay is no longer offered.
  - Recheck: a jellied suit aboard (break it) means put off at takeoff with the private line; a launcher without a
    working suit is refused; a suit that breaks while away changes nothing.
  - Leaving orbit or traveling with people aboard the docked Icarus moves them to the bay with the private line.
  - Instant landing kills the whole crew: the crew is back at once (bodies in the bay).
  - Patrol solo landing: the landing is in the report at once.
  - Next sector: a U-turn holder and a Traitor see `expedition.next` equal to the tag of `planet.sectors[sectors[0]]`.
    Nobody else sees it: a member without the skills, a non-member, a lost holder, a dead holder. It follows the
    redraw after someone gets lost, and is absent once the crew is back. It also works for a patrol-ship pilot with
    either skill.
  - A Traitor's view after Sabotage shows no trace of it (extend the existing test).
- `shared/tests/leakFields.ts:75`: update the `expedition` note: `landed`/`suitless` gone, `sabotageNext` never
  sent, `next` (tag) only to a qualifying holder.
- `shared/tests/replay.test.ts`: if `randomInput` builds `icarus_takeoff`, give it the new shape and add the two new
  actions.
- `server/tests/storedRooms.test.ts` must pass with `upgradeTo121` (its `paths` are declared).
- While iterating: `npm test -w shared -- expeditions.test.ts`.

### 6. Docs and wrap-up (done except the commit)

Done 2026-11-17 in the worktree: `implemented-rules.md` (a new "boarding the Icarus and instant landing" entry; phase 1, phase 2, slices C and D and phase 5 point to it), `expedition.md` (a new section; superseded lines marked), `rules-design.md` (the decisions, with the Traitor correction), `code-map/shared.md`. Leak check, `npm run verify`, `npm run build` and the workflow log entry are done. The commit waits for the owner.

The original notes:

- `docs/rules/implemented-rules.md:134` (slice D): Traitor covers the next sector only; both skills see the next
  sector; drop "Not built: ...". Update the phase 2 and slice C bullets for the instant landing and boarding (grep
  `landing` and `suitless` there).
- `docs/plans/archive/expedition.md`: decisions 6-7 and "Build order", plus phase 2's "landing a step later" and slice C's
  suitless text.
- `docs/rules/rules-design.md`: add the 2026-11-17 decisions to "Decisions received", including the correction of the
  2026-11-08 Traitor reading.
- `docs/code-map/shared.md`: the two new action files.
- `leak-check` skill (the view changed), then `npm run verify` and `npm run build`. If `verify` fails in the
  ceasefire files, that's the other session's work; report it and don't touch it.
- Append one entry to `docs/process/ai-workflow.md` with `cat >>`.
- Commit when the owner asks. Suggested split if feasible: (a) instant landing + one-sector Sabotage + `next` in the
  view; (b) boarding + bots + client stopgap. Note in the commit message that `STATE_VERSION` 121 needs a deploy of its
  own.
