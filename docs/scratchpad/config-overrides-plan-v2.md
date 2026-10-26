# Handoff v2: store config overrides, not the whole config (2026-10-25)

Status: planned, not started. Revises `config-overrides-plan.md` (v1) to fit the Setups epic (#226, sub-issues #227–#237) and the replay decisions (#153, #156, #167). Everything in v1's "Facts verified in the code" still holds; this file lists only what changes and why.

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
  // Added by #232, not in this change: setup?: Setup;  // resolved through setupConfig (#227)
  /** Single player: 1. */
  mushCount?: number;
  /** Single player, and wherever the server allows cheats. */
  manualCycles?: boolean;
  /** Absent: no pre-selection (null). Present: PRESELECTION with these fields replaced. Applied after the setup (dev: all characters' seats). */
  preselection?: Partial<PreselectionRules>;
}
```

`resolveConfig(o)` = `DEFAULT_CONFIG` → (from #232: `setupConfig(o.setup)` when present) → the dev/test fields on top, each allowlisted key by key as in v1. When #227/#232 land, `setupConfig` becomes the setup branch of `resolveConfig` (or `resolveConfig` calls it). It must not be a parallel path that `GameRoom` calls directly.

This change still ships v1's three keys (that's all that differs per game today). The point is the documented layering and the rule that **anything per-game that must survive a reload lives in `ConfigOverrides`, and `GameConfig` fields derived from it (`config.setup`, `cyclesPerDay`, …) are recomputed by `resolveConfig`**. Add that rule to the `ConfigOverrides` doc comment and to `docs/code-map/server.md`.

The launch-time Mush count (players minus 2) stays in `GameState`. It is never written back into the overrides.

### 2. `GameSetup` also records the overrides
Add `overrides?: ConfigOverrides` to `GameSetup` (optional; older records lack it). Keep `config` (the resolved launch config) as v1 does. Why: the record then says what the game *asked for* as well as what it got, and #237's "knobs that differ from the standard" in a replay can read the recorded setup rather than diffing the recorded config against *today's* `DEFAULT_CONFIG`, which would show false differences after any balance change. `"setup"` isn't in the shape fingerprint, so this doesn't affect `STATE_VERSION`.

### 3. Ordering with #226
Land this **before** #227–#232. After it, adding `cycleHours` or `setup` fields to `GameConfig` no longer changes the stored snapshot shape. Only changes to `ConfigOverrides` do, so #230 (cycle length) may not need its bump at all, and #232 needs exactly one (adding `setup` to `ConfigOverrides`). Update the #230 and #232 issue plans to say so when this lands.

### 4. Replay divergence: downgraded from an open question to a documented limit
Because of the (b) decision and the code-deploy precedent above, it isn't a blocker. Document on `GameSetup`/`rebuildGame`: "Exact only if neither the rules code nor `DEFAULT_CONFIG` changed while the game was live." Also note in `docs/rules-design.md` under Replays (in the proposed history format) that config is **not** fixed for a game's life any more. If the history format stores config once, it must store it per change or include it in each per-cycle copy.

### 5. Follow-up, not in this change (owner to decide; open an issue): record config changes as inputs
On `onStart()`, if the resolved config differs from the one the game last ran (compare a stable hash kept in `Stored`), append `{ type: "configChanged", config }` (no `by`) through `applyInput`, which replaces `state.config`. Effects:
- `rebuildGame` stays exact across balance changes (it only can't survive *code* changes).
- The replay viewer (#156) can mark "rules changed here", which answers part of #156's open question about older rules.
- Analytics (#62) can tell which config each stretch of a game used.
- Cost: one input per deploy per live game that saw a change, ~10–20 KB each with a full config, or store only a diff against the previous one.
Leave it out of this change to keep it small. Without it, the GameRoom rebuild test still passes because nothing changes `DEFAULT_CONFIG` mid-test.

### 6. Silent knob loss on a rename (make it loud)
The allowlist ignores unknown keys, so if code renames or removes an override key, live games silently fall back to the default for it. For seats or cycle hours that is a mid-game structural change. Rule (in the `rule` skill line 34, `docs/testing.md`, `docs/code-map/server.md`): **any change to `ConfigOverrides`' shape, or to what `resolveConfig`/`setupConfig` derives from a key, bumps `STATE_VERSION`**. Consider a cheap guard: a test fingerprinting the `ConfigOverrides` key set (from a fully populated sample object, since `keyPaths()` drops empty objects; see v1 step 5), so a rename fails the build like a `GameState` change does.

## Unchanged from v1
Steps 2–7 of v1's Design (resolver body, `singlePlayerGame` returning `overrides` and its 3 callers, `GameRoom` `launch`/`persist`/`onStart`, `Stored.game` as `Omit<GameState, "config">`, `STATE_VERSION` 75 → 76, regenerated `state-shape.json` with no `config.*` paths, `clone()` untouched), v1's Tests (plus: `"setup"` stores `overrides`; and the optional overrides key-set fingerprint from point 6), and v1's Docs (plus the notes in points 1, 4 and 6, and the `ai-workflow.md` entry mentioning the setups alignment).

Also unchanged: changing the *default* `cyclesPerDay` still needs a bump (it breaks `clockCycle` alignment for live games). Once #230 makes cycle length per-game, a game's own value is safe in its overrides.

## Open questions for the owner
1. Point 5 (record config changes): now, as a follow-up issue, or never?
2. Point 6 guard test: worth adding now?
3. Ordering (point 3): this before #227, agreed?
