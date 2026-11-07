# Docs

One line per document. Paths in docs and code are written from the repo root (`docs/...`); a test (`tools/tests/docs/docPaths.test.ts`) fails if one points at a missing file. Run `npm run lint:md` to lint the Markdown.

## Rules

- `rules/rules-design.md`: answered rule decisions and the design for rules not built yet.
- `rules/implemented-rules.md`: what the rules code does today, one bullet per rule.

## Plans

Feature designs in `plans/`, one per file. Each plan's own header is the authority on its status and open questions; this table is a summary, so update it when a plan's status changes. Decided rules are in `rules/rules-design.md`, what is built in `rules/implemented-rules.md`, and open work in GitHub issues.

**Done:** built, nothing planned left. **Partly:** some phases built. **Not built:** decided, not started. **Draft:** not decided. **Superseded:** kept for history.

| Plan | What | Done? | Status and what's left |
|---|---|---|---|
| `plans/astro.md` | Astro terminal, planet discovery | Done | Built 2026-10-19. The PLANET_SCANNER bonus is in [#331](https://github.com/nearbear/mush2/issues/331). |
| `plans/comms.md` | Communication center | Done | Built 2026-10-21. |
| `plans/relay-tokens.md` | Pooled contributions for research, projects and PILGRED | Done | Built 2026-10-31 ([#311](https://github.com/nearbear/mush2/issues/311)). |
| `plans/research-sabotage.md` | Research samples, assays and sabotage | Done | Built 2026-10-31 ([#311](https://github.com/nearbear/mush2/issues/311) part B). |
| `plans/patrol.md` | Patrol ships and the Pasiphae | Done | Every phase built, Pasiphae scrapping included ([#147](https://github.com/nearbear/mush2/issues/147)). |
| `plans/space-combat.md` | Hunters and space combat | Partly | Phase 1 built 2026-10-24, hunters following travel ([#240](https://github.com/nearbear/mush2/issues/240)) too. Wave scaling: [#241](https://github.com/nearbear/mush2/issues/241). |
| `plans/expedition.md` | Expeditions | Partly | Phase 1 built 2026-11-04 ([#319](https://github.com/nearbear/mush2/issues/319)). Phases 2–5: [#356](https://github.com/nearbear/mush2/issues/356), [#357](https://github.com/nearbear/mush2/issues/357), [#358](https://github.com/nearbear/mush2/issues/358), [#359](https://github.com/nearbear/mush2/issues/359). |
| `plans/on-call.md` | Channel plans and on-call summons | Partly | `shared` and server built ([#313](https://github.com/nearbear/mush2/issues/313), [#314](https://github.com/nearbear/mush2/issues/314)). UI: [#315](https://github.com/nearbear/mush2/issues/315); bots: [#316](https://github.com/nearbear/mush2/issues/316). |
| `plans/bot-goals.md` | Single-player bot goals and chat coordination | Partly | Steps 1–3 built 2026-11-01. Plans for bots ([#316](https://github.com/nearbear/mush2/issues/316)) and the open questions remain. |
| `plans/chat-pages.md` | Fixed 50-message chat pages ([#355](https://github.com/nearbear/mush2/issues/355)) | Partly | Phases 1–4 built 2026-11-06. The wrap-up (rules-design, flat-view sim) is left. |
| `plans/design-kit.md` | Components for the dev design kit and their `PlayerView` fixture | Partly | Handoff 2026-11-07; the fixture and terminal frame are built. Not a rules plan. |
| `plans/replay-viewer.md` | Replay viewer page, split into stories | Not built | Reviewed with the owner 2026-11-05 ([#156](https://github.com/nearbear/mush2/issues/156)). |
| `plans/inventory-notes.md` | Shared manual item notes for the crew | Draft | 2026-11-01; not decided. |
| `plans/balance.md` | Balance goals, targets, AP economy and tuning | Draft | 2026-11-04; not decided. |
| `plans/project-buffs.md` | Ideas for reworked and new NERON projects | Draft | Ideas only; not decided. |
| `plans/action-plans.md` | Scheduled action plans ([#44](https://github.com/nearbear/mush2/issues/44)) | Superseded | Replaced 2026-10-30 by `relay-tokens.md` and `on-call.md`. |

## Code map

- `code-map/README.md`: index; per-package maps in `code-map/shared.md`, `server.md`, `web.md`, `tools.md`.

## Assets

- `assets/mush-assets.md`: inventory and licensing of `Mush/`.
- `assets/tab-icons.md`: which icon each tab and button uses.
- `assets/icon-catalog.md`, `assets/design-catalog.md`: descriptions of the UI icons and the old site chrome.

## Operations

- `ops/d1-runbook.md`: D1 migrations and restores.
- `ops/deploy.md`: the three deployments and deploying test from CI.
- `ops/sign-in.md`: OAuth apps, secrets and sessions.
- `ops/r2.md`: the replay buckets, what a finished game's copy holds, and inspecting one.
- `ops/config.md`: every environment variable and secret, and where each is set.

## Process

- `process/ai-workflow.md`: append-only log of decisions made with AI assistance (append with `cat >>`; old entries keep the paths they had at the time).
- `process/commands.md`: every npm script and dev command, in detail (CLAUDE.md lists only the everyday ones).
- `process/testing.md`: what to test and why, with coverage status.
- `process/github-project.md`: how the GitHub project is organized.

`scratchpad/` holds notes and drafts; it is not maintained and is skipped by the checks.
