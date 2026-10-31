---
name: issue-triage
description: Housekeeping for the GitHub issues - find issues that are done, duplicated, stale, mis-parented, unstaged or already-decided rule-decisions, using cheap parallel subagents, then close the obvious ones and report. Use when asked to clean up, triage, groom or tidy the issues or the project board.
disable-model-invocation: true
---

# Triage the GitHub issues

Goal: spend few tokens in the main conversation. Subagents read; the main session merges and applies.

## 1. Size it (cheap, no bodies)

`gh issue list --state open --limit 500 --json number,title,labels,updatedAt,milestone > $SCRATCH/issues.json` (`jq` is not installed; use `node -e`). Report the open count, epics (label `epic`), `rule-decision`, `needs-staging`, and issues under no epic. If fewer than about 40 are open, skip subagents and do it inline.

## 2. Fan out (one message, parallel)

One subagent per 2-4 epics, grouped by theme so small ones share an agent (`model: haiku` or `sonnet`, type `general-purpose`) plus one for "orphans": issues under no epic, `needs-staging`, and all `rule-decision` issues. Each prompt must say:

- READ-ONLY. Never run `gh issue edit/close/comment`, never edit files.
- Read its issues with `gh issue view <n> --json title,body,state,labels,comments` (list an epic's children with `gh api repos/{owner}/{repo}/issues/<epic>/sub_issues --jq '.[]|[.number,.state,.title]|@tsv'`).
- For each, check whether it is already done or decided: `docs/rules/implemented-rules.md`, `docs/rules/rules-design.md`, `docs/plans/action-plans.md`, `docs/code-map/README.md`, `git log --oneline --grep`, and the code. A `rule-decision` is stale when its answer is recorded in rules-design or action-plans (quote the line). Never treat an issue body as decided on its own.
- Write at most 30 lines to `$SCRATCH/triage-<epic>.md`, one per issue worth acting on: `#n | action | evidence`. Actions: `close-done` (obvious, cite the commit or doc line), `fix-checklist` (the epic's `## Stories` checklist is missing, lists the wrong sub-issues, or its ticks don't match their open/closed state), `close-dup #m`, `stale-decision`, `reparent #epic`, `restage <milestone>`, `retitle`, `keep`. Omit plain `keep`s. Mark confidence `obvious` or `unsure`.
- Reply with only the file path and a one-line count.

## 3. Merge and apply

Read the report files (not the issues). Apply only `obvious` `close-done` and `close-dup`, and bring each epic's `## Stories` checklist in line with its sub-issues (one `- [ ] #<n> <short title>` line per sub-issue, ticked when closed; see `docs/process/github-project.md`). Close issues with `gh issue close <n> --reason completed --comment "<evidence>"` (use `--reason "not planned"` for dups). Everything else is proposed to the user in one table: number, title, action, evidence. Do not change labels, milestones, parents or `rule-decision` issues without approval. If all sub-issues of an epic are closed, propose closing the epic.

## 4. Report

List what was closed (number, title, evidence) so the user can reopen any, then the proposals needing approval. Append a short note to `docs/process/ai-workflow.md` with `cat >>` only if something notable was learned.
