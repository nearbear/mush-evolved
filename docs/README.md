# Docs

One line per document. Paths in docs and code are written from the repo root (`docs/...`); a test (`tools/tests/docs/docPaths.test.ts`) fails if one points at a missing file. Run `npm run lint:md` to lint the Markdown.

## Rules

- `rules/rules-design.md`: answered rule decisions and the design for rules not built yet.
- `rules/implemented-rules.md`: what the rules code does today, one bullet per rule.

## Plans

Feature designs; status table in `plans/README.md`.

- `plans/astro.md`, `comms.md`, `space-combat.md`, `patrol.md`, `relay-tokens.md`, `research-sabotage.md`, `on-call.md`, `expedition.md`, `bot-goals.md`, `inventory-notes.md`, `action-plans.md`.

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
