# Handoff: oxygen plan Run A2 (2026-11-20)

Worktree `/home/near/mush2/.claude/worktrees/run-a2`, branch `run-a2`, made from local `main` at `36b7a641`. Nothing is committed yet. Plan: `docs/scratchpad/bot-survival-plan.md`, "Run A2".

## Done

- **Full-bedroom memory (A2, kept).** `observeBeds` in `server/src/bots/goals/rest.ts` keeps `BotMemory.fullBeds` (a `Map<RoomId, Set<PlayerId>>`). Every view update in `GoalBot` (`server/src/bots.ts`, next to `observeShrinks`) calls it. A room the bot sees with every bed taken is remembered with its sleepers. The bot forgets it when it sees a free bed there, or a sleeper elsewhere, up or dead. `rest` skips remembered rooms and offers nothing when all of them are remembered. The memory is persisted: a new `fullBeds` field in `BotMemorySnapshot` (`memoryStore.ts`) plus `snapshot`/`restore`. No version bump: a new field restores at its default.
- **Harness metrics.** `CycleReport.restWalkAp` (AP spent on moves while following `rest`) and `lying` (crew lying at a cycle's end) are in `server/src/testing/survival.ts`, with a `beds:` line in `survivalReport.ts`.
- **Tests.** `server/tests/goals.test.ts` has a new "full bedrooms (oxygen plan Run A2)" describe with 3 tests. `fullBeds` was added to the memory fixtures in `goals.test.ts`, `reportShare.test.ts` and `model.test.ts`.
- **A2b (leave orbit only when the whole Motor Room chain is affordable): tried, then dropped by the owner.** The code is reverted (`travel.ts` matches `main`) and its test is removed.
- **Docs.**
  - Two bullets after Run A under "Reaching Eden" in `docs/plans/bot-goals.md` (A2 and the A2b negative result).
  - A "Full bedrooms" row in `.claude/skills/bot-strategy/SKILL.md`.
  - `docs/code-map/server.md` (`observeBeds`, the new report fields).
  - A status paragraph under Run A2 in `bot-survival-plan.md`.
- **Leak check (reasoned, not run as the skill).** `observeBeds` reads only the bot's own view (its room's `roomEquipment`, and the `room`, `lying` and `alive` fields in `players`) and posts nothing. The memory stays in bot storage.

## Results (50 seeds, crew 16, cap 30, incidents on)

| | Base (Run A rerun) | A2 | A2b |
|---|---|---|---|
| AP walking to rest, a run | 495.5 | 353.2 | 362.6 |
| `rest` started, a run | 795 | 493 | 509 |
| Crew lying at cycle end | 6.56 | 6.29 | 6.36 |
| Cycles in orbit after all explored, a run | 6.6 | 6.6 | 7.2 |
| Stays of a day or more | 11 | 18 | 13 |
| Endings (humans dead / destroyed) | 43 / 7 | 46 / 4 | 42 / 8 |
| Mean change | | −0.16 days | +0.11 days vs A2 |

Saved, all untracked so far, in `docs/scratchpad/`: `survival-runA2-base-2026-11-19.json`, `survival-runA2-2026-11-19.json`, `survival-runA2-smoke-2026-11-19.json`, `survival-runA2b-2026-11-19.json`, `survival-runA2b-smoke-2026-11-19.json`. Commit them like the earlier runs.

Reading:
- The bedroom loop is mostly gone, but it wasn't what kept the Commander in orbit.
- A2b helped seeds 1 (21 → 3 cycles) and 8 (15 → 3), but it stranded seed 3's Commander for 59 cycles. Goals ranked below `travel` spend his AP down to the reserve, so he never holds the 6+ AP the chain needs.
- Making A2b work would need that AP protected from lower goals, like `keepsHeldJump`. That's an open owner decision; the owner dropped A2b rather than add it.

## Remaining

1. **`npm run verify` fails in `test`. Not diagnosed yet.** Typecheck and lint pass. The `model.test.ts` failure (missing `fullBeds`) is fixed, and `goals`, `reportShare`, `GameRoom.bots` and `model` tests pass on their own. Verify prints only the last 120 lines, which were wrangler and model noise. Find the failing test by running each workspace on its own (`npm test -w server`, then `shared` and `web`), or by reading the JSON in `/tmp/mush2-verify-*`. If it's in a file this task didn't touch, it is probably not ours. Most likely place: another test that builds a `BotMemory` literal without `fullBeds` (`grep -rn "shrinks: new Set" server/tests`).
2. Rerun `npm run verify` until it passes. No `web` change, so no build is needed.
3. Append one entry to `docs/process/ai-workflow.md` with `cat >>` (never read or rewrite the file). Points worth logging:
   - Rerun the baseline with new metrics back to back with the runs.
   - Harness workers load code lazily, so don't edit source during a run.
   - The A2b smoke test looked fine on average, but a per-seed stay listing caught seed 3's stranding.
   - The owner dropped A2b.
4. Optional: `npm run lint:md` on the edited docs (see `docs/process/commands.md`).
5. Commit on `run-a2` (code, tests, docs, saved runs), then land it once the owner approves.
   - **Watch out:** the main checkout has uncommitted work (the Antisocial rule and a bot `isolate` goal) touching `server/src/bots/goals/rest.ts`, `goals/index.ts` and `server/tests/goals.test.ts`. A merge into `main` will refuse or conflict on those files until that work is committed. Coordinate before merging.
   - Then remove the worktree and delete the branch.
6. **Next in the plan:** Run A3 (bed tiers with yielding), then A4 (Shrink beds). Still open from the plan's Run A: what happens when every Pilot is dead, and the leak-check question about Board turning to "explored" during a patrol landing. The leave-orbit AP shortfall (A2b's cause) also stays open.
