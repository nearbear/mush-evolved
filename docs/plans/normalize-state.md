# Normalizing stored state, phase 2 (#384)

Status: planned 2026-11-07, built 2026-11-07 (all six steps of the order of work; phase 3 built 2026-11-07, see "Phase 3 as built"; phase 4 built 2026-11-07, see "Phase 4 as built"; phase 5 built 2026-11-07, see "Phase 5 as built" at the end). The approach, phases and amendments are in [#384](https://github.com/nearbear/mush2/issues/384) (body and the 2026-11-07 review comment), which this plan doesn't repeat. Phase 1 (`Spot.kind`) is built (`a93db37`). Decisions 1, 2 and 3 below are the owner's (2026-11-07). Steps 1 (the types), 2 (helpers and normalizers, `normalizeCore` and `normalizeGame`), 3 (`normalizeFullView`, `overridesOf`, the queue mode), 4 (the upgrade steps, `STATE_VERSION` moved) and 5 (`onStart` wiring, the `dropQueues` record, the `GameRoom` tests) of the order of work are built. Notes from step 2: the exhaustiveness check is `raw.kind satisfies undefined` (under `Partial`, what is left once every variant has a case is `undefined`; the plan's `satisfies never` doesn't compile there); the queue mode is `QueueMode`, passed to `normalizeCore` as a third argument next to `ctx`; the section 8 tests that cover step 2 (round trip, idempotent, unions, `null`, undefined keys, no nullish-coalescing) are written, plus a hand-filled round trip for the collections the random game leaves empty. Notes from step 3: `overridesOf` returns through `stripUndefined<ConfigOverrides>` (every key named) rather than `AllKeys<Required<…>>`, since a key an old config lacks, a `null` setup and a `null` pre-selection all leave the override unset; the `FullView` round trip, idempotence, kept queues and config rebuild tests are written. Notes from step 4: the step type is `UpgradeStep` and the list `UPGRADE_STEPS` (exported, so a test checks it stays in order and within `STATE_VERSION`); `upgrade` takes the steps as an optional third argument for the fake-step tests, which use steps at `STATE_VERSION - 1`, `STATE_VERSION` and 999 rather than only 999 (a step above `STATE_VERSION` never runs). `normalizeState.ts` is now exported from the shared index; `GameRoom.ts` and `stateShape.test.ts` import `STATE_VERSION` from `@mush2/shared`. Notes from step 5 (decision 2 amended by the owner, 2026-11-07): one server input, `{ type: "dropQueues" }` (`queue.ts`), replaces the `clearQueue` per seat in section 6. With one `clearQueue` per seat and the loaded view on the first, the history between them was wrong whenever two or more players were mid-action (the loaded view already had every action dropped). `dropQueues` empties `current` and `queue` for every player, exactly as `normalizeGame` does, so it also no longer depends on `resolveAt`. `pendingSeats` became `hasQueues`; `GameRoom.recordDropped` writes the input in one `persist` with the snapshot, carrying the view as loaded and no change. A unit test checks `dropQueues` gives what `normalizeGame` gives. Notes from step 6: the section 8 tests had landed with steps 2 to 5; step 6 added a round trip of every variant of every union (a sample per variant, keyed by its discriminant so a new variant doesn't compile without one), since the random game and the hand-filled test reach only some of them. Verify and the leak check passed.

## Scope

In this phase:

- Restructure the types (`GameCore`, `FullView`, `StoredRoom`).
- `shared/src/normalizeState.ts`: helpers, one normalizer per stored type, the upgrade-step mechanism, and `STATE_VERSION`.
- Drop the action queue on load.
- `onStart` calls the normalizer only on the path that loads a same-version snapshot today.

Left for later phases:

- Phase 3: what happens on a throw or a too-new version, `perspective` normalizing frames, and version stamps on `base` steps and the index.
- Phase 4: the committed fixtures, the five tests from the issue, and removing `state-shape.json` and its test.
- Phase 5: docs and skills.

**The stored shape doesn't change.** `STATE_VERSION` moves to `shared` and stays at **114**. `server/tests/stateShape.test.ts` stays until phase 4; only its import changes.

## 1. Types

- **`GameCore`** (`shared/src/types/state.ts`): every `GameState` field except `config`, `rng` and `chatOutbox`. The doc comments move with the fields.
- **`GameState extends GameCore`**, adding `readonly config`, `rng` and `chatOutbox`.
- **`FullView extends GameCore`** (`shared/src/fullView.ts`), adding `readonly config` and `starts`. Today it is `Omit<GameState, "rng" | "chatOutbox">`, so it still carries `config` (section 4).
- **`StoredRoom`**: the server's `Stored` wrapper in `server/src/GameRoom.ts`, renamed. `game` stays `Omit<GameState, "config">`. Its flat fields keep their ad hoc `?? default` in `onStart`.
- `shared/src/types/config.ts` (the `ConfigOverrides` comment) gets a one-line pointer to `STATE_VERSION`'s new home. The full docs rewrite is phase 5.

## 2. Helpers

At the top of `normalizeState.ts`. The file header records the rule that every union in the stored state has a discriminant, and its normalizer is a `switch` with an exhaustiveness check.

- `type AllKeys<T> = { [K in keyof Required<T>]: T[K] }`. Every normalizer's return literal is annotated with it.
- **Input is `Partial<T>`**: it trusts the shape it was written as and allows missing fields. This is the plainest typing that stays readable (the issue rejected `Raw<T>`).
- `need(raw, key, typeName)` throws `NormalizeError("ItemState.type missing")` when the field is `undefined`. A `null` passes through.
- `added(raw, key, fallback)` defaults a field only when it is `undefined`. `??` never appears in the file (amendment 4); a unit test greps the source for it.
- `stripUndefined(obj)` drops absent optional keys, including the `undefined`-valued keys Durable Object storage keeps through structured clone.
- `dict(raw)` handles dictionaries of primitives (`tokens`, `contamination`, `bonds`, `failureStreaks`, `chatSeq`, `log[].params`, …). It returns a deep copy (`clone`), so the result shares nothing with its input, as `fullViewFor` promises, and memoized replay frames stay safe.
- `mapValues(raw, fn)` handles dictionaries of structs (`equipment`, `patrolShips`, `planets`, `relay.research`, `starts`).
- **An unknown variant throws**: `default: throw unknownVariant(kind satisfies never)`. Narrowing through a destructured `const { kind } = raw` under `Partial<Union>` needs checking. If it doesn't narrow, each branch switches on `raw.kind` directly.

## 3. Normalizers

One per stored type, each a short object literal under `AllKeys`. Names follow amendment 7.

| Group | Normalizers |
|---|---|
| Top level | `normalizeCore(raw, ctx)` returns `GameCore`. `normalizeGame(raw, overrides)` returns a whole `GameState`: it resolves the config itself, so `onStart` no longer adds it. `normalizeFullView(raw)`. `normalizeOverrides` (+ `normalizePreselection`). `normalizeSeatStarts`, used by both `StoredRoom.starts` and `FullView.starts` |
| Player | `normalizePlayer` (with the `Seat` fields), `normalizeSpot` (union), `normalizeDiseaseTracker`, `normalizeAccommodationOffer` |
| Items | `normalizeItem`, `normalizeDebris` (`SpaceDebris`), `normalizeContainer` (union), `normalizePlant` |
| Log and chat | `normalizeLogEntry`, `normalizeChatMessage` (+ `system`), `normalizeChatMark`, `normalizePrivateChannel`, `normalizeThread`, `normalizeSharedPlanet`, `normalizeOutbox` (+ `SealedChatPage`) |
| Plans | `normalizePlan`, `normalizePlanSlot` (union), `normalizePlanTask` (union, 9 variants) |
| Ship systems | `normalizeComms` (+ `RebelCall`, `neron`), `normalizeNavigation` (+ `arriving`, `lastTurn`), `normalizeHunters` (+ `Hunter`, `HunterTarget` union), `normalizePatrolShip`, `normalizeRelay` (`RelayPool`, `ResearchPool`, `RelayToken`, `Sample`), `normalizePilgred`, `normalizeShip`, `normalizeEquipment` |
| Planets and expeditions | `normalizePlanet` (+ sectors), `normalizeExpedition` (+ `ExpeditionEvent`, `fight`, `hurt`) |

- **Fixed-key records**: `bios` (`Record<BiosOption, boolean>`), `titles` (`Record<TitleId, PlayerId | null>`) and `resources` (`Record<ResourceId, number>`) look like dictionaries, but a new key is a type change. Each is written key by key under `AllKeys`, so a new BIOS option, title or resource doesn't compile until it has a default. The issue doesn't name this category.
- **Every current field uses `need()`**, every `next*` counter included: all of them predate the normalizer. "Rebuild a missing counter from its data" applies only to counters added later, and goes in the file header as a rule, not as code nothing calls.
- **Context**: `ctx = { config }` (resolved from the stored overrides) is passed down, so a later `added()` can take its default from the game's own config.

## 4. `normalizeFullView` and its config

A frame stores the whole resolved `GameConfig`, which may predate newer config fields. A shallow merge onto `DEFAULT_CONFIG` misses nested groups, and a normalizer for all of `GameConfig` would be about 600 lines with nothing gained.

`overridesOf(config): ConfigOverrides` reads the override keys back out of the frame's config, checked by `AllKeys<Required<ConfigOverrides>>`, and the result goes through `resolveConfig`. A frame then shows this build's balance numbers, the same as a live game on every reload. One effect: in older frames, `view.actions` costs are this build's.

## 5. Upgrade steps

```ts
export const STATE_VERSION = 114;
type Step = { to: number; run(game: Record<string, unknown>, overrides: Record<string, unknown>): void };
const STEPS: readonly Step[] = []; // upgradeTo115, … in order
export function upgrade(raw: { game: unknown; overrides: unknown }, from: number): void;
```

- Steps work on loose JSON, since they read old shapes. They mutate a copy before normalizing.
- `upgrade` runs every step with `from < to <= STATE_VERSION`, in order. A `from` above `STATE_VERSION` throws `TooNewError`. Nothing reaches that path in phase 2, because `onStart` still discards any other version; phase 3 handles it.
- The list ships empty. A unit test with a fake `upgradeTo999` step covers the order and the range.

## 6. The action queue (decisions 1 and 2, owner 2026-11-07)

**Live game.** `normalizeGame` sets each player's `current: null` and `queue: []`, which keeps `Action` out of the shape the normalizer covers (amendment 5).

**Decision 1, replay frames: copied through untouched.** `normalizeFullView` passes `current` and `queue` through as stored, so a replay still shows action bars. They are display only: if an older `Action` shape breaks `viewFor`, `perspective` throws a `HistoryError` and the viewer shows its "too old to read" summary. So `normalizePlayer` takes a mode (`{ queue: "drop" | "keep" }`) rather than being two functions.

**Decision 2, the record stays exact.** `rebuildGame(setup, record)` must still equal the stored state (`GameRoom.test.ts`, "stores exactly the state its record rebuilds" and the account test after it). Without care, a restart mid-action with no deploy (a crash or eviction) breaks that: the normalizer drops the action, but a rebuild still has `current` set and finishes it. So:

- Before normalizing, `onStart` lists the seats whose raw snapshot has a pending action (`current !== null` or a non-empty `queue`).
- *(Amended 2026-11-07: one `{ type: "dropQueues" }` input instead; see the step 5 notes in Status.)* `onStart` records one `{ type: "clearQueue", by }` input per such seat, in one write with the snapshot. The live room doesn't apply them, because the normalizer has already done the same thing. With `resolveAt: "end"` (`config.action`), `emptyQueue` without `notify` sets `current = null` and `queue = []` and writes no log line. That equivalence depends on `resolveAt`, which no setup overrides: a comment at both places says so.
- The first of these inputs carries the `base` history step (the view as loaded, already without the queue) and no diff. The rest carry no change.
- Nobody is told. The affected players press again (amendment 5).

## 7. `onStart` wiring

```ts
if (stored?.version !== STATE_VERSION) { /* unchanged discard */ }
const pending = pendingSeats(stored.game);          // decision 2
this.overrides = normalizeOverrides(stored.overrides);
this.game = normalizeGame(stored.game, this.overrides);
this.starts = stored.starts ? normalizeSeatStarts(stored.starts) : null;
// … the flat fields as today, then record `pending` as clearQueue inputs
```

`persist()` doesn't change: the next save writes the normalized state, so there is no separate write-back.

**Decision 3 (owner, 2026-11-07): a throw while normalizing is not caught in phase 2.** It propagates out of `onStart` and wedges the room. Phase 3 follows directly and replaces it with amendment 2 (keep the snapshot, refuse connections as unavailable), so a temporary catch-and-discard isn't worth writing.

## 8. Tests

The fixture suites are phase 4. This phase adds:

- **Round trip**: for a fresh 3-seat game and a seeded harness game a few cycles in (#335), `normalizeGame(json(game))` deep-equals the game with `current` and `queue` emptied. `normalizeFullView(fullViewFor(…))` deep-equals its input, queues included.
- **Idempotent**: normalizing twice equals normalizing once, for both.
- **Unions**: an unknown `kind` throws, for each union. A missing required field throws with its type name.
- **`null` survives** (`winner`, `orbit`, `satietyZeroSince`, `lastTurn`), and an `undefined`-valued optional key is removed.
- **No `??`** in `normalizeState.ts`.
- **Steps**: the fake-step test (section 5).
- **`GameRoom.test.ts`**:
  - "restores the game, tokens and input count after a restart" says the stored alarm brings the move back and finishes it. It becomes "drops it": the player is still in the old room, the alarm is the next cycle, and the record holds the `clearQueue` input. The input numbers it asserts shift by one.
  - A new test restarts mid-action and checks that `rebuildGame` still equals the stored state, and that the history rebuilds `fullViewFor` at every step.

At the end: `npm run verify`, the `leak-check` skill (the load path changes; no view should), and one `docs/process/ai-workflow.md` entry.

## Order of work

1. Types (`GameCore`, `FullView`, `StoredRoom`): compile only.
2. Helpers and normalizers, from the leaves (`Container`, `Spot`, `RelayToken`, …) up to `normalizeCore` and `normalizeGame`.
3. `normalizeFullView` with `overridesOf`, and the queue mode.
4. Steps; move `STATE_VERSION`.
5. `onStart` wiring, the queue drop and the `clearQueue` record; the `GameRoom` tests.
6. Unit tests, then verify, leak check and the log entry.

Size: about a day and a half, mostly step 2.

## Phase 3 as built (2026-11-07)

- **Load.** `onStart` drops a snapshot only below `MIN_STATE_VERSION` (114, the first version written with the normalizers; it is how a version bump ends live games on purpose). Otherwise it runs `upgrade`, then the normalizers, into locals; on any throw (`TooNewError`, `NormalizeError`, anything else) the room is `unavailable`: snapshot and record untouched, `console.error` starting `UNAVAILABLE`, sockets closed with 4002 "Ship unavailable" (the client goes back to the lobby like 4001), `join` answers `ship_closed`, `setup` throws.
- **Accounts stay aboard (owner, 2026-11-07).** `resume` answers `{ ok: false, unavailable: true }`; the matchmaker keeps the `account_ships` row and sends the error `ship_unavailable` (on `resume` and on `queue`; the lobby goes back to the ship list with the message, en/fr/es). `seatAccounts` throws, so the daily sweep skips the ship. Players can't board another ship until a build reads theirs.
- **Stamps.** `BuildStamp` (`stateVersion`, `rulesVersion`) goes on every step that carries a copy, `full` as well as `base`, not only on room starts as the issue says: a chunk starts at a cycle's `full`, and must say which build recorded it without the chunk before. The replay index records `stateVersion` (the build that wrote it); its `rulesVersion` stays the launch build's. No `HISTORY_VERSION` bump: the stamp is optional on read.
- **Frames.** `rebuildHistory` gives each frame its copy's stamp (`build`, null for copies from before stamps, which `readFrame` reads as `MIN_STATE_VERSION`). `readFrame(frame)` (viewHistory.ts) runs `normalizeFrame` (the steps on a copy, with the overrides read back from the frame's config, then `normalizeFullView`), memoized per recorded view, and turns any throw into a `HistoryError`. Nothing calls it in production yet: the replay viewer (#369) is to call it for the step on screen and pass the result to `perspective` and `revealFor`, and to show "recorded on an older build" when `frame.build?.rulesVersion` isn't the current one. `stepMarks` and `lineStep` read frames as recorded (ids and log keys only).

## Phase 4 as built (2026-11-07)

- **Fixtures** (`server/tests/stored/`, never refreshed): `v114-arriving.json`, `v114-orbit.json` and `v114-midAction.json`, whole `StoredRoom`s of about 45 KB each, plus `v114-registries.json`. The generator is `server/tests/storedRooms.ts`: the shared seeded random game (#335, `shared/tests/randomGame.ts`, imported across packages since it is test code) played 500 steps with 8 seats, then steered. For arriving and orbit the Commander is put at the Command terminal with AP to spare (position, AP and fuel set by hand), scans until a planet turns up, turns to face it and travels through the rules; orbit then passes the cycle and plays 200 more random steps, stopping before anyone leaves orbit. Mid-action plays on until two players have an action under way or queued. The wrapper is the one a real `GameRoom` writes after `setup`, with the game swapped in and accounts, sessions, a rate-limit count, language and starts filled in. `WRITE_STORED_FIXTURES=1 npm test -w server -- storedRooms.test.ts` writes what is missing at the current `STATE_VERSION` and never overwrites.
- **Declaring a change**: `UpgradeStep` gained `paths` (stored paths a step removes, renames or changes, `game.players[].foo`, `*` for a dictionary key) and `ids` (`ITEM_TYPES.old_id`). The tests excuse only what a step after the fixture's version declares; the queue drop (`players[].current`, `queue`) is excused always.
- **The five tests** (`server/tests/storedRooms.test.ts`): values preserved (fixtures; every leaf, and every empty array or object, at the same concrete path after `upgrade` and the normalizers); registry ids (every snapshot id still in its registry, plus a best-effort path-to-registry map run on the loaded fixtures and the generated rooms: item, equipment and character ids, skills, statuses and diseases, modifiers, rooms, log keys from the English `logEvent` catalogue, research and project keys); probes (`__probe` on every struct, `shared/tests/storedShape.ts` knowing which objects are dictionaries); idempotent; still plays (a `GameRoom` loads the stored room under fake timers at its own clock cycle, isn't unavailable, every seat has a `viewFor` and a `perspective` of `fullViewFor`, a token connects and gets a view, and the alarm passes one cycle). Probes, idempotence, the registry map and still-plays run on the fixtures and on the three moments generated at test time.
- **Probe on the hand-filled game**: `normalizeState.test.ts` also probes the hand-filled game (now `handFilled()`), the only one with plans, expeditions, sealed chat pages and the other collections random play leaves empty. Checked by hand that copying `Navigation.lastTurn`, `Spot` or `ExpeditionEvent.fight` without its normalizer, or changing `hp`, fails these tests.
- **Removed**: `server/tests/stateShape.test.ts` and `state-shape.json`. Its `Required<ConfigOverrides>` check is covered by `normalizeOverrides`' `AllKeys`. The rule skill, `docs/code-map/server.md` and `docs/process/testing.md` lost their pointers to it; their bump rules are phase 5.

## Phase 5 as built (2026-11-07)

Docs and skills now describe the normalizers instead of "bump `STATE_VERSION`" on every shape change: a new field gets an `added()` default and no bump; a removal, rename, changed type or meaning, renamed registry id, or change to what `resolveConfig` derives from a key gets an `upgradeTo<N>` step and a bump; registry keys are permanent ids. Rewritten: the `rule` skill's stored-shape bullet, the `wrap-up` skill's check, `docs/code-map/server.md` (section renamed "Stored state across deploys"), `docs/process/testing.md` (persistence, plus a stored-shape bullet), `docs/ops/deploy.md` (a "Live games across deploys" section: roll back only to the same `STATE_VERSION`, a breaking step deploys alone, an unreadable snapshot is kept, raising `MIN_STATE_VERSION` is the owner's call), and the comments on `STATE_VERSION` and `ConfigOverrides`. The two "no migrations" decisions in `docs/rules/rules-design.md` are marked reversed, with a new "Stored state across deploys" decision; `docs/plans/replay-viewer.md` story 3 reads frames through `readFrame` and puts the "recorded on an older build" badge on each frame. The other plans (`patrol.md`, `space-combat.md`, `expedition.md`, `chat-pages.md`, `relay-tokens.md`, `on-call.md`, `action-plans.md`) now say "a default in its normalizer" for added fields and "an upgrade step and a bump" for changed types and removals. The default `cyclesPerDay` will never change (owner, 2026-11-07), so no doc covers that case.
