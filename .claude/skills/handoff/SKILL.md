---
name: handoff
description: Pause unfinished work so another session or tool can pick it up, or resume from such a note. Writes or reads docs/scratchpad/handoff-<issue>.md in a fixed outline. Use when asked to write a handoff, hand off, pause, save progress for later or for another tool, or to resume, pick up, or continue an issue from a handoff note (`/handoff 421`, `/handoff resume 421`).
disable-model-invocation: true
---

# Hand off or resume unfinished work

A handoff note lets a fresh session (or another tool, like agy) continue a task that isn't done. It is not `wrap-up`: don't run `verify`, don't commit, don't update `ai-workflow.md` or close issues. Those happen once, when the task is finished.

One note per issue: `docs/scratchpad/handoff-<issue>.md` (no issue: `handoff-<short-slug>.md`). Overwrite it on each handoff; delete it when the issue lands. This file is the exception to ignoring `docs/scratchpad/`.

## Writing a handoff

1. Find the issue number in the conversation, or take it from the arguments. If there's neither, ask.
2. Look at the real state, don't recall it: `git status --short`, `git diff --stat`, and `git log --oneline -5`. In a worktree, note which one and its branch.
3. Run only the tests that cover what changed (not `verify`), so "State" says what actually passes.
4. Write the note in the outline below, about 60 lines at most. Links are repo-relative (`server/src/bots/goals/travel.ts`), never `file:///` or absolute paths. Name files and functions; don't paste code or list every signature (the diff is in git). Issues are full links: `[#421](https://github.com/nearbear/mush2/issues/421)`.
5. Tell the user the path and the next step in two or three lines.

### Outline

```markdown
# Handoff: [#<n>](https://github.com/nearbear/mush2/issues/<n>) <issue title>

Written <date> by <tool/model>.

## Goal
What "done" means in one or two lines, including the bar the issue or owner set.

## State
Branch or worktree; committed vs uncommitted; which tests pass or fail (name them).

## Done
Short bullets, by area or file: what changed and why. Not how; the diff shows that.

## Decisions
Each one marked **owner** (with date) or **AI choice, not asked**. Rule decisions the owner made also belong in docs/rules/rules-design.md or the plan doc; say whether they're recorded yet.

## Next step
The first concrete thing to do, then the rest of the remaining work in order.

## Open questions
For the owner. Empty if none.

## How to check
Tests to run, survival command and baseline file (see the `bot` skill), latest numbers.
```

## Resuming from a handoff

1. Read `docs/scratchpad/handoff-<issue>.md` and the issue (`gh issue view <n>`).
2. Check the note against reality: `git status --short` and `git diff --stat`. If files the note calls changed aren't, or other files are, say so. Other sessions may have edited the checkout, so don't assume the extra changes are part of this task.
3. Treat **AI choice, not asked** decisions as open: if one touches a game rule, confirm it with the owner before building on it (CLAUDE.md: don't invent rules).
4. Report in a few lines what the note says is left, any mismatch, and the open questions. Then start on "Next step" unless something blocks it.
