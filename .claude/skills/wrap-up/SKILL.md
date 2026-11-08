---
name: wrap-up
description: Finish a change in this project - verify it (typecheck, tests, build, screenshots), update the docs that track decisions (CLAUDE.md, docs/rules/rules-design.md, docs/process/ai-workflow.md), update the GitHub issues it touches, and propose a small focused commit that references and closes them. Use when a task is done, before saying something is finished, or when asked to wrap up, finish, or commit.
disable-model-invocation: true
---

# Wrap up a change

CLAUDE.md: run typecheck and tests before saying something is done, keep commits small and focused, and keep a log of AI-assisted decisions. This is that checklist.

## 1. Verify

**Don't repeat work.** Skip any check below that already passed in this conversation with no relevant edits since: a `verify` run, a `leak-check`, a build, screenshots. Say which ones you skipped and when they passed. Rerun a check only if files it covers changed after it passed (for `leak-check`: rules, views, protocol, server or bot prompt files).

```bash
npm run verify         # typecheck, lint and all tests, quiet unless something fails
npm run build          # if web/ changed
```

- UI, CSS, asset, or renderer change: do not run the `play` skill unless the user asked; just say a visual check was skipped. If they did ask, look at **both** the desktop and the phone screenshots. Mobile is first-class (CLAUDE.md rule 7). If the change touches the chat input or full-height layout, say the on-screen keyboard still needs a real-phone check.
- Rules, views, protocol, server, or bot change: run the `leak-check` skill, unless it already ran on these changes (see above).
- `ship-layout` inputs changed: `npm run ship-layout` (a test fails if the derived file is stale).
- `wrangler.jsonc` or Durable Object exports changed: `npm run types -w server`.
- Stored shape changed (`GameState`, a struct in it, or `ConfigOverrides`): confirm each new field has a default in its normalizer (`shared/src/normalizeState.ts`) that is right for a game in progress, with no `STATE_VERSION` change. A removal, rename, changed type or renamed registry id needs an `upgradeTo<N>` step and a bump; if one landed, tell the user it must deploy on its own (`docs/ops/deploy.md`).

Report failures with their output. Don't say done if anything failed or was skipped; say what was skipped.

## 2. Update the docs

Only where something actually changed:

- **`docs/code-map/<package>.md`**: one line per new, moved, or removed file. **`docs/rules/implemented-rules.md`**: the bullet for any rule that changed.
- **`CLAUDE.md`**: commands (new npm scripts), the skills list, and "Open decisions" (remove anything settled). Keep it a summary.
- **`docs/rules/rules-design.md`**: record each answered rule decision in "Decisions received", with the date. The issue is where the question was asked; this file is the record of the answer.
- **`docs/process/ai-workflow.md`**: one dated `###` entry for the whole task (skip it if this conversation already appended one and nothing notable happened since). What was decided and **who decided it** (the user, or the assistant with approval), what worked, and anything that needed correction. Be honest about mistakes; the user is writing this up. Only ever append with `cat >>`, and never read the file first (it is large); do not rewrite existing entries.
- **`docs/assets/mush-assets.md`**: if new facts about the archive came up.

## 3. Update the GitHub issues

Open work is tracked as GitHub issues in the [mush2 project](https://github.com/users/nearbear/projects/1) (see "Open decisions" in CLAUDE.md). Find the issues this change touches: the ones named in the conversation (e.g. "work on #25"), else `gh issue list --search "<keyword>"`. Read each with `gh issue view <n> --comments`. For each:

- **Done:** every part of the issue is finished and verified. It gets `Fixes #<n>` in the commit message (step 4), which closes it when the commit reaches `main` on GitHub. Don't close it by hand before the push: the issue should stay open until the work is actually on GitHub.
- **Partly done:** it gets `Refs #<n>` in the commit message. Tick the finished checklist items in the body: save it with `gh issue view <n> --json body --jq .body > <scratchpad>/body.md`, edit only the checkboxes, then `gh issue edit <n> --body-file <scratchpad>/body.md`. If what's left isn't obvious from the checklist, add a short `gh issue comment` saying what remains.
- **A rule decision answered** (label `rule-decision`): tick the answered question in the body, and comment with the answer, who decided, and that it is recorded in `docs/rules/rules-design.md`. When every question is answered, remove the label (`gh issue edit <n> --remove-label rule-decision`). The issue stays open if the rule still has to be built; close it only if it was a decision with nothing to build (some Architecture issues).
- **Wrong or obsolete:** don't close or rewrite it yourself; say so in the summary and let the user decide.

**Epic checklists.** Each epic's issue body keeps a `## Stories` checklist, one line per sub-issue: `- [ ] #<n> <short title>`, ticked when the story is done, with any story that is next or blocked noted after the title. When a story here closes, is partly done, or is created, update its epic's checklist the same way as the story body (save with `--json body`, edit only that section, `gh issue edit --body-file`). If the epic has no checklist yet, add one built from its sub-issues (`gh api repos/nearbear/mush2/issues/<epic>/sub_issues --jq '.[]|[.number,.state,.title]|@tsv'`). The point is that "what's next for X?" can be answered from one `gh issue view <epic>`.

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
