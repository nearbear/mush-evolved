# Plan: scheduled action plans (#44; written 2026-10-13, narrowed 2026-10-26)

> **Superseded (2026-10-30).** The owner dropped the generic executor (scheduled time, locked AP, knowledge sandbox, arbitrary jobs). Relaying is now pooled contributions, `docs/relay-tokens.md`; coordination is channel plans with on-call summons, `docs/on-call-plans.md`, which lists which decisions below still carry over. Kept for history and for the deferred features.

Implemented so far: the action registry and private channels; build steps 1 (the relay formula) and 2 (`PlayerState.lockedAp` and `freeAp` in every live affordability check, `actNow` in `queue.ts`, `shortestPath` in `paths.ts`; nothing locks AP yet). The rest is not built. **Decisions** are confirmed by the owner; **Open questions** must be answered before building the phase they block. Do not guess them.

On 2026-10-26 the owner narrowed the first pass to four kinds of job, with no secrets, no planning mode and no optional jobs. The design below is for that pass. Earlier decisions for later passes are under "Deferred". The design was drafted with Gemini (three rounds) and checked against the code; a feasibility review the same day (Claude) found no blocker and added the "Review findings" decisions and the UI detail below.

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
- **No patrol craft (owner, 2026-10-27):** they have no doors, so `shortestPath` can't reach them; `postPlan` refuses jobs in a patrol craft's room, for now or for good.
- **Ready players' jobs still run (owner, 2026-10-28):** pressing End cycle (manual cycles only) doesn't stop a plan job, as it doesn't stop an action queued before it. The executor acts in place without `canAct`'s ready check.
- **Relay formula for research and projects:** see "Research and project relay formula" below.

### Review findings (owner, 2026-10-26, from the feasibility review)

- **Dirt rolls stay.** "No success rolls" holds, but research and PILGRED roll 25% for dirt (PILGRED also 5% for a 2 HP injury), and research, projects and PILGRED refuse dirty actors, so in an A, B, A, B relay a player's second step fails if their first made them dirty (about 44% of four-step research relays stop early). Accepted as "no new powers". The remedy is the **apron**: `performAction` skips the dirt roll for anyone carrying one. No new job kind: the composer's "with apron" option on a relay row expands into `take apron`, the relay action and `drop apron` in the terminal's room (the first take's room editable, since the only apron starts in the Sick Bay). No `shower` job in this pass.
- **A job can close the plan it is in.** An injury can kill a holder or the author mid-run, and `killPlayer` withdraws jobs or cancels the plan. The executor re-reads the plan by id after every job and stops if it is no longer open. No rollback, as before.
- **Claim and withdraw are untimed registry actions** (`claim_job`, `withdraw_job`, like `ready`): `candidates` lists the jobs this player may claim or withdraw, so parse, check and the view's `actions` come free, and scripted and model bots use them like any action with no new plumbing (`hint === null` is an empty `lacks`). Post and cancel stay chat-like messages, since a draft can't be enumerated. "Run when filled" therefore executes other players' actions inside a claim's `apply`, on the already cloned state; the nested `performAction` calls each check the everyone-ready cycle advance, so the manual-cycles case gets a test.
- **PILGRED's difficulty stays at 2** while research and projects use 10: the asymmetry is intended.
- **Clearing the queue at the trigger** tells each holder with the existing `actionDropped` private line, not silently.

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
- `claim_job` (registry action, untimed, 0 AP, `recorded: false`; `shared/src/actions/claim_job.ts`): candidates are the open jobs in plans of channels in the player's `chatChannels` that are open, before `time`, unreserved or reserved for them, and not their own `stt` or `comfort` target. `apply` recomputes the claimer's locks for the plan; `validate` refuses with `cant_afford` if `ap` doesn't cover their locks across all open plans. Other hints (dirty, no medikit) don't block claiming, since they can be fixed before the run. Runs the plan at once if `runWhenFilled` and every job is now claimed.
- `withdraw_job` (registry action, untimed): candidates are the player's own jobs in open plans; `apply` recomputes the remaining locks. No iTrackie needed.
- `simulatePlanForViewer(state, viewer, plan)` returns locks and hints for the viewer's own jobs. It works on a **knowledge sandbox**: a fresh `GameState` (every `check` and `cost` takes one) built only from what the viewer knows: their own `PlayerState`, inventory, points (`resources`) and daily flags; the static map and its equipment; public progress (research, projects, PILGRED, pre-selection); phantom targets as stub players standing in the job's room; a phantom item of each taken type in its room. Other players' jobs are ignored, and hidden facts about others are assumed favourable (a `stt` target has not shared today). It walks the viewer's jobs in order as check, pay cost, `def.apply` directly, never `performAction`, so no dirt or injury rolls, no history and no cycle advance; room, MP, inventory and spent points carry forward (a Computer point makes the first research free, a taken medikit enables a later heal). This one file is where the leak check concentrates.
- `runDuePlans(state, at)` runs open plans with `time <= at` in `(time, id)` order, as the server-driven input `{ type: "runPlans", at }` (recorded, so replays are deterministic). `executePlan(next, planId)`:
  1. Clear every job holder's queue, with an `actionDropped` private line for each action dropped.
  2. For each job: re-find the plan by id and stop if it is no longer open (a death or channel exit in an earlier job closed it). Unfilled stops the plan (`unfilled`). Release the job's lock. Walk the shortest path door by door through the normal `move`; a refused door fails the job, and doors already walked stay walked. Then resolve the action (`meet` is done on arrival; terminal jobs look up the terminal; take and drop pick by type as decided), and run it through `actNow`, bypassing the timed-action queue.
  3. A failed job: `outcome: "failed"`, the plan stops, the remaining locks are released. Otherwise `status: "done"`. Each participant gets a private log line.
- `actNow(next, actor, action)`: extracted from the untimed path of `queueAction` (`queue.ts`), the get-up, stand-up and end-accommodation hooks plus `performAction`, so a planned action and a live untimed one go through one function.
- `shortestPath(rooms, from, to)`: deterministic BFS over the room graph.
- Cleanup hooks: on death (`killPlayer`), on leaving a channel (`removeFromChannel`, which both death and `leaveChannel` go through; the last member leaving deletes its plans), and on body transfer (the Mush-channel withdrawal above).
- Live play: `canAfford` (action.ts), `moveCost` (modifiers.ts, through its `ap`/`mp` pick), `move`'s validate and the view's `lacks` use `ap - lockedAp`. Reads of raw `ap` for other purposes (Consume's cap, Logistics' takers) stay.

### Research and project relay formula (owner, 2026-10-26; its own rule change, before plans; built 2026-10-27)

Research and NERON projects drop the flat 25% per action for the original's formula, the one PILGRED already uses (`getBaseProgress` in `Mush/src/common/Solver.hx`): base = `floor(rate × difficulty / 10)`, plus `skillBoost` for each matching skill, minus `relayPenalty` for each contribution in a row by the same player, never below 0; the gain is rolled in [base, base + base/2]. `pilgredGainRange` becomes a shared helper (`relayGainRange` in `shared/src/relay.ts`). Streaks live in `state.relay.research` / `state.relay.projects` (sibling records, `STATE_VERSION` 79).

- **Difficulty:** every research and project uses the MycoAlarm's, 10 (`MYCO_ALARM` in `Mush/data/Data.ods`; also the most common value), for now.
- **Constants:** PILGRED's `rate` 6, `skillBoost` 4 and `relayPenalty` 2. At difficulty 10 that is 6–9% per action, or 10–15% with one matching skill.
- **Skills:** research uses Biologist and Medic, as in the original. Projects use the original's per-project tags, two skills each (owner, 2026-10-27; built, `PROJECTS` in `projects.ts`).
- **Repeat count:** per research and per project id, as in the original (`researchList.get(id).touch`), reset when someone else contributes to that one. Never sent in a view. `state.research` and `state.projects` are plain number records today; each entry gains `lastBy` and `streak` (or a sibling record), with a `STATE_VERSION` bump.
- Not now: the original's NERON CPU-priority bonus and computer jelly.

### Timing and server

- One Durable Object alarm for the earliest of the next cycle, the next queued action (`nextDue`) and the next plan (`nextPlanDue`, including unfilled `runWhenFilled` plans). On a tie: cycle first, then queued actions, then plans. `onAlarm` and `scheduleTick` gain the third due source; the due plan run is sent as the `runPlans` input, stamped `max(now, time)` like a tick.
- Protocol: `postPlan` and `cancelPlan` as chat-like messages, validated in `protocol.ts` and rebuilt with known keys only; claim and withdraw arrive as ordinary `action` messages. The server stamps `at`, records replay inputs, applies the per-seat rate limit, and bumps `STATE_VERSION`.

### UI

Everything the composer offers comes from the view: channel members, the room list, the research and project catalogs, the item type catalog, the living players. It never computes legality, presence or ownership; refusals and hints come back from the server on post and claim.

- **Where:** in a private or Mush channel, a "Plans (N)" section above the messages on desktop, with a "New plan" button; a Messages | Plans switch on phones. "Plan this" beside the live research, project and PILGRED buttons in the terminal dialog opens the composer with one relay row prefilled and the channel to pick.
- **Composer:** a dialog like the create-channel one on desktop (the iTrackie panel is too narrow), a full-screen sheet in the chat tab on phones. Three stacked parts:
  1. **When:** quick chips (in 2 h, in 8 h, tomorrow 09:00) and a date-time input, within the lead-time window; a "run as soon as every job is claimed" checkbox.
  2. **Jobs:** add buttons per kind, then one row per job with a drag handle, a delete, and a "reserved for" picker defaulting to anyone.
     - *Relay:* terminal picker (research, project, PILGRED), then the unfinished target from the catalog; the room is the terminal's, shown read-only; a "with apron" checkbox (expands at post time into take apron, the relay action, drop apron in the terminal's room, the first take's room editable so it can point at the Sick Bay; the card shows the three as an indented group); a "+1 relay step" button duplicates the last relay row with the slot left open.
     - *Meet:* a room picker only.
     - *Action:* room, action (Fiery speech, Boring speech, STT, Heal, Comfort), and a target picker for the three that need one. The composer doesn't know who has which skill, so a job nobody can do just stays unclaimable, and the slot's hint tells whoever tries why.
     - *Item:* room, take or drop, item type from the catalog.
  3. **Post:** a summary line (job count, how many the author holds), the Post button disabled with an inline reason while the plan is empty, over the job cap or outside the time window. Server refusals (channel limit, one open plan per channel) show as a toast and keep the draft. A "claim now" shortcut posts and claims the author's reserved rows in one go.
- **Plan card:** author, countdown or "or when filled", the author's cancel; one line per job with its action, room and holder or Claim button (and "reserved: name"); your own jobs show the lock, the hint and Withdraw. After the run, done jobs are ticked, the failed job is marked "stopped here", and the private reason appears only on your own job. Finished plans stay on the card list up to the per-channel cap.
- `PipBar` cross-hatches locked AP the moment a claim lands. Everything works in the phone tab layout; all text in en/fr/es.

### Bots

Scripted bots never post; they claim relay and meet jobs they can afford (`claim_job` in `legalIn(view)`, `hint` null), avoiding two of their own relay jobs in a row on the same target, and withdraw if a hint appears. Model bots see plans through their view, claim and withdraw as ordinary actions, and treat plan and channel text as untrusted. Bots may post plans (owner, 2026-10-28): that is much of the point, so a bot can ask to be healed or ask others to help with research.

## Tests

- **Rules:** a timed plan runs at its time, not before; "run when filled" runs on the last claim and stops at its time if unfilled; the queue is cleared for holders only; tie order; an unfilled or failed job stops the plan, earlier jobs stay done, later locks are released; no lookahead (a missing target or item fails only after the walk is paid); travel paid like live; A, B, A, B avoids the relay penalty on research, projects and PILGRED; take then heal in another room locks the right AP; take and drop pick the first match; locked AP can't be spent live, counts toward the cap, stays on the body across a transfer, and is released by withdraw, cancel, death and leaving (not by dropping the iTrackie); author death cancels; a job that kills the author or a holder stops the run cleanly; a relay with apron never gets dirty, one without can and its second step then fails; "run when filled" from a claim with everyone ready in manual cycles; the trigger's queue clear logs `actionDropped`; equivalence with the same actions done live; identical log lines.
- **Leaks:** non-members, including Mush, see no plans; humans see no Mush-channel plans; members never see another player's lock, hint or failure reason; hints and locks are the same wherever other players and items really are.
- **Server:** malformed messages are rejected; the alarm and replay are deterministic.

## Build order

1. **Relay formula** for research and projects (rule skill). Independent of plans.
2. **Locked AP, `actNow` and pathfinding:** `PlayerState.lockedAp`, `ap - lockedAp` everywhere live, the `actNow` extraction, `shortestPath`. No behavior change while nothing locks.
3. **Plans in `shared`:** types, post, cancel, the `claim_job` and `withdraw_job` actions, the sandbox, the executor and `runPlans` input, the cleanup hooks, `viewFor` filtering, with rules and leak tests. `comfort` jobs once the Shrink work (in the tree, uncommitted on 2026-10-26) is committed.
4. **Protocol and server:** the post and cancel messages, `GameRoom` handlers, replay, the alarm, `STATE_VERSION`.
5. **UI:** plan cards, the composer, locked pips, phone layout, en/fr/es. The composer and the sandbox hints are the two largest pieces; if bots are wanted first, phases 1 to 4 and 6 can land with a card and the "Plan this" prefill only.
6. **Bots.**

## Open questions

- ~~Projects' skill bonus~~: answered 2026-10-27, the original's per-project tags (`docs/rules-design.md`).
- Research and projects slow from 25% to 6–9% per action with the formula above (about 11–17 actions per research without a matching skill). Accepted with the formula, but worth confirming in play.
- ~~Whether single-player bots may post plans~~: answered 2026-10-28, yes (see "Bots").

## Deferred (decided 2026-10-13, out of the first pass)

Kept for a later pass; not to be built now.

- **Optional jobs** (skipped instead of stopping the plan).
- **Secret substitution:** a job holder may secretly replace their job's action, or run actions just before any job, recorded as macros in planning mode; failed "before" secrets are skipped silently; secrets before the same step run in the order set; a fixed completion step covers "after the last job"; the card shows a substituted job as done like an honest one. Reason: players must be able to slip malicious actions into a plan (spiking a coffee a teammate brings you). Still open: whether an empty replacement counts as a failed job.
- **Plan item handles** ("the coffee from step 1") and, in a holder's own secrets, specific items they carry.
- **Planning mode:** the room view as a free camera with other characters hidden, catalog shelves, shadow targets and a timeline.
- **Templates** (for example the medic template), each after its own rule pass.
- **Natural pacing** (2026-10-13): run steps spread over time rather than all at once, which would also let live actions interleave and hide secret macros' length. A synthetic pace from config is likely better than recorded planning time.
- **Race conditions:** a plan runs instantly, so it can collide with live actions due at the same moment. The owner's idea was action durations, which now exist for live actions (`queue.ts`); plans bypass them in this pass.
