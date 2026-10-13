---
name: wrap-up
description: Finish a change in this project - verify it (typecheck, tests, build, screenshots), update the docs that track decisions (CLAUDE.md, docs/rules-design.md, docs/ai-workflow.md), and propose a small focused commit. Use when a task is done, before saying something is finished, or when asked to wrap up, finish, or commit.
disable-model-invocation: true
---

# Wrap up a change

CLAUDE.md: run typecheck and tests before saying something is done, keep commits small and focused, and keep a log of AI-assisted decisions. This is that checklist.

## 1. Verify

```bash
source ~/.nvm/nvm.sh
npm run typecheck
npm test
npm run build          # if web/ changed
```

- UI, CSS, asset, or renderer change: do not run the `play` skill unless the user asked; just say a visual check was skipped. If they did ask, look at **both** the desktop and the phone screenshots. Mobile is first-class (CLAUDE.md rule 7). If the change touches the chat input or full-height layout, say the on-screen keyboard still needs a real-phone check.
- Rules, views, protocol, server, or bot change: run the `leak-check` skill.
- `ship-layout` inputs changed: `npm run ship-layout` (a test fails if the derived file is stale).
- `wrangler.jsonc` or Durable Object exports changed: `npm run types -w server`.
- `GameState` shape changed: confirm `STATE_VERSION` in `server/src/GameRoom.ts` was bumped.

Report failures with their output. Don't say done if anything failed or was skipped; say what was skipped.

## 2. Update the docs

Only where something actually changed:

- **`docs/code-map.md`**: the "Implemented rules" paragraph and the code map (new files or modules).
- **`CLAUDE.md`**: commands (new npm scripts), the skills list, and "Open decisions" (remove anything settled). Keep it a summary.
- **`docs/todo.md` and `docs/rules-design.md`**: tick answered items under "Open rule decisions" with the date and the answer, and record the decision in "Decisions received".
- **`docs/ai-workflow.md`**: a dated `###` entry. What was decided and **who decided it** (the user, or the assistant with approval), what worked, and anything that needed correction. Be honest about mistakes; the user is writing this up. Only ever append with `cat >>`, and never read the file first (it is large); do not rewrite existing entries.
- **`docs/mush-assets.md`**: if new facts about the archive came up.

## 3. Propose the commit

Don't commit unless the user asks. When they do:

- `git status --short` and `git diff --stat`. Note anything the user staged themselves and don't unstage it.
- One logical change per commit. If the working tree mixes changes (e.g. a UI skin and a rule change), propose splitting them and list which files go in each.
- Commit directly to `main`; the user never wants a branch (CLAUDE.md).
- Message: a short imperative subject in the style of `git log --oneline`, a body explaining why if it isn't obvious, and the attribution lines from the system prompt.

## 4. Summarize for the user

What changed, how it was verified, what was skipped or is still open, and which follow-ups came up (new rule questions, deferred features).
