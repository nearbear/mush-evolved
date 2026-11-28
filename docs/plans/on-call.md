# Plan: channel plans and on-call summons (written 2026-10-30)

A **plan** is a private channel's shared to-do list: a room, a purpose and a set of slots that members claim. Some slots are promises done live; **on-call** slots let the author, once in the room, summon the holders there with one button: the game walks their bodies in, paying as live. That walk is the only thing the game ever does on an absent player's behalf. This replaces the generic executor of `docs/plans/archive/action-plans.md` (scheduled time, locked AP, knowledge sandbox, composer for arbitrary actions), which the owner dropped on 2026-10-30. Relaying is handled separately by pooled contributions (`docs/plans/archive/relay-tokens.md`), so plans have no relay execution. Steps 2 (`shared`) and 3 (server) built 2026-10-31; UI and bots not yet. **Decisions** are the owner's; **Open questions** block the part they belong to. Epic #317; issues #311 (pooled tokens), #312 (remove locked AP), #313 (shared), #314 (server), #315 (UI), #316 (bots). Do not guess them.

## The problem

Some actions need people in one room at once (expeditions once they exist, speeches, STT, healing, a future mealtime), so players stand in the Icarus Bay or the refectory waiting instead of lying in bed gaining AP, and move only when everyone is there. For players, the plan card is the protocol and the summons removes the waiting. Bots use plans only for this kind of structured roster; they split other work in chat (owner, 2026-11-01; see Bots).

The rule that keeps the executor tiny: **the person who will act summons the people they act on or with.** The expedition leader summons the crew, the chef the diners, the medic the patients, the speaker the audience, one STT partner the other. The summoner is online; the summoned need not be. The summoned never perform an action; what needs an absent player to act (bringing an item) is a promise, not an execution.

## Decisions (owner, 2026-10-30)

- **Plans belong to private channels.** The Mush channel, global chat and threads have none. Mush who want one make a private channel.
- **One open plan per channel.** A new plan can be posted only once the channel's plan is called, cancelled or expired.
- **The author is the channel's creator** (`PrivateChannel.createdBy`). Nobody else can post or cancel. If the creator dies or leaves the channel, its open plan is cancelled and that channel never has a plan again; the channel itself keeps working for chat.
- **Only members claim.** A slot can be claimed by a living member of the channel (unless it is reserved for someone else). Leaving the channel or dying withdraws the player's claims.
- **Two slot kinds.** *On-call*: "be in the plan's room when the author calls". *Task*: a structured promise ("help research X", "heal me", "bring a medikit") the holder does live; a task has a Done tick set by its holder, unverified.
- **Go needs the author in the room.** The summon action is offered only while the author is in the plan's room, so who arrives is ordinary room presence to them, never a report about another room.
- **Expiry: the end of the next day.** A plan posted on day N is cancelled at the end of day N+1 (`config.plans.expiryDays`, 1) if still open, so nobody is summoned on stale consent.
- **No generic executor.** The game never performs a planned action for anyone. The walk is the only automatic movement, and it is pre-consented, one per claim.

Carried over from `docs/plans/archive/action-plans.md` (owner, 2026-10-13 and 2026-10-26), still valid for the walk:

- **No new powers.** A summoned walk is the normal `move`, door by door along `shortestPath`, paying MP or the AP conversion exactly as live, visible to anyone along the way with the same log lines. A plan can never place anyone where walking could not.
- **No lookahead, stop without rollback.** Each door is checked when the walker reaches it; a refused door or an unaffordable step stops that walker where they stand. Doors already walked stay walked. Nobody is refunded.
- **Failure detail is private.** Members see that a holder did not arrive; the reason (no MP, a broken door, being pushed) goes to that holder alone.
- **The queue is cleared first.** A summoned holder's live timed actions (`current` and `queue`) are dropped before the walk, each with the existing `actionDropped` private line.
- **Body ids.** Plans store `PlayerState.id`, so a Mush body transfer carries claims with the body. Private channel membership is not role-bound, so nothing else changes (the Mush-channel rule of the old design has no counterpart).
- **No patrol craft rooms** (owner, 2026-10-27): they have no doors; `postPlan` refuses them.
- ~~**Bots may post plans** (owner, 2026-10-28) when they are a channel's creator.~~ Superseded 2026-11-01: bots post no plans for now (see Bots).

## Decisions (owner, 2026-10-30, second pass: Claude's proposals confirmed)

- **Nothing is locked, and the locked-AP code goes.** A claim is consent, not a reservation of AP or MP. The walk starts from wherever the body is at summons time; a holder who has spent their MP simply doesn't arrive. The author sees who came. The old design's plumbing is removed: `PlayerState.lockedAp` (`shared/src/types/player.ts`, initialised in `rules.ts`), `freeAp` (`helpers.ts`, exported from `index.ts`; read in `actions/action.ts`, `actions/move.ts`, `rules.ts`'s `lacks`, `web/src/hud/ActionButton.tsx` and `RoomList.tsx`, all becoming plain `ap`), `PipBar`'s cross-hatch, and the `freeAp` line in `docs/code-map/shared.md`. Removing a state field needs an upgrade step and a `STATE_VERSION` bump (#384, `shared/src/normalizeState.ts`).
- **The author walks to the room themselves**, live, and then presses Go. The game never walks the author.
- **Walk order** is slot order, each holder's whole walk before the next. A holder lying in a bed gets up first (`getUp`), as any live action does.
- **No arrival action yet.** When expeditions or the mealtime table exist, a plan's purpose may add one fixed step after arrival (board the Icarus, sit at the table), decided in that rule pass. The `purpose` field is the hook.
- **Summons once.** Go moves the plan to `called`; it cannot be pressed again. A second gathering is a new plan.
- **Finished plans stay on the card** until the next one is posted, so task slots can still be ticked Done after the call.
- **Purpose is a label** from a fixed list for now (expedition, meal, healing, speech, sharing, work, other), shown on the card. The owner may make it free text later; for now there is no free text anywhere in a plan and the channel's messages carry the words. (Free text would add moderation and prompt-injection surface for bots, to weigh then.)
- **Tasks are promises, never executed.** Promises can be broken. Any member may claim any task, whether or not they can actually do it: the card is a promise board, and a task nobody can do just goes unclaimed. Initial task catalog: research (which), project (which), repair PILGRED, heal (whom), comfort (whom), STT (whom), fiery speech, boring speech, bring (an item type, to the plan's room). Targets are living players; the composer offers members first.
- **Limits** (`config.plans`): slots per plan 12, finished plans kept per channel 1.
- **Claims are untimed registry actions** (`claim_slot`, `withdraw_slot`, `mark_done`, `summon`, `cancel_plan`; 0 AP, like `ready`), so their candidates come from `candidates`, parse and legality are free, `view.actions` lists them, and scripted and model bots use them like any action. Posting stays a chat-like message, since a draft can't be enumerated.
- ~~**Bots post in their own channels.**~~ Superseded 2026-11-01: bots post no plans for now, so they create no channels for them (see Bots).
- **A dead target voids only its slot.** When the target of a task (heal, comfort, STT) dies, that slot is struck out on the card as "target died" (it can't be claimed, withdrawn or ticked); the rest of the plan and its summons carry on.
- **Slots per player:** at most one on-call slot per plan, and any number of task slots. The author may claim tasks in their own plan but no on-call slot (they walk themselves).
- **Done ticks are visible to all members.** An undone task at expiry or cancellation stays unticked, with no extra marker.
- **No presence on the card before Go** (owner, 2026-10-31). Members never see whether an on-call holder is already in the plan's room: that would be a position report about another room. The author, standing there, sees it as ordinary room presence.
- **A lapsed reservation opens the slot** (owner, 2026-10-31). If the player a slot is reserved for dies or leaves the channel, the reservation is dropped and any member may claim it.
- **A task finished by anyone is struck out** (owner, 2026-10-31). When a slot's research or project completes, or PILGRED is repaired, while the plan is open, the slot shows "already done" and can no longer be claimed, withdrawn or ticked. Completion is public, so this leaks nothing.
- **A ticked task stays done** (owner, 2026-10-31). A slot already ticked Done is never struck, whether its target dies or its task is finished afterwards.
- **Go needs an on-call slot** (owner, 2026-10-31). A plan of task slots only has nobody to summon, so `summon` is refused on it (`plan_no_on_call`). Dropping a summoned holder's queue stays as decided, even when the walk can't get them anywhere (owner, 2026-10-31).
- **Clearing a queue can tell the player** (owner, 2026-10-31). `clearQueue` takes an option to write one `actionDropped` private line per dropped action through the existing `dropped()` helper in `queue.ts`. The summons walk turns it on; a player clearing their own queue keeps it off, since they triggered it.
- **An author who leaves closes planning with a flag** (owner, 2026-10-31). When the author dies or leaves the channel, its open plan is cancelled and the channel gets `planningClosed: true`; `postPlan` refuses a closed channel. `createdBy` stays for history.

## Design

### Types (`shared/src/types/plan.ts`)

```ts
type PlanId = `plan-${number}`;
type Purpose = "expedition" | "meal" | "healing" | "speech" | "sharing" | "work" | "other";

type Task =
  | { type: "research"; research: string } | { type: "project"; project: string } | { type: "repair_pilgred" }
  | { type: "heal"; target: PlayerId } | { type: "comfort"; target: PlayerId } | { type: "stt"; target: PlayerId }
  | { type: "fiery_speech" } | { type: "boring_speech" }
  | { type: "bring"; itemType: string };

type Slot =
  | { kind: "onCall"; holder: PlayerId | null; reservedFor?: PlayerId; outcome?: "arrived" | "stopped" | "unclaimed" }
  | { kind: "task"; task: Task; holder: PlayerId | null; reservedFor?: PlayerId; done: boolean };

type Plan = {
  id: PlanId;
  channel: PrivateChannelId;
  author: PlayerId;             // == channel.createdBy at post time
  room: RoomId;                 // where on-call holders are walked to; never a patrol craft
  purpose: Purpose;
  slots: Slot[];
  status: "open" | "called" | "cancelled" | "expired";
  postedDay: number;
};
```

`GameState.plans: Plan[]`, `GameState.nextPlanId`, `GameConfig.plans`.

### Pure functions (`shared/src/plans.ts`)

- `postPlan(state, author, draft)`: author alive, playing, not in pre-selection, is `createdBy` of the channel and still a member; the channel has no open plan; the room exists and is not a patrol craft; slot count within the cap; every `reservedFor` is a living member; tasks check static or public data only (research or project not finished, PILGRED not repaired, target alive, item type exists). `stt` and `comfort` tasks can't target their own future holder, checked at claim.
- `cancel_plan` (registry action): candidates are the author's open plan; releases nothing, since nothing is locked.
- `claim_slot`: candidates are unclaimed slots in open plans of channels the player is a member of, unreserved or reserved for them, not a `stt` or `comfort` task that targets them. `apply` sets the holder.
- `withdraw_slot`: candidates are the player's own slots in open plans.
- `mark_done`: candidates are the player's own task slots, not yet done, in open or called plans.
- `summon`: candidates are the author's open plan while the author is in `plan.room`. `apply` walks each on-call holder in slot order (below), sets each slot's `outcome`, writes a private line to each holder (arrived, or the reason they stopped), and sets `status: "called"`. Unclaimed on-call slots get `outcome: "unclaimed"`.
- `walk(state, holder, to)`: skip if already there (arrived). Clear the holder's queue (`clearQueue` with its notify option on, one `actionDropped` line per dropped action), `getUp` if lying. For each room in `shortestPath(config.rooms, holder.room, to)`: run `move` through `actNow`; a refusal (`not_adjacent` after a door broke, `being_pushed`) or `cant_afford` stops the walk with that reason. Returns arrived or stopped. The shortest path is recomputed from the body's actual room, not from where it was at claim time.
- Cleanup hooks: on death (`killPlayer`) and on leaving a channel (`removeFromChannel`, which death goes through): withdraw the player's claims; if they are the author, cancel the channel's open plan and set the channel's `planningClosed` flag (`createdBy` stays for history). The last member leaving deletes the channel and its plan. At the day tick, open plans with `postedDay + expiryDays < day` become `expired`.
- `viewFor`: `PlayerView.plans` holds the plans of channels the viewer is in, with holders (member names are known to members) and outcomes; a slot's stop reason only in the viewer's own private line, never on the card.

### Timing and server

- **No alarm, no clock.** Everything runs inside an action's `apply` or the existing day tick. The old design's third alarm source, `runPlans` input and `max(now, time)` stamping are gone.
- Protocol: `postPlan` is a new chat-like message, validated in `protocol.ts` and rebuilt with known keys only; the five registry actions arrive as ordinary `action` messages. The per-seat rate limit applies. New state fields get defaults in their normalizers. Replay needs nothing new.

### UI

Everything the composer offers comes from the view: channel members, the room list, the research and project catalogs, the item type catalog, living players. It never computes legality; refusals come back from the server.

- **Where:** a private channel's ⋯ menu (beside its back button in the iTrackie title row) has Plan, which swaps the messages for the plan on both layouts (back returns to the messages; changed 2026-11-27), and New plan while there is none. Only the channel's creator sees "New plan"; a channel whose creator is gone shows no planning at all.
- **Composer:** a dialog on desktop (the iTrackie panel is too narrow), a full-screen sheet in the chat tab on phones. Room picker, purpose picker, then slots: "+ On call" (with an optional "reserved for" member picker) and "+ Task" (task type, its target or catalog item, reserved for). Post is disabled with an inline reason while the plan is empty or over the cap; server refusals show as a toast and keep the draft.
- **Card:** purpose, room, author; one line per slot with Claim, or the holder's name and, for your own, Withdraw (and Done for tasks). The author sees Cancel, and Go while standing in the room, greyed with "go to the room to call" otherwise. After Go, on-call slots show arrived or didn't; your own shows why in the room log's private line. "Expires end of day N" in the header.
- Phone layout first, en/fr/es, no raw keys (`npm run a11y`).

### Bots (owner, 2026-11-01)

Plans are for structured coordination: a fixed roster and a summons (an expedition crew, diners, an audience). Everything else bots coordinate in natural-language chat (`docs/plans/bot-goals.md`, "Coordination").

- **Model bots only.** Claiming, withdrawing and ticking Done are done by model bots, with no scripted fallback: the model reads the plan in its prompt and picks `claim_slot`, `withdraw_slot` or `mark_done` from its actions, with no scripted claim filter. A bot without a key ignores plans. If it holds no slot, a summons never involves it.
- **The prompt shows plans as structured data** (purpose, room, author, each slot's kind, task, target, holder, reservation, done, struck), and labels the slot actions in words. There is no free text in a plan to inject through; channel names are quoted and escaped as today.
- **Walk when summoned like anyone.** The game walks the body; the bot notices where it now is and its goal re-paths or fails. The prompt reminds it of its on-call slots so it can keep the MP to get there.
- **Claimed tasks become goals** (`doSlot` in bot-goals.md): go, do it, tick Done. At the end of its cycle a bot withdraws from slots it can no longer reach or do.
- **Bots post no plans for now.** Asking for healing is a message in global chat, not a `heal: me` plan; `startRelay` is gone (pooled contributions). A bot may post again when a goal needs a roster and a summons, such as an expedition once expeditions exist.

## Mush angle

- **Summoning out of bed.** A Mush author can call everyone to a room for nothing, costing each the bed's extra AP until they log back in and their MP for the walk. Consent is per plan and per author, the summons is once, the plan says its purpose and room, and a pointless call is visible to every member: the lever exists but is attributable and bounded. The expiry bounds stale consent.
- **Claim hogging.** Claims are free, so a Mush could claim every slot and never show. Reserved slots, Withdraw being visible, and one open plan per channel keep this cheap to counter; a holder who claimed and didn't arrive is on the card.
- **Launch timing.** Once expeditions exist, a Mush leader can call while the humans are asleep. Same as live, but easier: the arrival action pass should decide whether boarding is part of the summons or a live step each crew member takes.
- **Not an alibi engine.** A summoned body really is where the card says; the walk's log lines are real.

## Leak check (`leak-check` skill)

- Non-members see no plan; a plan's channel is the viewer's own.
- Holders are members, known to members. Reasons for not arriving go only to that holder's private line.
- Go is offered only in the room, so the author learns arrivals as room presence, nothing about other rooms.
- The walk's log lines and witness view are identical to live walking.
- `view.actions` for `claim_slot` exposes only slots in the viewer's own channels.

## Tests

- **Rules:** post needs the creator and no open plan; a second plan in a channel is refused; claims need membership and respect reservations; withdraw; Done; cancel; expiry at the day tick; the author's death or exit cancels and closes planning in that channel; a holder's death or exit withdraws; Go is illegal away from the room; the walk pays like live (MP, then AP conversion), stops at a broken door or when unaffordable with the right private reason, skips holders already there, gets sleepers up, clears queues with `actionDropped`; walk order; identical log lines to live moves; body transfer keeps claims; patrol craft rooms refused; a bot author's post.
- **Leaks:** non-members (including Mush) see no plan; a member never sees another's stop reason; the author's view after Go contains nothing about rooms other than the one they stand in; the view is unchanged whether or not a non-member is actually in the plan's room.
- **Server:** malformed `postPlan` rejected; replay deterministic; the rate limit applies.

## Build order

1. **Pooled contributions** (`docs/plans/archive/relay-tokens.md`, #311; built 2026-10-31): independent, and it removes the only reason for relay execution.
2. **Plans in `shared`** (#313; built 2026-10-31): types, `postPlan`, the five registry actions, the walk, cleanup and expiry, `viewFor`, rules and leak tests. As built: `postPlan` is a function, not yet an `Input` (step 3 adds the message and the `applyInput` case); the walk calls `performAction` through a binding `rules.ts` sets (`bindPerformAction`), since `actions/summon.ts` can't import it without an import cycle, so a ready holder is still walked; a task slot's strike is stored (`struck`), set by `strikeSlots` after every action, cycle and death; each channel stores its open plan plus `finishedKept` finished ones (the UI decides which to show); the five actions stay out of the action history, like `ready`. After a code review: plans follow the channel's iTrackie rule (`plansView` filters by `readChannels`; posting and the slot actions need `chatChannels`), and `postPlan` refuses a reservation the claim rules would refuse to its own player (an on-call slot for the author, a second on-call slot for the same player, an STT or Comfort for its target).
3. **Protocol and server** (#314; built 2026-10-31): the `postPlan` message, `GameRoom` handling, `STATE_VERSION`. As built: the message is `{ type: "postPlan", plan: PlanDraft }`, rebuilt by `parsePlanDraft` (in `plans.ts`, called from `protocol.ts`) with known keys only at every level (generous wire bounds: 64 slots, ids up to 64 characters; the rules check the real limits and that ids exist); `applyInput` calls `postPlan`; `GameRoom.social` takes it under the per-seat chat rate limit and, having no free text, sends it to the rules without moderation. No stored-shape change: step 2 already added the plan state, and a new input type changes no stored shape (old records hold no `postPlan`).
4. **UI:** card, composer, phone layout, en/fr/es.
5. **Bots** (#316): model bots claim, are walked when summoned, do their claimed tasks and tick Done; no bot-authored plans (owner, 2026-11-01). Needs bot-goals.md build steps 1–3 first (goals, model goal choice, model chat). `docs/plans/bot-goals.md` was rewritten for this on 2026-11-01.

## Deferred

From `docs/plans/archive/action-plans.md`, still wanted later and still requiring an executor of some kind, now scoped per feature rather than generic: arrival actions (board, sit), secret substitution (spiking the coffee you bring), item handles, templates, natural pacing. Scheduled times, locked AP, optional jobs and the knowledge sandbox are dropped, not deferred.

## Open questions

None.
