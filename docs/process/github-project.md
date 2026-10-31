# The GitHub project

A guide to how the mush2 GitHub Project is organized. Counts are as of 2026-10-24.

## Overview

The mush2 project is a single GitHub Project ("mush2", project 1) that tracks every open piece of work as an issue. Issues come in two levels: **epics** group a topic, and **stories** (sub-issues) are the work inside it.

- **Epics** carry the `epic` label and are named "Epic: ..." (29 open, such as Rules, UI, Rendering, Bots, Testing). Each epic's sub-issues are its stories.
- **Stories** are written as "As a ..., I want ..., so that ...", followed by what the original Mush did (reference only), acceptance criteria, and open decisions.
- **Milestones** say when a story is due: Private beta, Public beta readiness, Public beta, Release. Stories without one carry `needs-staging`.
- **Rule decisions** are stories that cannot be built until the owner answers questions about the game rules. They carry `rule-decision`. Answers are recorded in `docs/rules/rules-design.md` and `docs/plans/action-plans.md`; nothing in an issue counts as decided until it is written there.

## Views

The project has four views, shown as tabs along the top of the project page.

| View | Layout | Filter | Grouping | Use it to |
| --- | --- | --- | --- | --- |
| Epics | Table | none | none | See every issue with its status and sub-issue progress; read the progress column on each epic to see how far along it is |
| Main | Board | `has:parent-issue milestone:"Private beta"` | Columns by Status; rows by Assignee | Run the day-to-day work: every Private beta story, moving across Todo, Blocked, In Progress and Done |
| Milestones | Table | none | By Milestone | See what is in Private beta, Public beta readiness, Public beta and Release, and how each is progressing |
| Decisions Needed | Board | `label:rule-decision is:open` | Columns by Status | See the open rule questions waiting on the owner |

All four show the same columns: Title, Assignees, Status, Linked pull requests and Sub-issues progress. Only the filter, layout and grouping differ.

`has:parent-issue` in Main hides the epics themselves, so the board shows stories only.

## Labels and fields

**Status** is the one custom field. It has four values: Todo, Blocked, In Progress and Done. The other fields are GitHub built-ins (Assignees, Labels, Milestone, Parent issue, Sub-issues progress, Linked pull requests, and so on).

Labels fall into three groups.

| Group | Labels | Meaning |
| --- | --- | --- |
| Workflow | `epic` | Parent issue that groups the stories of one topic |
| | `rule-decision` | Needs an answer from the owner before it can be built |
| | `needs-staging` | Not yet assigned to a milestone |
| | `needs-breakdown` | Epic still needs splitting into stories |
| | `leak-risk` | Hidden-information risk; run the leak-check skill |
| Area | `rules`, `ui`, `rendering`, `architecture`, `site`, `i18n`, `moderation`, `devops`, `planning`, `testing`, `data`, `wiki`, `bots`, `accessibility`, `documentation` | Which part of the project the issue belongs to; usually matches its epic |
| GitHub defaults | `bug`, `enhancement`, `question`, `good first issue`, `help wanted`, `duplicate`, `invalid`, `wontfix` | Standard GitHub labels, rarely used here |

## Milestones

Four milestones run in order.

| Order | Milestone | Open | Closed |
| --- | --- | --- | --- |
| 1 | Private beta | 90 | 7 |
| 2 | Public beta readiness | 6 | 0 |
| 3 | Public beta | 29 | 0 |
| 4 | Release | 7 | 2 |

Some stories still have no milestone (label `needs-staging`), so they are not in these counts.

## Common tasks

1. **Find what to work on now:** open the Main view. It lists Private beta stories by Status; pick from Todo.
2. **See how big a topic is:** open Epics and read the Sub-issues progress column on that epic.
3. **Answer a rule question:** open Decisions Needed, open the issue, and reply to its numbered open decisions. Once answered, the decision is recorded in `docs/rules/rules-design.md`.
4. **Plan a release:** open Milestones to see what each milestone holds. Filter on `label:needs-staging` to find stories that still need one.
5. **Add a story:** create an issue with the "As a ..., I want ..., so that ..." opening, add the labels (area, plus `rule-decision` and `needs-staging` if they apply), and attach it as a sub-issue of the matching epic so it appears in Main and Epics.
6. **Search from the terminal:** `gh issue list --label rule-decision` lists open decisions; `gh issue list --search "<keyword>"` finds a story; `gh issue view <n>` reads one.
