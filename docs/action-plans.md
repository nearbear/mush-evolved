# Plan: action system and scheduled plans (written 2026-10-13)

Implemented so far: the action registry (Phase 1, without `room` and `plannable`) and private channels (Phase 2). **Decisions** are confirmed by the user; **Open questions** must be answered before building the phase they block. Do not guess them.

## Goal

Actions behave as in the original Mush, plus one addition: **plans**. A player posts a plan in a private channel. The plan is an ordered list of **jobs**, and each job is one action by one player. Other members opt into jobs. When the trigger fires (a real-world time, or the moment the last job is filled), the game performs the jobs in order on the players' behalf. Jobs can be marked optional; a required job that is unfilled or fails stops the plan, and whatever already ran stays done.

The problem this solves: today, relaying on research and projects needs both players online together, or logging on in sequence, so that nobody contributes twice in a row. A plan lets them coordinate while offline.

## Decisions

- **No new powers.** A planned action is a normal action performed later. A job stores the same `Action` a player could send live and runs through the same legality check and `applyAction`. A plan can never do anything a sequence of live actions couldn't.
- **Repeat penalty:** the research/project penalty applies to **consecutive** participation by the same player. Plans handle it by ordering jobs (A, B, A, B). The rule itself lives in the normal research action and needs no special case for plans.
- **Locked AP.** Claiming a job locks the AP it will cost. Locked AP can't be spent on anything else. It is spent when the plan runs and released if the plan fails, is cancelled, or the player withdraws. The AP bar draws locked pips with a cross-hatch overlay (CSS, no new art).
- **Travel is part of every job.** Before a job's action, the game walks the actor along the shortest path to the room the action needs, paying MP (or an AP conversion) per door exactly as walking it live, and visible to anyone along the way. The lock includes that travel, computed from where the actor is at claim time.
- **Standalone movement jobs** exist for when moving is the whole point ("Alice: be in the Bridge at 21:00"). They store a destination; the path is found at run time.
- **Shadow targets** (revised 2026-10-13, replaces "the author must be in the target's room"): the author picks any character and any room, from anywhere, and a shadowy copy of that character stands in that room as the target while planning. The job's room is fixed when posted. If the target isn't there at run time, the job fails. The game never follows a target, because that would track players for you.
- **No lookahead:** a job's checks run only when execution reaches it, after its travel. Nothing (the executor, preflight hints, the plan estimate) may check a target's presence or a room's items early, because that would reveal where a player or item is without anyone walking there. With this rule, learning "Bob isn't in the Lab" costs exactly what walking there live costs.
- **Item jobs name a type, not an instance** ("take a medkit in the Laboratory"); a matching item is picked at run time. Planning shows the full item catalog on shelves, never real items, so a plan never reveals where a specific item is.
- **Triggers:** every plan has a scheduled time. The author may tick "run as soon as all jobs are filled", in which case it runs on the last claim instead (still failing at the scheduled time if unfilled).
- **Optional jobs:** the author marks each job required or optional. An optional job that is unfilled or fails is skipped and the plan continues. A required job that is unfilled (at a timed trigger) or fails stops the whole plan at that point; jobs already run stay done (no rollback), and locks for jobs that never ran are released. Reason (2026-10-13): with rollback, one saboteur removing a vital item (an apron for research, a gun from Icarus Bay before an expedition) would wipe out everyone's work.
- **No fixed start room:** a plan has no starting room. Each job's travel is computed from where its actor is when the job runs.
- **Templates** are the only auto-created jobs: a preset list of jobs for things known to require coordination (example: a patient picks up a medkit, walks to the medic's room, and the medic heals them). No automatic prerequisite suggestions. Which templates exist is decided per action as those actions get their rule pass.
- **Secret substitution** (decided 2026-10-13): whoever holds a job may secretly swap in any other action. Only they can see it. At run time the game performs the substitute instead, through the normal checks, costs, log lines and witnesses, so it adds no new powers. The plan card shows a substituted job as done, exactly like an honest one; players work out what happened from the log and their own state. A job that fails (substitute or not) still shows as failed. Locked AP is based on the substitute's cost (AP is private, so this reveals nothing). Reason: players must be able to slip malicious actions into a plan (spiking the coffee a teammate brings you). If plans were always honest, an item that didn't exist when the plan was made, fetched and handed over by the plan, would be provably safe.
- **Replace or run before** (decided 2026-10-13): a secret action either replaces its job's action or runs just before it. Every plan ends with a fixed **completion step** (no action, never fails) so "run before completion" covers acting after the last job; there is no "run after". Secrets can be set, changed, or removed any time until the plan runs.
- **Secrets are recorded as macros in planning mode** (decided 2026-10-13): each job holder can open the plan in planning mode, step to any job, and act through their shadow character; what they do is recorded as a sequence of actions attached to that job (replace or before). The simulation they see is the public plan plus their own secrets only, built from what they already know (their own stats and inventory, the catalog, shadows), with no lookahead.
- **Plan item handles** (confirmed 2026-10-13, to solve "which coffee"; in planning mode the shadow holds a placeholder labelled with its step): an item a plan step acquires gets a plan-local handle ("the coffee from step 1"), bound to the real item when that step runs. Later steps and secrets refer to the handle, not just the type. In their own secret macro, a holder may also pick a specific item they really carry (they already know their inventory), which is how a pre-spiked coffee gets swapped in.
- **Failed "before" secrets** are skipped silently: the plan carries on and only their actor learns why (confirmed 2026-10-13). Other members can't tell a secret existed.
- **Secrets before the same step** run in the order they were set (confirmed 2026-10-13).
- **One open plan per player per channel** (from the planning note). The Mush can plan in the Mush channel once roles and that channel exist.
- **Witnesses:** a planned secret action is witnessed by whoever is in the room when it runs, exactly as if it were done live.
- **No outside visibility:** only members of the plan's channel can see a plan, including Mush. There is no special access for any role.
- **Lock amount:** claiming locks what the plan would cost if it ran now, simulated through the preceding jobs (so a move that needs an AP-to-MP conversion locks 1 AP).
- **Under-locked jobs:** if a job costs more at run time than was locked (e.g. MP was spent live), free AP tops it up. If there isn't enough, the job fails (skipped if optional, otherwise the plan stops).
- **Withdrawing:** allowed any time up to the run.
- **Unfilled `runWhenFilled` plans** fail at their scheduled time like any other plan; the time doubles as the deadline (revised 2026-10-13, replaced the separate 24 h deadline).
- **Plans are immutable once posted.** Only the author can cancel, then repost.
- **Losing access:** leaving the channel or dying withdraws that player's jobs and releases their locks. Dropping or losing the iTrackie does not: it is needed to see and claim plans, not for claimed jobs to run.
- **Channel limits:** simple placeholders in config, marked unconfirmed (3 channels per player, no member cap, invite anyone who carries an iTrackie).
- **No disclosure:** a planned action's log lines and witness view are identical to a live one. Only channel members see that it came from a plan, on the plan card.
- **Failure detail:** other members see only whose job failed. The exact reason goes to that job's actor alone (it can reveal private AP or inventory). `viewFor` strips it.
- **Live actions may break your own plan** (walking away, dropping a needed item). The plan fails at run time, the same as sabotage.
- **Cycles run on a timer:** 3 hours, 8 per day, as in eMush (timer decided 2026-10-05 in `docs/plan.md`, length 2026-10-13). The "ready" action goes away. Cycle length is a config value so tests and dev can shorten it.
- **Tie order:** when a plan's time equals a cycle boundary, the cycle ticks first, so the plan can use the new AP.
- **Notifications:** in-game only. The plan card shows the outcome and each participant gets a private log line. No push or email in the slice.
- **Lead time:** timed plans can be 1 minute to 48 hours ahead (placeholder config values).
- **AP cap counts locked AP:** locking moves nothing out of the pool, so the cycle gain is still capped at 12 total.

## Design

### Core principle

Planned actions don't get their own rules. If an action works live, it works in a plan. New actions become plannable automatically unless marked otherwise.

### Phase 1: Action registry (implemented; `room`, `plannable`, and locked AP still to add)

Collapse the per-action branches in `legalActions` and `applyAction` into one table:

```ts
type ActionDef<A extends Action> = {
  type: A["type"];
  cost(state, actor, action): { ap: number; mp: number };  // through modifiers.ts
  check(state, actor, action): string | null;              // null = legal, else the reason it isn't
  apply(next, actor, action, rng): void;
  room(state, actor, action): RoomId | null;              // where it must happen; null = anywhere
  plannable: boolean;
};
```

`legalActions` lists candidates and filters them by `check`. `applyAction` runs `check`, charges `cost`, then calls `apply`. The plan executor calls the same function. The existing tests should pass unchanged.

The legality check must take locked AP into account: a live action is legal only if `ap - lockedAp` covers it. Running a plan job spends that job's own lock, not free AP.

### Phase 2: Private channels (implemented 2026-10-13)

Decisions: any member can invite any living player, from any room; new members see the whole history; joining is immediate (no accept step); the limit is 3 channels per player (counting ones you were invited to), read through the `channelLimit` modifier so skills and research can change it later (neither exists yet); the last member to leave deletes the channel and its messages. Dead members stay listed but can't read or post (see the spectator to-do in `docs/plan.md`). The text below is the original sketch.

- `PrivateChannel { id, members: PlayerId[], createdBy }`. Reading and posting need an iTrackie, like the other threads.
- Only members can see that a channel exists, who is in it, and what it says. That filtering goes in `viewFor`, with leak tests.
- Actions: create, invite, leave. Limits per the open questions.

### Phase 3: Plans and jobs (pure, in `shared`)

```ts
type Plan = {
  id: PlanId;
  channelId: ChannelId;
  author: PlayerId;
  time: number;                // epoch ms, from the server; runs then, or fails if a required job is unfilled
  runWhenFilled: boolean;      // also run as soon as the last job is filled
  jobs: Job[];                                                     // run in this order
  status: "open" | "done" | "stopped" | "cancelled";
  stoppedAt?: { job: number; reason: string };                     // reason reaches only that job's actor
};
type Job = {
  action: PlannedAction;       // a live intent, except items are named by type and resolved at run time
  actor: PlayerId | null;      // null = open slot
  room: RoomId | null;         // where the action happens, fixed when set; travel goes here first
  optional: boolean;           // unfilled or failed: skip instead of stopping the plan
  reservedFor?: PlayerId;      // optional: only this player may claim it
  lockedAp: number;            // set on claim
  secret?: { mode: "replace" | "before"; actions: PlannedAction[] };  // viewFor shows it only to the actor
  outcome?: "done" | "skipped" | "failed";
};
```

One player may hold several jobs in one plan (move, then research).

**Pure functions:** `postPlan`, `claimJob`, `withdrawJob`, `cancelPlan` (author only), and `runDuePlans(state, now)`. The rules never read a clock; the server passes `now`.

**Running a plan:**
1. Run the jobs in order, each through the shared action path: travel to its room, then check, cost, apply. Checks happen only at that moment (no lookahead). A job spends its own lock first and tops up from free AP if it costs more.
2. An optional job that is unfilled or fails is marked skipped and the plan continues. A required one stops the plan: earlier jobs stay done, locks of jobs that never ran are released, and the plan records which job stopped it and why ("Bob wasn't in the Laboratory"). Only that job's actor sees the reason.
3. Log entries, witnesses, and visibility are exactly what the same live actions would produce.

Partial completion (revised 2026-10-13, was all-or-nothing): a saboteur who removes a vital item or walks away can stop the rest of a plan but can't undo work already done. The tradeoff, accepted: a stopped plan can leave someone half-way (Alice walked to the medic, the medic's heal failed), and the plan shows whose job failed.

**Preflight hints:** a player sees hints only for their own jobs, and only about things they already know: their own AP, MP, items, and travel cost. Hints never reveal another member's AP, inventory, or whether a target is still in its room, since all of those are private. Hints come from simulating the plan with the same `check`, but on a **knowledge sandbox**, not a clone of the real state: the simulating player's own stats and inventory, the map and fixed equipment, catalog placeholders for items, and shadows for targets, all assumed present. A clone of the real state would be lookahead. The client computes no legality.

### Phase 4: Server

- `GameRoom` sets one Durable Object alarm for the earliest of: the next cycle boundary and the earliest timed plan. When it fires, it calls `runDuePlans(state, Date.now())`, saves, broadcasts each player's view, and re-arms.
- `runWhenFilled` plans run inside `claimJob` when the last slot fills, with no alarm.
- Protocol: `postPlan`, `claimJob`, `withdrawJob`, `cancelPlan`, each validated as untrusted input in `protocol.ts`.
- The alarm covers every plan's scheduled time, including `runWhenFilled` plans that never filled.
- Abuse limits: open plans per player and per channel, jobs per plan, and the allowed lead time for timed plans.

### Phase 5: UI

- `ITrackie`'s private channel stub becomes a real channel list. In a channel, a plan card shows the trigger (local time and a countdown, or "runs when filled"), the jobs with claim and withdraw buttons, preflight hints, and the outcome.
- A "Plan this" option next to live action buttons opens a composer with that action prefilled.
- Planning mode (from the planning note, 2026-10-13): a Plan button in a private channel switches the room view into planning mode. The player moves the camera around the ship freely (this is not real movement; travel is computed at run time). Other characters are hidden; shelves show the whole item catalog with a search box instead of real items; "Target character" picks a character, whose shadow appears in the room as the target. A bar lists the plan's jobs (with required/optional toggles) and an estimate of the cost in AP and MP (and spores, once they exist; special AP isn't counted but is spent as usual at run time). The estimate is built from what the planner already knows and assumes every target is present.
- Templates: picking one fills the composer with its preset jobs, which the author can then adjust before posting. The UI for choosing templates is undecided.
- `PipBar` draws locked AP with a cross-hatch.
- Everything must work in the phone tab layout. All new text goes through i18n (en/fr/es).

### Phase 6: Bots

Bots see plans in their own channels through their normal view. Claim and withdraw are ordinary legal intents. Scripted bots can claim relay jobs. Model bots treat plan text as untrusted.

## Tests (rules)

- A timed plan runs at its time, not before. A `runWhenFilled` plan runs on the last claim.
- An unfilled required job stops a timed plan; an unfilled optional job is skipped.
- A failed required job stops the plan there: earlier jobs stay done, later jobs don't run, and their locks are released. A failed optional job is skipped.
- No lookahead: a job whose target is missing fails only after its actor has travelled there and paid for it.
- An item job takes any item of its type in the room at run time.
- Jobs run in order, and each job's travel is paid like walking live (MP per door, conversion when out of MP).
- A job whose target moved out of its fixed room fails; the game doesn't follow it.
- Preflight hints never include another player's AP, items, or a target's current room.
- A failed plan shows other members only whose job failed; the reason reaches only that actor.
- A shadow target can be posted from anywhere, and posting or estimating a plan never depends on where the target really is.
- A, B, A, B ordering avoids the consecutive-participation penalty (once research exists).
- Locked AP can't be spent live. Withdrawing, cancelling, leaving the channel, or dying releases it; dropping the iTrackie doesn't.
- A move job locks 1 AP when it would need a conversion. A job that costs more than its lock tops up from free AP, or fails the plan if there isn't enough.
- An unfilled `runWhenFilled` plan stops at its scheduled time.
- Only the author can cancel.
- A planned action's log entries are identical to the live action's.
- A secret planned action is witnessed by players in the room at run time, and only by them.
- Non-members, including Mush, can't see a channel's plans in `viewFor`.
- A "before" secret runs just before its job; one before the completion step runs after the last job. A secret can be changed until the run.
- A step that refers to a plan item handle uses the exact item an earlier step acquired, not another of the same type.
- A substitute runs instead of the declared action, is visible in `viewFor` only to its actor, and its job shows as done like an honest one; a failed substitute shows as failed.
- Equivalence: a plan's result equals the same actions applied live in the same order.

## Build order (plans run instantly; pacing later)

Plans run all at once when triggered: one call to the executor performs every job and returns the new state. Pacing is in Future. Each step below is one or a few small commits, uses only today's actions (move, take, drop, examine), and goes through the `rule` skill (rules) or `leak-check` (anything touching `viewFor`, protocol, or `GameRoom`). Nothing waits on research, healing, or roles.

1. **Registry additions** (`shared/src/actions.ts`, `rules.ts`). Add `room` and `plannable` to `ActionDef`. Split `applyAction` into a public wrapper and an internal `perform(next, actor, action, pay)` that checks, charges, and applies on an already-cloned state, so live actions and plan jobs share one path. Add `shortestPath(rooms, from, to)` (BFS on the room graph; none exists yet). No behavior change; existing tests pass unchanged.
2. **Plan types, posting, cancelling, visibility.** `Plan`, `Job`, and `PlannedAction`, where an item reference is one of `{ type }` (any of that type, resolved at run time), `{ handle: step }` (the item an earlier step acquired), or `{ item }` (a specific item the actor really carries, only in their own secrets). Every plan gets the completion step. `postPlan(state, author, channel, draft, now)` checks membership, one open plan per author per channel, job count, and lead time; targets may be anywhere (shadows). `cancelPlan` is author-only. `viewFor` sends plans only to members of their channel. Leak tests: non-members (including Mush) see nothing.
3. **Claiming and locked AP.** `claimJob`, `withdrawJob`, and the release paths (cancel, leaving the channel, death). `PlayerState.lockedAp`; every live `check` treats `ap - lockedAp` as available. Lock amounts and preflight hints come from `simulatePlan(state, viewer, plan)` on the knowledge sandbox, with travel from the actor's current room. Tests: locked AP can't be spent live, every release path, the AP cap counts locked AP, hints never use another player's private state or a target's real room.
4. **Executor.** `runPlan(state, planId)` and `runDuePlans(state, now)`, plus `runWhenFilled` inside `claimJob`. Per job: walk the shortest path one door at a time through `move`, resolve item references, check, pay from the lock then free AP, apply. Optional jobs skip; a required failure stops the plan and releases the remaining locks; handles bind as items are acquired. Outcomes and the private reason are recorded; participants get a private log line. Tests: the run-time list above (no lookahead, equivalence with live play, identical log lines, witnesses, unfilled jobs, stop vs. skip).
5. **Secrets.** `setSecret` / `clearSecret` on your own job, any time until the run (replace or before; a sequence counter records the order they were set). The executor runs "before" secrets in that order and skips failures silently; replacements fail like the job would. `viewFor` shows a secret only to its actor; the plan card shows done either way. The rules are testable now with take/drop/examine even though the hostile actions they exist for don't exist yet. The empty-replacement rule is still open (below) and blocks only this step.
6. **Server.** Protocol messages (`postPlan`, `cancelPlan`, `claimJob`, `withdrawJob`, `setSecret`, `clearSecret`) with `parse*` validators. `GameRoom` arms one Durable Object alarm for the earliest plan time, calls `runDuePlans(state, Date.now())`, saves, broadcasts views, and re-arms. Abuse limits: per-player message rate, jobs per plan, lead time.
7. **Plan card UI** (first usable version). In the Private tab: a list of the channel's plans, each card showing time and countdown or "runs when filled", jobs with claim and withdraw, your preflight hints, and the outcome. A "Plan this" button beside live action buttons adds that action to a simple composer list (no planning mode yet). `PipBar` cross-hatches locked AP. Phone layout and en/fr/es from the start.
8. **Planning mode** (the recorder). The room view renders any room from static data with other characters hidden, catalog shelves with search, shadow targets, placeholder items labelled with their step, and a timeline to step through; authors record jobs and holders record secrets the same way. This is the largest piece and gets its own UI plan before starting.
9. **Bots.** Scripted bots claim jobs they can afford and otherwise ignore plans; model bots see plan text as untrusted. Bots never set secrets until roles exist.
10. **Cycle timer** replacing "ready" (decided separately; independent of plans, can go any time). After it lands, add the tie-order rule: a cycle boundary at the same time as a plan ticks first.

Later, each after its own rule pass: research and relay templates, healing and the medic template, coffee and spiking, pacing.

## Open questions

None for the plan system itself. Dependencies that need their own rule pass:

- **Research and projects** (the main use case): actions, costs, efficiency, the exact consecutive-participation penalty, and where they happen.
- **Private channel limits** in the original, to replace the placeholders.
- **Healing, the medkit, and medics** (the first template): who must hold the medkit, what healing costs, and who can heal.
- **Mechanics named in the planning note's stop conditions** that don't exist yet: broken or guarded doors, broken equipment, being dirty and terminals that refuse dirty players, apprenticing skills, spores, special AP, and the Mush channel (needs roles).
- **Empty replacements:** the user's intent (2026-10-13) is that skipping a required job must fail the plan visibly (not equipping the spacesuit before an expedition). Proposal awaiting confirmation: a replacement must contain at least one action; an empty one counts as a failed job. Note that a non-empty replacement whose effect nobody depends on (replace "heal Alice" with "examine Alice") still shows as done; players notice only through consequences.
- **Coffee, spiking, and giving items** (the motivating example) need their own rule pass.

## Future (noted, not to be modelled now)

- **Natural pacing** (asked 2026-10-13): run plan steps spread out over time, so movement looks like a person walking rather than a scheduler. Same feature as action durations below. Notes: recorded wall-clock time from planning mode includes thinking time, so a synthetic pace (per action, from config, maybe seeded jitter, plus explicit waits) is likely better; a secret macro would lengthen the timeline and so be a visible tell unless pacing hides it; stepwise execution makes the plan a resumable cursor driven by the alarm and lets live actions interleave mid-plan. Log entries carry only the cycle today, so a burst is visible only to people online when it runs.

- **Race conditions:** a plan runs instantly in one step, so it can collide with live actions or other plans due at the same moment (someone takes the medkit just before the plan runs). The user's idea: give actions artificial time durations. Not modelled in the slice.
