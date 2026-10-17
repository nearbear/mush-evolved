---
name: wrap-up
description: Finish a change in this project - verify it (typecheck, tests, build, screenshots), update the docs that track decisions (CLAUDE.md, docs/rules-design.md, docs/ai-workflow.md), update the GitHub issues it touches, and propose a small focused commit that references and closes them. Use when a task is done, before saying something is finished, or when asked to wrap up, finish, or commit.
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

- **`docs/code-map/<package>.md`**: one line per new, moved, or removed file. **`docs/implemented-rules.md`**: the bullet for any rule that changed.
- **`CLAUDE.md`**: commands (new npm scripts), the skills list, and "Open decisions" (remove anything settled). Keep it a summary.
- **`docs/rules-design.md`**: record each answered rule decision in "Decisions received", with the date. The issue is where the question was asked; this file is the record of the answer.
- **`docs/ai-workflow.md`**: a dated `###` entry. What was decided and **who decided it** (the user, or the assistant with approval), what worked, and anything that needed correction. Be honest about mistakes; the user is writing this up. Only ever append with `cat >>`, and never read the file first (it is large); do not rewrite existing entries.
- **`docs/mush-assets.md`**: if new facts about the archive came up.

## 3. Update the GitHub issues

Open work is tracked as GitHub issues in the [mush2 project](https://github.com/users/nearbear/projects/1) (see "Open decisions" in CLAUDE.md). Find the issues this change touches: the ones named in the conversation (e.g. "work on #25"), else `gh issue list --search "<keyword>"`. Read each with `gh issue view <n> --comments`. For each:

- **Done:** every part of the issue is finished and verified. It gets `Fixes #<n>` in the commit message (step 4), which closes it when the commit reaches `main` on GitHub. Don't close it by hand before the push: the issue should stay open until the work is actually on GitHub.
- **Partly done:** it gets `Refs #<n>` in the commit message. Tick the finished checklist items in the body: save it with `gh issue view <n> --json body --jq .body > <scratchpad>/body.md`, edit only the checkboxes, then `gh issue edit <n> --body-file <scratchpad>/body.md`. If what's left isn't obvious from the checklist, add a short `gh issue comment` saying what remains.
- **A rule decision answered** (label `rule-decision`): tick the answered question in the body, and comment with the answer, who decided, and that it is recorded in `docs/rules-design.md`. When every question is answered, remove the label (`gh issue edit <n> --remove-label rule-decision`). The issue stays open if the rule still has to be built; close it only if it was a decision with nothing to build (some Architecture issues).
- **Wrong or obsolete:** don't close or rewrite it yourself; say so in the summary and let the user decide.

Follow-ups that came up (a new rule question, a deferred feature, a bug found along the way): propose them as new issues in the summary, with the epic, milestone (or `needs-staging`), and labels you'd use. Create them only after the user says yes, then add each to the project with `gh project item-add 1 --owner nearbear --url <issue url>`. To put one under an epic, link it with `gh api -X POST repos/nearbear/mush2/issues/<epic>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the issue's database id (`gh api repos/nearbear/mush2/issues/<n> --jq .id`), not its number.

## 4. Propose the commit

Don't commit unless the user asks. When they do:

- `git status --short` and `git diff --stat`. Note anything the user staged themselves and don't unstage it.
- One logical change per commit. If the working tree mixes changes (e.g. a UI skin and a rule change), propose splitting them and list which files go in each.
- Commit directly to `main`; the user never wants a branch (CLAUDE.md).
- Message: a short imperative subject in the style of `git log --oneline`, a body explaining why if it isn't obvious, then the issue lines from step 3 (`Fixes #<n>` or `Refs #<n>`, one per line), then the attribution lines from the system prompt. Put `Fixes` only on a commit that completes the issue; if the work is split over several commits, the earlier ones get `Refs`.
- Don't push unless asked. Tell the user which issues will close when they push.

## 5. Summarize for the user

What changed, how it was verified, and what was skipped or is still open. Which issues will close on push, which were updated, and which proposed follow-up issues are waiting for a yes.
