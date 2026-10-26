# Handoff: store config overrides, not the whole config (2026-10-25)

Status: planned, not started. Owner decision: live games pick up balance changes (edits to `DEFAULT_CONFIG`) immediately. Replays keep the launch config in `GameSetup`.

Background: `config.*` is 447 of the ~900 paths in `server/tests/state-shape.json`, so adding or renaming any tuning knob forces a `STATE_VERSION` bump, which ends every live game. Gemini reviewed the first draft twice (the design, then this plan) and its fixes are folded in below. The main ones: a test that would break (`GameRoom.test.ts:396`), two extra `singlePlayerGame` callers, and an allowlisted `preselection` merge. Open question for the owner is at the end of "Known risks" (replay divergence).

---

## Decision (owner)
Live games MUST pick up balance changes (edits to [`DEFAULT_CONFIG`](../../shared/src/config.ts#L26-L309)) immediately on the next load. Replays/records keep the exact launch [`GameSetup`](../../shared/src/replay.ts#L16-L32) config.

## Facts verified in the code
- `state.config` is read by rules in hundreds of places; it is never mutated after `createGame`. Tests pass custom configs to `createGame`, so `config: GameConfig` must stay on `GameState` in memory.
- Only three config fields differ per game today, all set in [`GameRoom.ts`](../../server/src/GameRoom.ts#L170-L278) `launch` callers:
  - [`setup()`](../../server/src/GameRoom.ts#L171-L174) (tests): `DEFAULT_CONFIG` as is (`{}`).
  - [`join()`](../../server/src/GameRoom.ts#L195-L213) first call: `{ ...DEFAULT_CONFIG, preselection: this.shipRules() }`, where [`shipRules()`](../../server/src/GameRoom.ts#L216-L218) is `PRESELECTION` (`{}`) or `{ ...PRESELECTION, seats: CHARACTERS.length }` (`{ seats: CHARACTERS.length }`) when `this.cheatsAllowed` is true.
  - [`setupSinglePlayer()`](../../server/src/GameRoom.ts#L181-L188): uses [`singlePlayerGame()`](../../shared/src/singlePlayer.ts#L29-L48), which sets `{ ...DEFAULT_CONFIG, mushCount: 1, manualCycles: true }`.
  - [`launch()`](../../server/src/GameRoom.ts#L258-L278) also forces `manualCycles: config.manualCycles || this.cheatsAllowed`.
  - `DEFAULT_CONFIG.preselection` is `null`.
- [`Stored`](../../server/src/GameRoom.ts#L70-L85) (`GameRoom.ts`) = `{ version, game: GameState, tokens, inputs, rateLimited, clockCycle, modelCalls?, singlePlayer? }`. [`persist()`](../../server/src/GameRoom.ts#L588-L601) writes `game: this.game`. [`onStart()`](../../server/src/GameRoom.ts#L149-L168) loads it if `stored.version === STATE_VERSION`, else deletes the `"game"` snapshot and keeps the record (`"setup"`, `"input:*"`, `"blocked:*"`).
- [`GameSetup`](../../shared/src/replay.ts#L16-L32) (`"setup"` key, written once at launch) holds the full `config: GameConfig`, `seed`, `rulesVersion`; [`rebuildGame(setup, record)`](../../shared/src/replay.ts#L129-L137) replays it. We keep `GameSetup` unchanged.
- [`server/tests/stateShape.test.ts`](../../server/tests/stateShape.test.ts#L16-L36) fingerprints key paths of `(await storage.get("game")).game`; 447 of ~900 paths are `config.*`.
- [`server/tests/GameRoom.test.ts`](../../server/tests/GameRoom.test.ts#L396-L398) directly asserts `expect(rebuildGame(json<GameSetup>(await storage.get("setup")), record)).toEqual(stored)` where `stored` is `(await storage.get("game")).game`. Removing `config` from `Stored.game` will break this test unless updated.
- [`singlePlayerGame()`](../../shared/src/singlePlayer.ts#L29-L48) is called in three places:
  1. [`server/src/GameRoom.ts`](../../server/src/GameRoom.ts#L183) (`setupSinglePlayer`)
  2. [`shared/tests/singlePlayer.test.ts`](../../shared/tests/singlePlayer.test.ts#L8-L11) (`startGame({ ...game, seed, rulesVersion: "test" })` — spreads `game` directly into `GameSetup`!)
  3. [`server/scripts/model.trial.ts`](../../server/scripts/model.trial.ts#L127-L128) (`createGame(setup.seats, setup.config, seed, setup.forcedRoles)`)
- State derived from config at `createGame` time (items, ship resources via `ship.*`, comms, patrolShips, players' starting AP/MP/HP/morale, etc.) lives in `GameState` itself, so it is NOT retro-updated by a config change. That is expected.

## Design
1. **Types** ([`shared/src/types/config.ts`](../../shared/src/types/config.ts) and re-export in `shared/src/types.ts` if it uses named exports):
   ```ts
   /** The only config a game may differ in from DEFAULT_CONFIG. Everything else is read from DEFAULT_CONFIG on each load. */
   export interface ConfigOverrides {
     mushCount?: number;
     manualCycles?: boolean;
     /** Absent: no pre-selection (null). Present: PRESELECTION with these fields replaced. */
     preselection?: Partial<PreselectionRules>;
   }
   ```
2. **Resolver** ([`shared/src/config.ts`](../../shared/src/config.ts)): add pure `resolveConfig(o: ConfigOverrides = {}): GameConfig`:
   ```ts
   export function resolveConfig(o: ConfigOverrides = {}): GameConfig {
     const p = o.preselection;
     return {
       ...DEFAULT_CONFIG,
       ...(o.mushCount !== undefined && { mushCount: o.mushCount }),
       ...(o.manualCycles !== undefined && { manualCycles: o.manualCycles }),
       preselection: p
         ? {
             ...PRESELECTION,
             ...(p.seats !== undefined && { seats: p.seats }),
             ...(p.endsOn !== undefined && { endsOn: p.endsOn }),
             ...(p.twoMushAbove !== undefined && { twoMushAbove: p.twoMushAbove }),
             ...(p.minPlayers !== undefined && { minPlayers: p.minPlayers }),
           }
         : null,
     };
   }
   ```
   Explicit allowlist of keys at both top-level and `preselection` (unknown keys in a stored object are ignored, never spread).
3. **Single-player helper** ([`shared/src/singlePlayer.ts`](../../shared/src/singlePlayer.ts)):
   - Change [`SinglePlayerGame`](../../shared/src/singlePlayer.ts#L22-L26) to `{ seats: Seat[]; overrides: ConfigOverrides; forcedRoles: Record<PlayerId, Role> }`.
   - In [`singlePlayerGame()`](../../shared/src/singlePlayer.ts#L29-L48), return `overrides: { mushCount: 1, manualCycles: true }` instead of `config: { ...DEFAULT_CONFIG, mushCount: 1, manualCycles: true }`.
   - Remove the `import { DEFAULT_CONFIG } from "./config.ts"` and its `// biome-ignore lint/style/noRestrictedImports` comment on [lines 9–10](../../shared/src/singlePlayer.ts#L9-L10) (no longer needed!).
   - Update all 3 callers of `singlePlayerGame`:
     - [`server/src/GameRoom.ts`](../../server/src/GameRoom.ts#L183-L186): `const { seats, overrides, forcedRoles } = singlePlayerGame(...)` -> `await this.launch(seats, { [token]: SINGLE_PLAYER_HUMAN }, overrides, forcedRoles)`.
     - [`shared/tests/singlePlayer.test.ts`](../../shared/tests/singlePlayer.test.ts#L8-L11): `const { overrides, ...rest } = singlePlayerGame("Guest 1", character, seed); return startGame({ ...rest, config: resolveConfig(overrides), seed, rulesVersion: "test" });`.
     - [`server/scripts/model.trial.ts`](../../server/scripts/model.trial.ts#L127-L128): import `resolveConfig` from `@mush2/shared` and pass `resolveConfig(setup.overrides)` to `createGame(...)`.
4. **Server** ([`server/src/GameRoom.ts`](../../server/src/GameRoom.ts)):
   - Replace unused imports `DEFAULT_CONFIG`, `PRESELECTION`, `type GameConfig`, `type PreselectionRules` with `resolveConfig`, `type ConfigOverrides` from `@mush2/shared` (leaving unused imports breaks lint/typecheck).
   - Add field `private overrides: ConfigOverrides = {};` on `GameRoom`.
   - [`launch(seats, tokens, overrides: ConfigOverrides, forcedRoles?)`](../../server/src/GameRoom.ts#L258-L278):
     - Do not mutate the caller's `overrides` object. Compute:
       ```ts
       this.overrides = this.cheatsAllowed ? { ...overrides, manualCycles: true } : { ...overrides };
       const config = resolveConfig(this.overrides);
       ```
     - Build `GameSetup` with the full `config` (record unchanged) and `startCycle: cycleOfDay(this.clockCycle, config.cyclesPerDay)`.
     - Set `this.game = stampEntries(startGame(setup), now)` and `this.tokens = tokens`, then write `"setup"` and call `this.persist()`.
   - Callers of `launch` in `GameRoom.ts`:
     - [`setup()`](../../server/src/GameRoom.ts#L171-L174): `await this.launch(seats, tokens, {});`
     - [`join()`](../../server/src/GameRoom.ts#L199): `this.launch([], {}, { preselection: this.cheatsAllowed ? { seats: CHARACTERS.length } : {} })` and remove [`shipRules()`](../../server/src/GameRoom.ts#L216-L218) (or change it to `private shipOverrides(): ConfigOverrides`).
     - [`setupSinglePlayer()`](../../server/src/GameRoom.ts#L181-L188): passes `overrides` returned by `singlePlayerGame(...)` (do not duplicate `{ mushCount: 1, manualCycles: true }` in `GameRoom.ts`).
   - [`Stored`](../../server/src/GameRoom.ts#L70-L85) gains `overrides: ConfigOverrides`; `Stored.game` becomes `Omit<GameState, "config">`.
   - [`persist()`](../../server/src/GameRoom.ts#L588-L601) strips `config` without mutating `this.game`:
     ```ts
     const { config: _, ...game } = this.game;
     ```
     and writes `overrides: this.overrides, game`.
   - [`onStart()`](../../server/src/GameRoom.ts#L157):
     ```ts
     this.overrides = stored.overrides;
     this.game = { ...stored.game, config: resolveConfig(stored.overrides) };
     ```
   - Bump [`STATE_VERSION`](../../server/src/GameRoom.ts#L68) `75 -> 76` (stored shape changes once; existing live games end).
5. **Shape fingerprint** ([`server/tests/stateShape.test.ts`](../../server/tests/stateShape.test.ts)):
   - Keep [`freshStoredGame()`](../../server/tests/stateShape.test.ts#L26-L36) returning `(await storage.get<{ game: unknown }>("game"))!.game`.
   - **Do NOT try to fingerprint `stored.overrides` from `room.setup()` via `keyPaths()`**: [`keyPaths()`](../../server/tests/stateShape.test.ts#L16-L24) only adds leaf primitives and `"[]"` to `out`, so an empty object `overrides: {}` (or even `{ preselection: {} }`) produces **zero paths** in `keyPaths()`. `ConfigOverrides` is already a small 3-key interface guarded by `resolveConfig` unit tests and TypeScript.
   - Regenerate `server/tests/state-shape.json` with `UPDATE_STATE_SHAPE=1 npm test -w server -- stateShape.test.ts`; verify no `config.*` paths remain.
6. **Replay** ([`shared/src/replay.ts`](../../shared/src/replay.ts)): code unchanged; update doc comment on [`GameSetup`](../../shared/src/replay.ts#L15-L32) / [`rebuildGame`](../../shared/src/replay.ts#L128-L137). Note: if a live game spans a mid-game `DEFAULT_CONFIG` change, inputs recorded *after* the change were validated against the new config while `setup.config` holds the launch config, so `replayGame`/`rebuildGame` can diverge or throw on those games.
7. **NOT changing**: `clone()` still deep-copies `config` on every input (separate optimization; flag only).

## Tests
- **shared**: `resolveConfig` unit tests:
  - `resolveConfig()` and `resolveConfig({})` equal `DEFAULT_CONFIG` (`preselection` stays `null`).
  - `mushCount` and `manualCycles` overrides each replace only their field.
  - `preselection: {}` produces `{ ...PRESELECTION }`; `preselection: { seats: 16 }` replaces `seats` and keeps other `PRESELECTION` fields.
  - Unknown keys on `overrides` or `overrides.preselection` (cast `as ConfigOverrides`) are ignored and not spread onto the result.
- **server** ([`server/tests/GameRoom.test.ts`](../../server/tests/GameRoom.test.ts)):
  - **Update existing test at [lines 396–397](../../server/tests/GameRoom.test.ts#L396-L398)**: `stored` (`(await storage.get("game")).game`) no longer has `config`, whereas `rebuildGame(...)` returns a full `GameState` with `config`. Update to read `{ game: stored, overrides }` from `storage.get("game")`, assert `expect(stored).not.toHaveProperty("config")`, and assert `expect(rebuildGame(json<GameSetup>(await storage.get("setup")), record)).toEqual({ ...stored, config: resolveConfig(overrides) })`.
  - Add persistence test (a): persisted `"game"` has no `game.config` key and stores `overrides` (`{}` for `setup` without cheats, `{ manualCycles: true }` with `ALLOW_CHEATS`, `{ preselection: {} }` for normal `join`, `{ preselection: { seats: CHARACTERS.length }, manualCycles: true }` for dev `join`, `{ mushCount: 1, manualCycles: true }` for `setupSinglePlayer`).
  - Add persistence test (b): reload (`new GameRoom` + `onStart()` over the same `FakeStorage`) restores `game.config` equal to `resolveConfig(overrides)` across normal ship, single player, and dev ship, and a subsequent `persist()` preserves `overrides` (does not reset to `{}`).
  - Add persistence test (c): a stored game reloaded after modifying a `DEFAULT_CONFIG` knob picks up the new value immediately. **Implementation note**: do NOT use `vi.spyOn(DEFAULT_CONFIG, ..., "get")` (Vitest throws `is not a getter` on plain value properties) and do not add a test-only param to `resolveConfig` (which wouldn't test `onStart()`'s call). Instead, mutate a primitive property on `DEFAULT_CONFIG` (e.g., `DEFAULT_CONFIG.maxAp = 99`) inside a `try / finally` block that restores the original value, call `revived.onStart()`, and verify the revived room uses `99`.
  - Check (d): [`server/tests/stateShape.test.ts`](../../server/tests/stateShape.test.ts) passes with the regenerated `state-shape.json` and contains no `config.` paths.

## Docs
- [`docs/code-map/server.md`](../../docs/code-map/server.md#L16-L18) "STATE_VERSION and the shape fingerprint": update line 18 to state that `GameConfig` is no longer part of the stored `"game"` snapshot (`ConfigOverrides` is stored instead and hydrated via `resolveConfig` on `onStart`). List what still requires a `STATE_VERSION` bump: stored `GameState` shape changes, `ConfigOverrides` shape changes, or config changes whose semantics invalidate in-flight `GameState` (e.g., `cyclesPerDay` or new state invariants). Note that `createGame`-only config fields (`startItems`, `equipment`, `rooms`, `startAp`/`startMp`/`startHp`/`startMorale`, `ship.*.start`) are baked into `GameState` at launch and will not retroactively change in live games.
- `.claude/skills/rule/SKILL.md` (line 34) and `docs/testing.md`: update to match.
- Append a short entry to `docs/ai-workflow.md` (decision: overrides-only; why naive shallow-merge-over-defaults fails on removed/renamed keys and nested sub-objects; what changed).

## Known risks / open questions
- **Replays of games that span a mid-game balance change can throw in `rebuildGame`/`replayGame`**: `GameSetup.config` holds the launch-time `GameConfig`, while inputs accepted after an `onStart()` reload used the new `DEFAULT_CONFIG`. If an action's cost, legality, or RNG rolls changed between launch and a later input, `replayGame`/`rebuildGame` will diverge or throw `Replay diverged`. Document this on `GameSetup`/`rebuildGame`.
- **Mid-game inconsistency with launch-baked state**: e.g., changing `ship.oxygen.max` below a live ship's current `oxygen`, or changing `cyclesPerDay` (which breaks `clockCycle` alignment). Accepted for balance numbers; structural changes like `cyclesPerDay` must still bump `STATE_VERSION`.
- **Type changes of a config knob** (e.g., `number` -> `[number, number]`) are no longer caught by `stateShape.test.ts`, which is intended: stored games no longer carry the old config type, and TypeScript catches rules reading the old type at compile time.
