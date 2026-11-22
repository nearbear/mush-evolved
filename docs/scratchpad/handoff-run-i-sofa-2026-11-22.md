# Handoff: Run I, a sofa on the bridge for the Astrophysicist

Written 2026-11-22 for a fresh session continuing in the `run-e-astro-save` worktree
(`/home/near/mush2/.claude/worktrees/run-e-astro-save`, branch `run-e-astro-save`, based on `main` at `57e73eb0`).
Load the `bot-strategy` and `bot` skills first.

**This copy is in the main checkout; the work is not.** Everything below (code, saved runs, the "Run I" plan entry in
`docs/scratchpad/bot-survival-plan.md`, this handoff's twin) lives only in the worktree, uncommitted. Resume there:
`cd /home/near/mush2/.claude/worktrees/run-e-astro-save`. The main checkout's copy of the plan has no Run I entry yet.

## State of the worktree (all uncommitted, nothing landed)

- **Run E** (Astrophysicist saves AP for a full analysis; only fully analyzed planets get shared): `server/src/bots/goals/astro.ts`, `keepsAstroSaving` in `server/src/bots.ts`. A loss: mean days 7.40 → 6.27.
- **Run F** (`Mission: need AP`; the Commander gives the day's Issue mission to the first asker): `server/src/bots/missionShare.ts`, `server/src/bots/goals/issueMission.ts` (priority 77.2, Claude's pick, not confirmed). A small gain on top of E: 6.27 → 6.49, still about 0.9 days under `main`.
- **Loss report:** a new `astrophysicists:` line (`CycleReport.astro*` fields in `server/src/testing/survival.ts`, printed by `survivalReport.ts`). Keep it; it is the measure for Run I.
- Tests for E and F are in `server/tests/goals.test.ts`; `npm run verify` passed after Run F (rerun it once at the end of Run I).
- Saved runs in `docs/scratchpad/`: `survival-runE-base-2026-11-21.json` (main), `survival-runE-2026-11-21.json`, `survival-runF-2026-11-21.json` (each with a `-smoke` run), and `survival-astroAp-main-2026-11-21.json` / `survival-astroAp-runF-2026-11-21.json` (the same seeds, with the Astrophysicist fields).
- `main` has moved on since `57e73eb0`. The owner decides whether E/F land at all; if anything lands, merge `main` into the branch first and rerun the comparison.

## What the owner decided (2026-11-21)

- Build Run I on top of the current worktree (E + F), and measure it against Run F.
- Bots build the Sofa **only on the bridge** (`COMMAND_CENTER`, the astro terminal's room).
- **The Astrophysicist lies on the sofa.** The earlier idea of the Comms Officer lying there and giving Logistics is dropped for now.

## The measurement (seeds 1–50, crew 16, 30-day cap)

| Astrophysicists, per living one a cycle | `main` | Run E + F |
| --- | --- | --- |
| AP at a cycle's end | 3.74 | 5.82 |
| At the AP cap | 0% | 4% |
| At 2 AP or less | 42% | 22% |
| In the astro terminal's room at a cycle's end | 0% | 5% |
| Lying in a bed at a cycle's end | 65% | 37% |
| Holding a planet with an unknown sector | 48% | 48% |
| AP on moves | 0.68 | 0.58 |
| AP on scans + analyses | 0.69 | 0.72 |

Reading: the Astrophysicist makes about 1.65 AP a cycle (1, plus 1 while lying) and spends about 40% of it walking, mostly between a dorm bed and the bridge. It already lies down at most cycle ends on `main`, so the sofa's gain is mainly the walk, not the bed's +1. In Run E + F it saves AP and lies down less (37%), so there the bed's +1 matters too.

## Rules the work rests on (checked in code)

- `build` (`shared/src/actions/build.ts`): anyone, anywhere aboard, 3 AP, never fails. The blueprint must be reachable (carried or in the room); ingredients come from the room's floor first, then the builder's hands. A built sofa is equipment in the builder's room.
- Sofa recipe (`shared/src/blueprints.ts`): `metal_scraps` + `thick_tube`. `SOFA` in `equipment.ts` is a bed (`bed: true`, `builtOnly`).
- Spawns (`shared/src/config.ts`, start items): one Sofa blueprint is always placed in a random room (`daedalus_default`), and each of the 4 random blueprints can be a Sofa (weight 4 of 49). The thick tube spawns in a storage room (`pool: "storage"`). Metal scraps are around and already shared by bots.
- Any action gets you out of bed (`shared/src/bed.ts`); lying down is free; +1 AP a cycle while lying (`lying_down`).

## Open questions: ask the owner before building

1. **Who fetches and builds?** Any bot that passes the blueprint, a thick tube or scrap? Only the Astrophysicist? A Technician? And at what priority (the build costs 3 AP plus the carrying)?
2. **Finding the parts.** Bots find things only by what they saw or a fixed chat line (standing direction). Add the Sofa blueprint and `thick_tube` to the item-sharing lines (`itemShare.ts`, `SHARED_ITEMS`)? The blueprint item's type is `blueprint` with a `builds` field, so the line needs a distinct name, e.g. `sofa_blueprint`.
3. **Carrying.** Who carries the blueprint and the tube to the bridge? Can one bot carry everything (hand slots)? Does it drop them on the bridge floor for someone else to build?
4. **Keeping the sofa for the Astrophysicist.** The sofa is a bed for anyone, and the bed tiers (`bedShare.ts`) put the Astrophysicist in tier 2 with the Gunner and the Comms Officer, below Pilots and the Commander, who are on the bridge a lot. Reserve the sofa for an Astrophysicist, or have it ask with the `Bed: waiting in` line like any bed?
5. **Two Astrophysicists** (Frieda and Gioele): one sofa. First come, or the one holding planets?
6. **When the Astrophysicist lies down.** Between astro work, at any priority? It gets up for fires, oxygen tanks and self-care as other resting bots do. In Run E it should lie on the sofa while saving, instead of idling or walking.
7. **Dismantling.** Should a bot ever dismantle a sofa that is not on the bridge (a player could build one elsewhere)? Probably not; confirm.
8. **Logistics later?** Jin Su and Paola have Logistics (+1 AP a cycle to a random crewmate in their room below the cap). Dropped for now; possibly a separate run.

## Suggested order once answered

1. Unit-test the new goals (`server/tests/goals.test.ts`), like the astro and mission tests.
2. Smoke run: `npm run survival -w server -- --seeds 1-10 --crew 16 --report --out docs/scratchpad/survival-runI-smoke-<date>.json --compare docs/scratchpad/survival-runF-smoke-2026-11-21.json`. Paths are relative to the repo root (the worktree), not `server/`. Check that a sofa gets built and when (add a field: cycle the sofa was built, and the AP the bots spent fetching and building), and that the astro line's move AP fell.
3. Full run against `survival-runF-2026-11-21.json`, about 6 minutes in the background.
4. Record it: a bullet in `docs/plans/bot-goals.md` ("Reaching Eden"), the Run I status in the plan, one `docs/process/ai-workflow.md` entry (append with `cat >>`), `leak-check` if a goal reads something new, then `npm run verify`.
