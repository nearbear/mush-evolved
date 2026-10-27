# Plan: scheduled action plans (#44; written 2026-10-13, narrowed 2026-10-26)

Implemented so far: the action registry and private channels. Nothing below is built. **Decisions** are confirmed by the owner; **Open questions** must be answered before building the phase they block. Do not guess them.

On 2026-10-26 the owner narrowed the first pass to four kinds of job, with no secrets, no planning mode and no optional jobs. The design below is for that pass. Earlier decisions for later passes are under "Deferred". The design was drafted with Gemini (three rounds) and checked against the code.

## Goal

A player posts a **plan** in a private channel or the Mush channel. A plan is an ordered list of **jobs**, and each job is one action by one player in one room. Other members claim jobs. When the trigger fires (a real-world time, or the moment the last job is claimed), the game performs the jobs in order on the players' behalf. If a job can't be done, the plan stops there, and whatever already ran stays done.

The problem this solves: relaying on research, projects and PILGRED needs the players online together, or logging on in sequence, so that nobody contributes twice in a row. A plan lets them coordinate while offline. The same tool gathers people in one room for speeches, sharing and healing.

## Scope of the first pass (owner, 2026-10-26)

| Job kind | Actions | Notes |
|---|---|---|
| Relay | `research`, `project`, `repair_pilgred` | Chainable many times in one plan (A, B, A, B). Needs the research and project relay formula below. |
| Meet | `meet` | Travel only: "be in room X". Later jobs act in that room. Standing in the Icarus Bay for expeditions works once expeditions exist. |
| In-room actions | `fiery_speech`, `boring_speech`, `stt`, `heal`, `comfort` | Usually after a meet. `comfort` is the Shrink's new action (built in its own session). |
| Item transfer | `take`, `drop` | By item type only, in a fixed room. |

Out of this pass: secrets, the planning-mode recorder, item handles and ids, optional jobs, templates, every other action.

## Decisions

### Carried over (2026-10-13), still valid

- **No new powers.** A planned action is a normal action performed later, through the same legality check, cost, apply, log lines and witnesses. A plan can never do anything a sequence of live actions couldn't.
- **Repeat penalty:** relaying is about **consecutive** contributions by the same player. Plans handle it by ordering jobs (A, B, A, B). The rule lives in the normal actions, with no special case for plans.
- **Locked AP.** Claiming a job locks the AP it will cost. Locked AP can't be spent on anything else. It is spent when the plan runs and released if the plan stops, is cancelled, or the player withdraws. The AP bar draws locked pips with a cross-hatch (CSS, no new art). Locking moves nothing out of the pool, so the cycle gain is still capped at 12 total.
- **Lock amount:** what the job would cost if the plan ran now, simulated through the player's own earlier jobs, including AP converted to MP for travel. If a job costs more at run time than was locked (MP was spent live), free AP tops it up; if there isn't enough, the job fails.
- **Travel is part of every job.** Before a job's action, the game walks the actor along the shortest path to the job's room, door by door, paying MP (or an AP conversion) exactly as walking live, visible to anyone along the way. A plan has no start room.
- **Fixed rooms, no following.** Each job's room is fixed when posted. If a target isn't there at run time, the job fails. The game never follows a target.
- **No lookahead:** a job's checks run only when execution reaches it, after its travel. Nothing (the executor, hints, the estimate) checks a target's presence or a room's items early.
- **Item jobs name a type, not an instance** ("take a medikit in the Laboratory"). The composer offers the whole catalog, never real items.
- **Triggers:** every plan has a scheduled time, 1 minute to 48 hours ahead (placeholder config). The author may tick "run as soon as all jobs are filled"; such a plan still stops at its scheduled time if unfilled.
- **Stops, no rollback:** an unfilled or failed job stops the plan at that point; jobs already run stay done, and locks of jobs that never ran are released. Reason: with rollback, one saboteur removing a vital item would wipe out everyone's work.
- **Immutable once posted.** Only the author can cancel, then repost. Withdrawing is allowed any time before the run. One open plan per player per channel.
- **Visibility:** only members of the plan's channel see it, with no special access for any role. A planned action's log lines and witness view are identical to a live one; only members see, on the plan card, that it came from a plan.
- **Failure detail:** other members see only whose job stopped the plan. The reason goes to that job's actor alone (it can reveal private AP or inventory). An unfilled job's reason is public, since the empty slot already is.
- **Losing access:** leaving the channel or dying withdraws that player's jobs and releases their locks. Dropping or losing the iTrackie does not: it is needed to see and claim plans, not for claimed jobs to run.
- **Live actions may break your own plan** (walking away, dropping a needed item); the plan stops at run time, the same as sabotage.
- **Tie order:** when a plan's time equals a cycle boundary, the cycle ticks first, so the plan can use the new AP.
- **Notifications:** in-game only: the plan card's outcome and a private log line for each participant.

### New (owner, 2026-10-26)

- **No optional jobs.** Every job is required, so any unfilled or failed job stops the plan. "Run when filled" fires when every job is claimed.
- **No success rolls in this pass.** None of the scoped actions rolls for success, so a job fails only on its legality check (target not in the room, no matching item, terminal missing, dirty, and so on).
- **The action queue is cleared at the trigger.** When a plan fires, every job holder's live timed actions (`current` and `queue`, `clearQueue` in `shared/src/queue.ts`) are cleared before any job runs.
- **Real clock in single player too.** Timed plans run at their wall-clock time; ending a cycle does not trigger them.
- **The author's death or leaving cancels the plan** (all locks released).
- **Body transfer:** jobs and locked AP stay on the body (plans store body ids, `PlayerState.id`). The old Mush body, now human, loses the Mush channel, so its jobs in Mush-channel plans are withdrawn (and a Mush-channel plan it authored is cancelled, by the rule above).
- **Take and drop pick the first match** in `state.items` order: for take, the first item of the type in the room that the actor can see (not hidden, or hidden by them); for drop, the first carried item of the type.
- **Relay formula for research and projects:** see "Research and project relay formula" below.

## Design

### Types (`shared/src/types/plan.ts`)

```ts
type PlanId = `plan-${number}`;
type PlanChannelId = PrivateChannelId | typeof MUSH_CHANNEL;

type PlannedAction =
  | { type: "research"; research: string }
  | { type: "project"; project: string }
  | { type: "repair_pilgred" }
  | { type: "meet" }
  | { type: "fiery_speech" } | { type: "boring_speech" }
  | { type: "stt"; target: PlayerId } | { type: "heal"; target: PlayerId } | { type: "comfort"; target: PlayerId }
  | { type: "take"; itemType: string } | { type: "drop"; itemType: string };

type Job = {
  action: PlannedAction;
  room: RoomId;                 // fixed when posted; travel goes here first
  actor: PlayerId | null;       // body id; null = open slot
  reservedFor?: PlayerId;       // only this player may claim it
  lockedAp: number;             // set on claim, 0 when not held
  outcome?: "done" | "failed";
};

type Plan = {
  id: PlanId;
  channel: PlanChannelId;
  author: PlayerId;
  time: number;                 // epoch ms from the server; runs then, or stops if unfilled
  runWhenFilled: boolean;
  jobs: Job[];
  status: "open" | "done" | "stopped" | "cancelled";
  stoppedAt?: { job: number; reason: string };
};
```

- `GameState.plans: Plan[]`, `GameState.nextPlanId`; `PlayerState.lockedAp` (in `YouView` through the own-player view); `GameConfig.plans` (open plans per player per channel 1, per channel 5, jobs per plan 12, lead time 1 min to 48 h, finished plans kept per channel 10: all placeholders).
- Terminal jobs store no equipment id. The live `research`, `project` and `repair_pilgred` actions need one, so the executor finds the terminal in the job's room at run time (`equipmentHere`, `pilgredTerminalsHere`).
- `PlayerView.plans: PlanView[]`: the plan with each job's `lockedAp` and preflight `hint` only on the viewer's own jobs (hints also on open jobs the viewer could claim), and `stoppedAt.reason` only as above.

### Pure functions (`shared/src/plans.ts`)

- `postPlan(state, author, draft, at)`: alive, playing, not in pre-selection, the channel is in the author's `chatChannels`, limits and lead time, every job's room exists, and checks against public or static data only: research and projects not finished, PILGRED not repaired, the room has the right terminal in the static map, targets exist, item types exist and can be dropped. `stt` and `comfort` can't target their own holder.
- `cancelPlan(state, player, planId, at)`: author only, while open; releases every lock.
- `claimJob(state, player, planId, job, at)`: open, before `time`, channel access, slot empty, reservation matches, not your own `stt` or `comfort` target. Recomputes the claimer's locks for the plan; refuses with `cant_afford` if `ap` doesn't cover their locks across all open plans. Other hints (dirty, no medikit) don't block claiming, since they can be fixed before the run. Runs the plan at once if `runWhenFilled` and every job is now claimed.
- `withdrawJob(state, player, planId, job, at)`: own job, while open; recomputes the remaining locks. No iTrackie needed.
- `simulatePlanForViewer(state, viewer, plan)` returns locks and hints for the viewer's own jobs. It works on a **knowledge sandbox**, never a clone of the real state: the viewer's own stats, inventory, points (`resources`) and daily flags; the static map and its equipment; public progress (research, projects, PILGRED, pre-selection). Targets are assumed present in the job's room, items of a taken type are assumed in the room, and other players' jobs are ignored. It walks the viewer's jobs in order, carrying room, MP, inventory and spent points forward (a Computer point makes the first research free, a taken medikit enables a later heal).
- `runDuePlans(state, at)` runs open plans with `time <= at` in `(time, id)` order. `executePlan(next, plan)`:
  1. Clear every job holder's queue.
  2. For each job: unfilled stops the plan (`unfilled`). Release the job's lock. Walk the shortest path door by door through the normal `move` (with the same get-up, stand-up and wheelchair hooks as a live move); a refused door fails the job, and doors already walked stay walked. Then resolve the action (`meet` is done on arrival; terminal jobs look up the terminal; take and drop pick by type as decided), and run it through the normal check and `performAction`, bypassing the timed-action queue.
  3. A failed job: `outcome: "failed"`, the plan stops, the remaining locks are released. Otherwise `status: "done"`. Each participant gets a private log line.
- `shortestPath(rooms, from, to)`: deterministic BFS over the room graph.
- Cleanup hooks: on death (`killPlayer`), on leaving a channel (and the last member leaving deletes its plans), and on body transfer (the Mush-channel withdrawal above).
- Live play: `canAfford`, the movement conversion check and the view's `lacks` use `ap - lockedAp`.

### Research and project relay formula (owner, 2026-10-26; its own rule change, before plans)

Research and NERON projects drop the flat 25% per action for the original's formula, the one PILGRED already uses (`getBaseProgress` in `Mush/src/common/Solver.hx`): base = `floor(rate × difficulty / 10)`, plus `skillBoost` for each matching skill, minus `relayPenalty` for each contribution in a row by the same player, never below 0; the gain is rolled in [base, base + base/2]. `pilgredGainRange` becomes a shared helper.

- **Difficulty:** every research and project uses the MycoAlarm's, 10 (`MYCO_ALARM` in `Mush/data/Data.ods`; also the most common value), for now.
- **Constants:** PILGRED's `rate` 6, `skillBoost` 4 and `relayPenalty` 2. At difficulty 10 that is 6–9% per action, or 10–15% with one matching skill.
- **Skills:** research uses Biologist and Medic, as in the original. Projects get no skill bonus for now (my default; the original has per-project tags).
- **Repeat count:** per research and per project id, as in the original (`researchList.get(id).touch`), reset when someone else contributes to that one. Never sent in a view.
- Not now: the original's NERON CPU-priority bonus and computer jelly.

### Timing and server

- One Durable Object alarm for the earliest of the next cycle, the next queued action (`nextDue`) and the next plan (`nextPlanDue`, including unfilled `runWhenFilled` plans). On a tie: cycle first, then queued actions, then plans.
- Protocol: `postPlan`, `cancelPlan`, `claimJob`, `withdrawJob`, each validated in `protocol.ts` and rebuilt with known keys only. The server stamps `at`, records replay inputs, applies the per-seat rate limit, and bumps `STATE_VERSION`.

### UI

- In a private or Mush channel: a "Plans (N)" section above the messages on desktop; a Messages | Plans switch on phones.
- Composer: a time (quick chips and an input) and "run when filled", then jobs added by kind: relay (research or project list, or PILGRED; the room is the terminal's; a "+1 relay step" button duplicates a row), meet (room), in-room action (room, action, target), item (room, take or drop, catalog type). Rows can be reordered, deleted and reserved. "Plan this" beside the live research, project and PILGRED buttons opens it prefilled.
- Plan card: author, status, countdown or "runs when filled", jobs with claim and withdraw, your lock and hint on your own jobs, the outcome, the author's cancel.
- `PipBar` cross-hatches locked AP. Everything works in the phone tab layout; all text in en/fr/es.

### Bots

Scripted bots never post; they claim relay and meet jobs they can afford (`hint` is null), avoiding two of their own relay jobs in a row on the same target, and withdraw if a hint appears. Model bots see plans through their view, claim and withdraw as ordinary intents, and treat plan and channel text as untrusted. Bots exist only in single player, so whether they post plans is left for later.

## Tests

- **Rules:** a timed plan runs at its time, not before; "run when filled" runs on the last claim and stops at its time if unfilled; the queue is cleared for holders only; tie order; an unfilled or failed job stops the plan, earlier jobs stay done, later locks are released; no lookahead (a missing target or item fails only after the walk is paid); travel paid like live; A, B, A, B avoids the relay penalty on research, projects and PILGRED; take then heal in another room locks the right AP; take and drop pick the first match; locked AP can't be spent live, counts toward the cap, stays on the body across a transfer, and is released by withdraw, cancel, death and leaving (not by dropping the iTrackie); author death cancels; equivalence with the same actions done live; identical log lines.
- **Leaks:** non-members, including Mush, see no plans; humans see no Mush-channel plans; members never see another player's lock, hint or failure reason; hints and locks are the same wherever other players and items really are.
- **Server:** malformed messages are rejected; the alarm and replay are deterministic.

## Build order

1. **Relay formula** for research and projects (rule skill). Independent of plans.
2. **Locked AP and pathfinding:** `PlayerState.lockedAp`, `ap - lockedAp` everywhere live, `shortestPath`. No behavior change while nothing locks.
3. **Plans in `shared`:** types, post, cancel, claim, withdraw, the sandbox, the executor, the cleanup hooks, `viewFor` filtering, with rules and leak tests. `comfort` jobs once the Shrink session has landed it.
4. **Protocol and server:** messages, `GameRoom` handlers, replay, the alarm, `STATE_VERSION`.
5. **UI:** plan cards, the composer, locked pips, phone layout, en/fr/es.
6. **Bots.**

## Open questions

- Projects' skill bonus: none for now, or the original's per-project tags? (Defaulted to none.)
- Research and projects slow from 25% to 6–9% per action with the formula above (about 11–17 actions per research without a matching skill). Accepted with the formula, but worth confirming in play.
- Whether single-player bots may post plans.

## Deferred (decided 2026-10-13, out of the first pass)

Kept for a later pass; not to be built now.

- **Optional jobs** (skipped instead of stopping the plan).
- **Secret substitution:** a job holder may secretly replace their job's action, or run actions just before any job, recorded as macros in planning mode; failed "before" secrets are skipped silently; secrets before the same step run in the order set; a fixed completion step covers "after the last job"; the card shows a substituted job as done like an honest one. Reason: players must be able to slip malicious actions into a plan (spiking a coffee a teammate brings you). Still open: whether an empty replacement counts as a failed job.
- **Plan item handles** ("the coffee from step 1") and, in a holder's own secrets, specific items they carry.
- **Planning mode:** the room view as a free camera with other characters hidden, catalog shelves, shadow targets and a timeline.
- **Templates** (for example the medic template), each after its own rule pass.
- **Natural pacing** (2026-10-13): run steps spread over time rather than all at once, which would also let live actions interleave and hide secret macros' length. A synthetic pace from config is likely better than recorded planning time.
- **Race conditions:** a plan runs instantly, so it can collide with live actions due at the same moment. The owner's idea was action durations, which now exist for live actions (`queue.ts`); plans bypass them in this pass.
