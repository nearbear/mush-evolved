# Plan: action system and scheduled plans (written 2026-10-13)

Nothing here is implemented yet. **Decisions** are confirmed by the user; **Open questions** must be answered before building the phase they block. Do not guess them.

## Goal

Actions behave as in the original Mush, plus one addition: **plans**. A player posts a plan in a private channel. The plan is an ordered list of **jobs**, and each job is one action by one player. Other members opt into jobs. When the trigger fires (a real-world time, or the moment the last job is filled), the game performs every job on the players' behalf, but only if every job is filled.

The problem this solves: today, relaying on research and projects needs both players online together, or logging on in sequence, so that nobody contributes twice in a row. A plan lets them coordinate while offline.

## Decisions

- **No new powers.** A planned action is a normal action performed later. A job stores the same `Action` a player could send live and runs through the same legality check and `applyAction`. A plan can never do anything a sequence of live actions couldn't.
- **Repeat penalty:** the research/project penalty applies to **consecutive** participation by the same player. Plans handle it by ordering jobs (A, B, A, B). The rule itself lives in the normal research action and needs no special case for plans.
- **Locked AP.** Claiming a job locks the AP it will cost. Locked AP can't be spent on anything else. It is spent when the plan runs and released if the plan fails, is cancelled, or the player withdraws. The AP bar draws locked pips with a cross-hatch overlay (CSS, no new art).
- **Travel is part of every job.** Before a job's action, the game walks the actor along the shortest path to the room the action needs, paying MP (or an AP conversion) per door exactly as walking it live, and visible to anyone along the way. The lock includes that travel, computed from where the actor is at claim time.
- **Standalone movement jobs** exist for when moving is the whole point ("Alice: be in the Bridge at 21:00"). They store a destination; the path is found at run time.
- **Moving targets** (another player, an item someone may pick up): the job's room is fixed when the author posts it, and the author must be in the target's room to write that job (otherwise the plan would reveal where the target is). Claimers can claim from anywhere. If the target isn't there at run time, the job fails. The game never follows a target, because that would track players for you.
- **Two triggers:** run at a set real-world time, or run as soon as the last job is filled.
- **Witnesses:** a planned secret action is witnessed by whoever is in the room when it runs, exactly as if it were done live.
- **No outside visibility:** only members of the plan's channel can see a plan, including Mush. There is no special access for any role.
- **Lock amount:** claiming locks what the plan would cost if it ran now, simulated through the preceding jobs (so a move that needs an AP-to-MP conversion locks 1 AP).
- **Under-locked jobs:** if a job costs more at run time than was locked (e.g. MP was spent live), free AP tops it up. If there isn't enough, the job fails and the plan rolls back.
- **Withdrawing:** allowed any time up to the run.
- **`whenFilled` plans expire:** the author sets a deadline (default 24 h, placeholder in config). Unfilled at the deadline, the plan fails and locks are released.
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

### Phase 1: Action registry (refactor, no behavior change)

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
  trigger: { kind: "at"; time: number } | { kind: "whenFilled"; deadline: number };  // epoch ms, from the server
  jobs: Job[];                                                     // run in this order
  status: "open" | "done" | "failed" | "cancelled";
  failure?: { job: number; reason: string };
};
type Job = {
  action: Action;              // same shape as a live intent
  actor: PlayerId | null;      // null = open slot
  room: RoomId | null;         // where the action happens, fixed when set; travel goes here first
  reservedFor?: PlayerId;      // optional: only this player may claim it
  lockedAp: number;            // set on claim
};
```

One player may hold several jobs in one plan (move, then research).

**Pure functions:** `postPlan`, `claimJob`, `withdrawJob`, `cancelPlan` (author only), and `runDuePlans(state, now)`. The rules never read a clock; the server passes `now`.

**Running a plan:**
1. If any job is unfilled at a timed trigger or a `whenFilled` deadline, the plan fails with "not all jobs filled" and every lock is released.
2. Otherwise run the jobs in order on a cloned state, each through the shared action path. A job spends its own lock first and tops up from free AP if it costs more. If all succeed, keep the clone. If any fails, discard it, release all locks, and record which job failed and why ("Bob wasn't in the Laboratory"). Only that job's actor sees the reason.
3. Log entries, witnesses, and visibility are exactly what the same live actions would produce.

All-or-nothing prevents half-run plans (Alice spends her AP, Bob's part fails). Pure JSON state makes it cheap. The tradeoff, accepted: anyone, including a Mush, can sink a plan by withdrawing or by moving away, and the plan shows whose job failed.

**Preflight hints:** a player sees hints only for their own jobs, and only about things they already know: their own AP, MP, items, and travel cost. Hints never reveal another member's AP, inventory, or whether a target is still in its room, since all of those are private. Hints come from simulating the plan on a clone with the same `check`. The client computes no legality.

### Phase 4: Server

- `GameRoom` sets one Durable Object alarm for the earliest of: the next cycle boundary and the earliest timed plan. When it fires, it calls `runDuePlans(state, Date.now())`, saves, broadcasts each player's view, and re-arms.
- `whenFilled` plans run inside `claimJob` when the last slot fills, with no alarm.
- Protocol: `postPlan`, `claimJob`, `withdrawJob`, `cancelPlan`, each validated as untrusted input in `protocol.ts`.
- The alarm also covers `whenFilled` deadlines.
- Abuse limits: open plans per player and per channel, jobs per plan, and the allowed lead time for timed plans.

### Phase 5: UI

- `ITrackie`'s private channel stub becomes a real channel list. In a channel, a plan card shows the trigger (local time and a countdown, or "runs when filled"), the jobs with claim and withdraw buttons, preflight hints, and the outcome.
- A "Plan this" option next to live action buttons opens a composer with that action prefilled.
- `PipBar` draws locked AP with a cross-hatch.
- Everything must work in the phone tab layout. All new text goes through i18n (en/fr/es).

### Phase 6: Bots

Bots see plans in their own channels through their normal view. Claim and withdraw are ordinary legal intents. Scripted bots can claim relay jobs. Model bots treat plan text as untrusted.

## Tests (rules)

- A timed plan runs at its time, not before. A `whenFilled` plan runs on the last claim.
- An unfilled job makes a timed plan fail.
- If one job fails, the whole plan rolls back, nobody is charged, and every lock is released.
- Jobs run in order, and each job's travel is paid like walking live (MP per door, conversion when out of MP).
- A job whose target moved out of its fixed room fails; the game doesn't follow it.
- Preflight hints never include another player's AP, items, or a target's current room.
- A failed plan shows other members only whose job failed; the reason reaches only that actor.
- Posting a job on a moving target requires the author to be in the target's room.
- A, B, A, B ordering avoids the consecutive-participation penalty (once research exists).
- Locked AP can't be spent live. Withdrawing, cancelling, leaving the channel, or dying releases it; dropping the iTrackie doesn't.
- A move job locks 1 AP when it would need a conversion. A job that costs more than its lock tops up from free AP, or fails the plan if there isn't enough.
- An unfilled `whenFilled` plan fails at its deadline.
- Only the author can cancel.
- A planned action's log entries are identical to the live action's.
- A secret planned action is witnessed by players in the room at run time, and only by them.
- Non-members, including Mush, can't see a channel's plans in `viewFor`.
- Equivalence: a plan's result equals the same actions applied live in the same order.

## Build order

1. Phase 1 (registry refactor) can start now.
2. Phases 2–3 against existing actions (move, take, drop, examine) to prove out the executor.
3. Phase 4, which also replaces "ready" with the cycle timer.
4. Research and projects as their own rule pass, then relay plans for them.
5. Phases 5–6.

## Open questions

None for the plan system itself. Dependencies that need their own rule pass:

- **Research and projects** (the main use case): actions, costs, efficiency, the exact consecutive-participation penalty, and where they happen.
- **Private channel limits** in the original, to replace the placeholders.
