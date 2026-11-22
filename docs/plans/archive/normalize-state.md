# Normalizing stored state (#384), as built

Built 2026-11-07, phases 1–5. The reasons and the options not chosen are in [#384](https://github.com/nearbear/mush2/issues/384) (body and the 2026-11-07 review comment). The rule for developers is in `docs/rules/rules-design.md` ("Stored state across deploys"), the `rule` skill and `docs/ops/deploy.md`. What is left: the replay viewer calling `readFrame` and showing the per-frame build badge ([#369](https://github.com/nearbear/mush2/issues/369)).

## Types

- **`GameCore`** (`shared/src/types/state.ts`): the game without `config`, `rng` and `chatOutbox`. `GameState` and `FullView` both extend it.
- **`StoredRoom`** (`server/src/GameRoom.ts`): the room's snapshot under `"game"`. The normalizers cover its `game`, `overrides` and `starts`. Its flat fields (tokens, accounts, counters, …) keep their ad hoc defaults in `onStart`.
- **`Spot`** has a `kind` (`"cell" | "door"`), so every union in the stored state has a discriminant.

## Normalizers (`shared/src/normalizeState.ts`)

The rules are in the file's header. In short:

- One function per stored type, each returning an object literal under `AllKeys<T>`, so a new field doesn't compile until it is handled, and unknown keys are dropped.
- `need()` for fields that have always existed (throws `NormalizeError`); `added()` for later ones (defaults only `undefined`, never `null`); `??` never appears, and a test checks that.
- Unions are a `switch` on the discriminant with `satisfies undefined` in `default`; an unknown variant throws.
- Fixed-key records (`bios`, `titles`, `PlayerState.resources`) are written key by key.
- `normalizeGame(raw, overrides)` resolves the config from the overrides, so a live game picks up this build's balance numbers.
- `normalizeFullView` rebuilds a frame's config through `overridesOf` and `resolveConfig`.

## The action queue

- **Live game:** `normalizeGame` sets every player's `current` to `null` and `queue` to `[]`. Nothing has been paid for them, and the player presses again. This keeps `Action` out of the stored shape.
- **Record:** when the raw snapshot had any (`hasQueues`), `onStart` records one `{ type: "dropQueues" }` input (`queue.ts`) in the same write as the snapshot, with the loaded view as its `base`. It isn't applied live, but it lets `rebuildGame` still reproduce the stored state.
- **Replay frames:** `current` and `queue` are copied through unchecked, so action bars still show. An older `Action` shape that breaks `viewFor` becomes a `HistoryError`.

## Versions and upgrade steps

- `STATE_VERSION` (114) and `MIN_STATE_VERSION` (114) live in `normalizeState.ts`.
- `STATE_VERSION` is bumped only together with an `upgradeTo<N>` step in `UPGRADE_STEPS`. A step is needed for a removal, a rename, a changed type or meaning, a renamed registry id, or a change to what `resolveConfig` derives from a key.
- A step declares the stored `paths` and registry `ids` it changes; the fixture tests excuse only those.
- `upgrade` runs the steps due on a snapshot; for a `from` above `STATE_VERSION` it throws `TooNewError`.

## Load (`GameRoom.onStart`)

- **Too old:** below `MIN_STATE_VERSION`, the snapshot is dropped and the record kept (`retired`).
- **Readable:** otherwise the snapshot is upgraded and normalized into locals.
- **Unreadable:** on any throw the room is `unavailable`, with the snapshot and record untouched:
  - It logs `console.error` with a message starting `UNAVAILABLE`.
  - Sockets close with 4002 "Ship unavailable".
  - `join` answers `ship_closed` and `setup` throws.
  - `resume` answers `{ ok: false, unavailable: true }`, so the matchmaker keeps the `account_ships` row and sends `ship_unavailable`.
  - `seatAccounts` throws, so the daily sweep skips the ship.
  - `revokeSession` removes the session's tokens from the kept snapshot directly, so a logout holds once a later build reads it.
- **Save:** the next `persist()` writes the normalized state; there is no separate write-back.

## Replay history

- Every history step that carries a copy (`full` and `base`) has a `BuildStamp` (`stateVersion`, `rulesVersion`). The replay index records `stateVersion`.
- `rebuildHistory` gives each frame its copy's stamp; a copy without one reads as `MIN_STATE_VERSION`.
- `readFrame(frame)` (`viewHistory.ts`) runs `normalizeFrame` (the steps due, on a copy, then `normalizeFullView`), memoized per view; any throw becomes a `HistoryError`.
- `stepMarks` and `lineStep` read frames as recorded.

## Tests

- **`shared/tests/normalizeState.test.ts`:**
  - Round trip and idempotence on a fresh game, a seeded random game and a hand-filled game (`handFilled()`, the only one with plans, expeditions and sealed chat pages).
  - A sample of every variant of every union.
  - Unknown variants and missing fields throw; `null` survives; undefined-valued keys are stripped; `??` never appears.
  - Upgrade-step order and range, with fake steps.
  - `dropQueues` gives what `normalizeGame` gives.
- **Fixtures** (`server/tests/stored/`, never refreshed): `v114-arriving.json`, `v114-orbit.json` and `v114-midAction.json` (whole `StoredRoom`s), plus `v114-registries.json`.
  - Generated by `server/tests/storedRooms.ts` from the seeded random game.
  - `WRITE_STORED_FIXTURES=1 npm test -w server -- storedRooms.test.ts` writes those missing at the current `STATE_VERSION` and never overwrites one.
- **`server/tests/storedRooms.test.ts`**, on the fixtures and on rooms generated at test time:
  - Values preserved.
  - Registry ids still exist (the snapshot, plus a best-effort path-to-registry map).
  - `__probe` on every struct is stripped.
  - Idempotent.
  - Still plays: a `GameRoom` loads it, every seat gets a view and a `perspective`, a token connects, and the alarm passes a cycle.
- **`GameRoom.test.ts`:**
  - A restart mid-action drops the action and records `dropQueues`, and the record still rebuilds the stored state.
  - Unreadable snapshots are kept.
  - A logout while unavailable holds.
  - Stamps are written.
- `server/tests/stateShape.test.ts` and `state-shape.json` were removed.
