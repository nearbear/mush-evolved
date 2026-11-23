# Docs

One line per document. Paths in docs and code are written from the repo root (`docs/...`); a test (`tools/tests/docs/docPaths.test.ts`) fails if one points at a missing file. Run `npm run lint:md` to lint the Markdown.

## Rules

- `rules/rules-design.md`: answered rule decisions and the design for rules not built yet.
- `rules/implemented-rules.md`: what the rules code does today, one bullet per rule.
- `rules/changes-from-emush.md`: implemented changes in Mush: Evolved compared to eMush.

## Plans

Feature designs in `plans/`, one per file. Decided rules are in `rules/rules-design.md`, what is built in `rules/implemented-rules.md`, and open work in GitHub issues. Completed and superseded plans are archived in `plans/archive/`.

- `plans/balance.md`: balance goals, design pillars, targets, AP economy and tuning (draft).
- `plans/balance-review.md`: review of the balance plan: diagnosis, design tests, the order to decide things in.
- `plans/bot-goals.md`: single-player bot goals, chat coordination, and the survival harness direction for reaching Eden (partly built).
- `plans/inventory-notes.md`: shared manual item notes for the crew (draft).
- `plans/merchants.md`: merchant ships: transport (built), mercenaries, tech, archeologists, scrappers, librarians ([#143](https://github.com/nearbear/mush2/issues/143), partly built).
- `plans/observability.md`: server logs and running-ships list (built), alerts and moderator list ([#127](https://github.com/nearbear/mush2/issues/127), partly built).
- `plans/on-call.md`: channel plans and on-call summons (`shared` and server built; UI [#315](https://github.com/nearbear/mush2/issues/315) and bots [#316](https://github.com/nearbear/mush2/issues/316) remaining).
- `plans/performance.md`: state cloning (`cloneState`, `fullViewFor`, `sendChat` COW), `config` mutation guards, and test speedups (not built).
- `plans/project-buffs.md`: ideas for reworked and new NERON projects (draft).
- `plans/replay-viewer.md`: replay viewer page, split into stories ([#156](https://github.com/nearbear/mush2/issues/156); stories 1–4 and 6 built, story 5 [#371](https://github.com/nearbear/mush2/issues/371) remaining).

## Code map

- `code-map/README.md`: index; per-package maps in `code-map/shared.md`, `server.md`, `web.md`, `tools.md`.

## Assets

- `assets/mush-assets.md`: inventory and licensing of `Mush/`.
- `assets/tab-icons.md`: which icon each tab and button uses.
- `assets/icon-catalog.md`, `assets/design-catalog.md`: descriptions of the UI icons and the old site chrome.

## Operations

- `ops/d1-runbook.md`: D1 migrations and restores.
- `ops/deploy.md`: the three deployments and deploying test from CI.
- `ops/rollback.md`: rolling back a bad deploy (Worker, static assets, D1, and `STATE_VERSION` checks).
- `ops/sign-in.md`: OAuth apps, secrets and sessions.
- `ops/r2.md`: the replay buckets, what a finished game's copy holds, and inspecting one.
- `ops/observability.md`: Workers Logs, the log events and what must never be logged; the running-ships table and `npm run ships`.
- `ops/config.md`: every environment variable and secret, and where each is set.

## Process

- `process/ai-workflow.md`: append-only log of decisions made with AI assistance (append with `cat >>`; old entries keep the paths they had at the time).
- `process/commands.md`: every npm script and dev command, in detail (CLAUDE.md lists only the everyday ones).
- `process/testing.md`: what to test and why, with coverage status.
- `process/github-project.md`: how the GitHub project is organized.

`scratchpad/` holds notes and drafts (completed ones in `scratchpad/archive/`); it is not maintained and is skipped by the checks.
