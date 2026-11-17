# Plan: state cloning and test performance (written 2026-11-16)

**Status:** Not built. Not a rules plan: none of these changes alter game rules, network formats, or stored replay schemas (`STATE_VERSION` and `RULES_VERSION` stay unchanged).

Speeds up both production turns (`applyInput`, `applyAction`, `sendChat`, `newCycle`, `tick`, `GameRoom.act`) and the test suite by removing redundant deep clones of `state.config`, trimming per-message cloning in `sendChat`, and tightening slow test loops — with explicit safeguards against accidental `config` mutation.

## A. Game and server runtime

### 1. `cloneState(state)` skipping `state.config` (highest impact)

`clone` in `shared/src/helpers.ts` runs `JSON.parse(JSON.stringify(value))` over the entire `GameState`, including `state.config` (all 27 rooms, items, actions, projects, diseases, expedition tables, and hunter tables). `GameState.config` is typed `DeepReadonly<GameConfig>` (`shared/src/types/state.ts`) and nothing in `shared/src/` mutates it.

- Keep `clone<T>(value: T): T` as a full deep copy (used by `rules.ts` for `equipment: clone(config.equipment)`, `normalizeFrame` in `normalizeState.ts`, `plans.ts`, and tests).
- Add `cloneState(state: Readonly<GameState>): GameState` in `shared/src/helpers.ts`: destructure `{ config, ...rest } = state` and return `{ ...clone(rest), config }`, with a docstring warning that `config` is shared by reference and must never be mutated.
- Switch all **24** `const next = clone(state)` sites in `shared/src/`:
  - `shared/src/kube.ts` (1)
  - `shared/src/sharedPlanets.ts` (1)
  - `shared/src/mind.ts` (1)
  - `shared/src/preselection.ts` (1)
  - `shared/src/spot.ts` (1)
  - `shared/src/queue.ts` (4)
  - `shared/src/sharedReports.ts` (1)
  - `shared/src/rules.ts` (5)
  - `shared/src/chat.ts` (5, or 6 if `sendChat` does not use COW below)
  - `shared/src/plans.ts` (1)
  - `shared/src/inactivity.ts` (2)
- Leave `clone(raw)` in `normalizeFrame` (`shared/src/normalizeState.ts`) untouched because upgrade steps mutate `game` and `config` before `normalizeFullView` re-resolves `config`.
- Leave `shared/tests/support.ts`'s `clone` helper untouched so test helpers that clone a state to tweak `t.config` (such as `forcedScan` in `shared/tests/planets.test.ts`) still copy `config`.

### 2. Share `state.config` in `fullViewFor`

`GameRoom.act()` (`server/src/GameRoom.ts`) calls `fullViewFor(this.game, this.starts)` on every accepted input (and `fullViewFor(before, starts)` on the first input after room start). Currently `shared/src/fullView.ts` runs `clone({ ...rest, starts })`, which deep-clones `state.config` again and forces `diffView` (`shared/src/viewDiff.ts`) to walk all of `config` recursively.

- Change `fullViewFor` to `{ ...clone({ ...rest, starts }), config: state.config }` (cloning everything except `config`, which is shared by reference).
- Because `diffView` starts with `if (prev === next) return undefined;`, sharing `state.config` makes diffing `config` O(1) on every non-cycle input.
- Update `fullViewFor`'s docstring to state that mutable fields are copied while `config` is shared by reference. (`shared/tests/replay.test.ts` only deletes the top-level `full.config` key on one test copy and never mutates inside `config`.)

### 3. Shallow copy-on-write in `sendChat`

`sendChat` (`shared/src/chat.ts`) delegates to `pushChat`, which only updates `chat`, `chatSeq`, `nextChatId`, `chatOutbox`, and `chatMarks`. `pruneReports` (`shared/src/reports.ts`), called afterwards by `applyInput`, only touches `reports`.

- Replace `cloneState(state)` in `sendChat` with a shallow copy of `state` plus copies of the chat-owned structures:
  - `chatSeq: { ...state.chatSeq }`
  - `chatMarks: { ...state.chatMarks }`
  - `chatOutbox: { sealed: state.chatOutbox.sealed.map((p) => ({ ...p, messages: p.messages.map((m) => ({ ...m })) })), dropped: [...state.chatOutbox.dropped] }` (zero extra work when `sealed` is empty, as after `takeChatOutbox`)
  - `chat: state.chat.map((m) => (m.at === undefined ? { ...m } : m))` — shares already-stamped `ChatMessage` objects without allocating, while copying any unstamped messages so a subsequent `stampEntries` call (`shared/src/replay.ts`) never mutates the input state in unit tests.
- Keep `toggleCheckbox` (`shared/src/chat.ts`) on `cloneState`, as it mutates a `chatMarks` entry's `checked` array.

### 4. Deferred: indexing `state.items` for `itemsIn`

`itemsIn` (`shared/src/items.ts`) showed up as ~4.1% active CPU in the `GoalBot` profile. Because `performAction` mutates `state.items` in place, caching/indexing items carries invalidation complexity for a modest gain compared to `cloneState`. Re-profile `viewFor` / `legalActions` after items 1–3 land before deciding whether to add a per-pass index.

---

## B. Safeguards against `config` aliasing

Sharing `state.config` across `cloneState` and `fullViewFor` relies on `config` never being mutated after a state is passed into rules code. Keep that invariant enforced automatically:

1. **Deep-freeze `DEFAULT_CONFIG` (`shared/src/config.ts`)**: Freeze `DEFAULT_CONFIG` recursively (matching `Object.freeze` on `STANDARD_KNOBS` in `shared/src/setups.ts`). Existing tests that mutate nested config fields already use `structuredClone(...)` or replace the nested array/object first. (Note: `shared/tests/spot.test.ts`, `shared/tests/tips.test.ts`, and `shared/tests/cold_disease.test.ts` mutate file-local `const config` spreads across tests within those files; clean those up if desired, separately.)
2. **Purity test with frozen `state.config`**: In `shared/tests/rules.test.ts` (or `replay.test.ts`), deep-freeze `state.config` before running `applyAction`, `applyInput`, `newCycle`, `tick`, and `sendChat` so strict-mode ESM throws `TypeError` on any runtime write inside `config`.
3. **Source-scan guard test in `tools/tests/`**: Matching `tools/tests/death/hpWrites.test.ts`, scan `shared/src/**` for:
   - writes through `.config` on state/view objects (allowlisting `normalizeState.ts` upgrade steps on cloned historical frames), catching `as unknown as` type-cast bypasses;
   - accidental regressions back to `clone(state)` / `clone(next)` in `shared/src/`.

---

## C. Test-suite speedups

| Target | Change | Notes |
|---|---|---|
| `shared/tests/normalizeState.test.ts` | Compute `play(600, 11).state` once at describe/module scope instead of 8 times. | `stored`, `withoutQueues`, `fullViewFor`, and `dropQueues` do not mutate the shared state; freeze or keep read-only. |
| `shared/tests/comms.test.ts` | Reuse one `ship(true)` state in Xyloph "draws by weight" and only update `s.rng` across the 5,900 iterations. | `drawXyloph` only reads `state.comms.xyloph` and advances `state.rng`. |
| `web/tests/iso/placement.test.ts` | Memoize `scene(room.id)` and `walkableCells(ship, room)` per room ID in `"doorPassage on the real ship"`. | Both are pure reads; eliminates 4–6× redundant `prepareScene` calls across 40+ directed pairs. |
| `shared/tests/floorHeating.test.ts` | Build `base` and `heated` states once outside the 200-seed loop and only update `.rng` per iteration before `mustApply`. | Keeps all 200 end-to-end `applyAction` checks while eliminating 400 `createGame` calls. |
| `shared/tests/expeditions.test.ts` | Re-time `rate()` after `cloneState` lands; if still slow, vary `rng` on a reused state (since `applyAction` does not mutate its input) or test `pickSectors` directly with an active `state.expedition` / `state.expeditions` entry. | `pickSectors` calls `crewCarries`, which requires `state.expedition` and matching `state.expeditions` report; avoid exporting private `resolve` unless timing still warrants it. |
| `server/tests/goals.test.ts` | Replace `JSON.stringify(a) === JSON.stringify(action)` in `isLegal` with a recursive plain-object equality helper. | Must recurse into nested plain objects to handle `ExamineActionData.target` (`{ kind, id }`). |

### Intentionally left untouched

- `shared/tests/moduleLoad.test.ts`: `vi.resetModules()` is its purpose (catching circular import-order crashes, per `docs/process/testing.md`).
- `web/src/tips.test.ts`: `twoTabs()` uses `vi.resetModules()` across only 2 tests to isolate module-level state for cross-tab `localStorage` event testing.

---

## Verification

1. Measure baseline timings on the target tests (`normalizeState.test.ts`, `comms.test.ts`, `placement.test.ts`, `expeditions.test.ts`, `floorHeating.test.ts`, `goals.test.ts`) before and after part A (`cloneState`, `fullViewFor`, `sendChat`), then after parts B–C.
2. Run `npm run verify` (typecheck, Biome lint, full test suite including the new `tools/tests/` guard) and `npm run lint:md`.
