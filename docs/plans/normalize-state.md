# Normalizing stored state, phase 2 (#384)

Status: planned 2026-11-07, not built. The approach, phases and amendments are in [#384](https://github.com/nearbear/mush2/issues/384) (body and the 2026-11-07 review comment), which this plan doesn't repeat. Phase 1 (`Spot.kind`) is built (`a93db37`). Decisions 1, 2 and 3 below are the owner's (2026-11-07). Steps 1 (the types) and 2 (helpers and normalizers, `normalizeCore` and `normalizeGame`) of the order of work are built. Notes from step 2: the exhaustiveness check is `raw.kind satisfies undefined` (under `Partial`, what is left once every variant has a case is `undefined`; the plan's `satisfies never` doesn't compile there); `normalizePlayer` always drops the queue until step 3 adds the mode; the section 8 tests that cover step 2 (round trip, idempotent, unions, `null`, undefined keys, no nullish-coalescing) are written, plus a hand-filled round trip for the collections the random game leaves empty.

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
- `onStart` records one `{ type: "clearQueue", by }` input per such seat, in one write with the snapshot. The live room doesn't apply them, because the normalizer has already done the same thing. With `resolveAt: "end"` (`config.action`), `emptyQueue` without `notify` sets `current = null` and `queue = []` and writes no log line. That equivalence depends on `resolveAt`, which no setup overrides: a comment at both places says so.
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
