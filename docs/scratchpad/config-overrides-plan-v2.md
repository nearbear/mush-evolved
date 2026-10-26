# Handoff v2: store config overrides, not the whole config (2026-10-25)

Status: built (f4ea19d..e910f4e, `STATE_VERSION` 76), except the follow-ups: point 5 and the issue updates in point 3. Revises `config-overrides-plan.md` (v1) to fit the Setups epic (#226, sub-issues #227–#237) and the replay decisions (#153, #156, #167). Everything in v1's "Facts verified in the code" still holds; this file lists only what changes and why.

## Decision (owner, unchanged)
Live games pick up balance changes (edits to `DEFAULT_CONFIG`) on their next load. The record (`"setup"` + `input:*`) keeps the exact launch `GameSetup`.

## Context the v1 plan didn't account for

**Setups (#226, due before public beta; nothing built yet, `shared/src/setups.ts` doesn't exist).**
- A setup is five coarse knobs: seats 4–16, pre-selection days 1–5, Mush count `"auto" | 1 | 2 | 3`, cycle hours 1/2/3/4/6, `sharedSpots`. Plus public metadata (id, name, description, author, version, previousId, rulesVersion, createdAt). Setups are immutable once posted.
- #227 plans `setupConfig(setup): GameConfig` "on top of `DEFAULT_CONFIG` and `PRESELECTION`". It sets `preselection.seats`, `preselection.mushCount` (#229), `cycleHours` + `cyclesPerDay = 24 / cycleHours` (#230), `preselection.endsOn`, `sharedSpots`, and a `setup` summary.
- #232 plans `GameConfig.setup?: { id, name, version, author, knobs }`, copied into `PublicConfig.setup` by `viewFor` and into the record through `GameSetup.config`. #237 reads it for the in-game panel and for replays ("knobs that differ from the standard").
- #230 and #232 each plan a `STATE_VERSION` bump.
- At launch, a fixed Mush count is lowered to the number of players minus 2 (at least 1). That is a launch-time result, not a knob.
- If a rules change removes or renames a knob, old setups stop validating and drop off the ballot.

**Replays (#153, #156, #167).**
- Decided (#167, 2026-10-25): option (b), a stored per-step history, so a replay viewer never re-runs old rules. Rejected: keeping old rules builds (one game spans several deploys anyway).
- The history format is *proposed, not decided*: per-input changes plus a full copy each cycle, "with log, chat and config stored once since they only grow or never change".
- `rebuildGame(setup, record)` has no production callers today. It's used by tests (`GameRoom.test.ts:396` asserts the stored snapshot equals the rebuild) and is meant for rebuilding a dropped snapshot "where the rules version allows".
- A deploy that changes rule code mid-game already makes re-running diverge. A mid-game `DEFAULT_CONFIG` change is the same class of problem, not a new one.
- #62 (analytics and balance) will want to know which config a game ran under.

## What changes from v1

### 1. `ConfigOverrides` is the future home of the setup, not a separate three-key type
v1's `{ mushCount?, manualCycles?, preselection? }` would leave #227 to write a second resolver beside `resolveConfig`, with a second hand-written allowlist. Worse, #232's `GameConfig.setup` would be **lost on the first reload**, because `config` is rebuilt from `DEFAULT_CONFIG` + overrides and anything not in the overrides disappears.

So the shape is layered. One resolver, one place that maps intent to a `GameConfig`:

```ts
/** The only ways a game may differ from DEFAULT_CONFIG. Everything else is read from DEFAULT_CONFIG on each load. */
export interface ConfigOverrides {
  // Added by #227, not in this change: setup?: Setup;  // resolved through setupConfig (#227)
  /** Single player: 1. */
  mushCount?: number;
  /** Single player, and wherever the server allows cheats. */
  manualCycles?: boolean;
  /**
   * Applied on top of the base config (`DEFAULT_CONFIG`, or `setupConfig(o.setup)` once #227 lands).
   * Absent: keeps `base.preselection` (`null` without a setup, the setup's rules with one).
   * Present: allowlisted fields merged over `base.preselection ?? PRESELECTION` (dev: `{ seats: CHARACTERS.length }`).
   */
  preselection?: Partial<PreselectionRules>;
}
```

`resolveConfig(o)` starts from `const base = o.setup ? setupConfig(o.setup) : DEFAULT_CONFIG` (just `DEFAULT_CONFIG` in this change) and applies the dev/test fields on top, allowlisted key by key as in v1. `o.preselection === undefined` keeps `base.preselection` (`null` today), and a defined `o.preselection` merges over `base.preselection ?? PRESELECTION`, so dev's `{ seats: CHARACTERS.length }` doesn't wipe a setup's `endsOn` or Mush count. Write the resolver this way now, even though today's base is always `DEFAULT_CONFIG`. #227 adds `setup?: Setup` to `ConfigOverrides` and the `setupConfig` branch to `resolveConfig` when it creates `setupConfig`. It must not be a parallel path that `GameRoom` calls directly.

This change still ships v1's three keys (that's all that differs per game today). The point is the documented layering and the rule that **anything per-game that must survive a reload lives in `ConfigOverrides`, and `GameConfig` fields derived from it (`config.setup`, `cyclesPerDay`, …) are recomputed by `resolveConfig`**. Add that rule to the `ConfigOverrides` doc comment and to `docs/code-map/server.md`.

The launch-time Mush count (players minus 2) stays in `GameState`. It is never written back into the overrides.

### 2. `GameSetup` also records the overrides
Add `overrides?: ConfigOverrides` to `GameSetup` (optional; older records lack it) and pass `overrides: this.overrides` when `GameRoom.launch()` builds the setup. Keep `config` (the resolved launch config) as v1 does. Why: the record then says what `launch()` asked for (single-player and dev overrides included, before #227 adds the setup) as well as the resolved config. It is provenance only. #237 reads `GameSetup.config.setup` and compares its knobs with `STANDARD_KNOBS` through `knobsDiff`, so it never diffs a config against today's `DEFAULT_CONFIG`. `"setup"` isn't in the shape fingerprint, so this doesn't affect `STATE_VERSION`.

### 3. Ordering with #226
Land this **before** #227–#232. After it, adding `cycleHours` or `setup` to `GameConfig` no longer changes `Stored.game`:
- **#230 (cycle length): no bump.** The default `cycleHours` is 3 and the default `cyclesPerDay` stays 8. Every day-boundary site already reads `state.config.cyclesPerDay`, and no live game can have another cycle length until #232.
- **#228 (`SEAT_COUNT` 4 → 16): bump.** A live ship in pre-selection stores `{ preselection: {} }`, so changing `PRESELECTION.seats` would take it from 4 to 16 seats on its next load, out of step with the Matchmaker and `GameSetup.config`.
- **#227 (`ConfigOverrides.setup`) and #229 (Mush count in `PreselectionRules`): bump**, because they change the overrides' shape (and trip the guard in point 6). If #227–#232 land close together they can share one bump.

Update the #228, #230 and #232 issue plans to say so when this lands.

### 4. Replay divergence: downgraded from an open question to a documented limit
Because of the (b) decision and the code-deploy precedent above, it isn't a blocker. Document on `GameSetup`/`rebuildGame`: "Exact only if neither the rules code nor `DEFAULT_CONFIG` changed while the game was live." Also note in `docs/rules-design.md` under Replays (in the proposed history format) that `GameConfig` is **not** fixed for a game's life any more. The proposed format uses the full-state view, whose `config` (`PublicConfig`, `rules.ts:480`) is 3 fields, so it can simply go in each per-cycle copy. A format that keeps the full `GameConfig` must store it per change.

### 5. Follow-up, not in this change (owner to decide; open an issue): mark rules changes in the record
Recording the full config as an input was considered and dropped (Gemini's review):
- `DEFAULT_CONFIG` is 18 KB of JSON (measured 2026-10-25), too much to record per deploy per live game.
- Balance changes ship in deploys that usually change rule code too, so it wouldn't keep `rebuildGame` exact anyway.
- Applying an input inside `onStart()` would persist, broadcast and schedule bots and ticks during wakeup.

The cheap version is a marker: keep `rulesVersion` and a stable hash of the resolved config in `Stored` (written at `launch()`, so the first reload doesn't fire it). When `onStart()` sees either change, append a small record entry such as `{ rulesVersion, configHash }` beside the inputs, not through `applyInput`, so no state changes. Effects:
- The replay viewer (#156) can show "rules changed here", part of #156's open question about older rules.
- Analytics (#62) can split a game at the change. #226 rules out analytics per *setup*, not balance analytics, which are about exactly these `DEFAULT_CONFIG` edits.

Without it, the GameRoom rebuild test still passes because nothing changes `DEFAULT_CONFIG` mid-test.

### 6. Silent knob loss on a rename (make it loud)
The allowlist ignores unknown keys, so if code renames or removes an override key, live games silently fall back to the default for it. For seats or cycle hours that is a mid-game structural change. Rule (in the `rule` skill line 34, `docs/testing.md`, `docs/code-map/server.md`): **any change to `ConfigOverrides`' shape, or to what `resolveConfig`/`setupConfig` derives from a key, bumps `STATE_VERSION`**. Add a guard in this change, in `server/tests/stateShape.test.ts`: fingerprint a fully populated `overrides` sample alongside the stored game (a populated sample, since `keyPaths()` drops empty objects; see v1 step 5). Type it `Required` at every level, `Required<Omit<ConfigOverrides, "preselection">> & { preselection: Required<PreselectionRules> }`. Every field of `ConfigOverrides` is optional, so an ordinary sample would still compile when a key is added and the fingerprint would never see it. With `Required`, TypeScript rejects the test until the new key is in the sample, which then changes the fingerprint and forces a `STATE_VERSION` bump, like a `GameState` change.

## Unchanged from v1
Steps 2–7 of v1's Design (resolver body, `singlePlayerGame` returning `overrides` and its 3 callers, `GameRoom` `launch`/`persist`/`onStart`, `Stored.game` as `Omit<GameState, "config">`, `STATE_VERSION` 75 → 76, regenerated `state-shape.json` with no `config.*` paths, `clone()` untouched), v1's Tests (plus: `"setup"` stores `overrides`; the `Required`-typed overrides fingerprint from point 6; and `resolveConfig` tests that an absent `preselection` keeps the base's and a present one merges over it), and v1's Docs (plus the notes in points 1, 4 and 6, and the `ai-workflow.md` entry mentioning the setups alignment).

Also unchanged: changing the *default* `cyclesPerDay` still needs a bump (it breaks `clockCycle` alignment for live games). Once #230 makes cycle length per-game, a game's own value is safe in its overrides.

## Review
Gemini reviewed v2 (2026-10-25). Folded in: the pre-selection layering (point 1), `setup` wired in #227 not #232, the corrected bump list (#228 needs one, #230 doesn't; point 3), the provenance-only reason for `GameSetup.overrides` (point 2), `PublicConfig` in the history format (point 4), and the `Required`-typed guard (point 6). Not taken: its "never" on point 5. It put a full config at ~34 KB (it is 18 KB) and said #62 only cares about setups (#226 only rules out per-setup analytics); the marker version answers its other objections.

## Open questions for the owner
1. Point 5 (rules-change marker): open a follow-up issue, or drop it?
2. Ordering (point 3): this before #227, agreed?
