# Bot goals (plan)

2026-10-25, revised 2026-11-01. How single-player bots act on purpose (walk to a bed to rest, answer a call for help, do the task they claimed in a plan) instead of choosing one action at a time from what is in front of them. The owner accepted the first design on 2026-10-25 and changed how bots coordinate on 2026-11-01: **coordination is model-only and happens in natural-language chat**, and plans (`docs/plans/on-call.md`) are only for structured rosters. On 2026-11-10 the goal widened: **a crew of bots with no Mush aboard should reach Eden** ("Direction: reaching Eden" below, written in at the owner's request after a review); that section replaces the points listed under Superseded. **Open questions** still need the owner's answer before the part they block is built.

## The problem

Today (`server/src/bots.ts`, `server/src/prompt.ts`) a model bot gets a fresh prompt for each action: its view, the exits from its room, and a numbered list of affordable actions. It picks one and forgets it. So it can't follow through on anything longer than one step:

- **No memory.** "I should rest" one turn is gone the next.
- **No route.** The prompt lists only the current room's exits, though `view.rooms` already holds the whole (public) room graph. Planning a walk across 27 rooms, one model call per door, is unreliable and costs the player money (BYOK).
- **No coordination.** Some goals need another player: a hurt bot needs a healer, a low-morale one a Leader, and several healers answering one ask need to settle who goes. (PILGRED relays no longer need coordination: pooled contributions, `docs/plans/relay-tokens.md`.) Terrence needs someone to push his wheelchair (`accommodate`).

## Direction: reaching Eden (2026-11-10)

From a review with the owner on 2026-11-10, written in at the owner's request. **Goal (owner):** a crew of bots, with no Mush aboard, reaches Eden. That means keeping the ship together for many days (the key part) and running many expeditions as starmap fragments drop. Eden's own rules aren't decided (`docs/plans/balance.md`), so the strategy parts here are a direction, not a design. Only point 1, the survival harness, is built (2026-11-11). Points marked *open* are in "Open questions".

### Why the rest of this plan isn't enough

The plan below was designed for eight cheap model bots that feel like crew while a human Mush plays against them. For a long cooperative run it falls short in three ways:

- **Nobody owns the ship.** Each bot picks the best goal for itself from what it sees in its own room. Nothing tracks oxygen, fuel, fires, broken equipment or food across days, and there is no shared intention for the day.
- **Upkeep goals are missing.** There are goals for the hull, plants, research, projects, comms and hunters; none for `repair`, `extinguish`, oxygen and fuel capsules, cooking, ship travel or expeditions. The one long trial (22 cycles, 2026-11-03, #224) ended with the ship destroyed in cycle 23.
- **No memory across days**, and what there is dies with a restart.

### 1. Measure first: a survival harness

A headless run of scripted bots only, with no Mush, over many seeds, that prints how many days each ship lasted and what ended it (and, once Eden exists, how often it was reached). `npm run model-trial -w server -- --fake` is most of it. The rules are pure and seeded, so this is free and fast. It is the measure for everything below: a change to the bots is good if ships last longer on the same seeds. It needs a setup with no Mush, which is test tooling only and never a mode players can start (owner, 2026-11-10). This benchmark is the owner's test of whether the bots are good enough; it is not a game mode. Single player stays what it is: a human Mush sabotaging a crew of bots.

### 2. Upkeep is code

Keeping the ship alive is triage, and code does it better than a model: free, deterministic, testable. Work from the harness: fix what kills the most ships, run again, repeat. Expected new scripted goals: repair broken equipment, put out fires, oxygen and fuel capsules, cooking, and mechanical help (healing first). A bot sees only its own room. It deals with trouble where it finds it and doesn't walk rounds; the one thing it reports to the crew unasked is a damaged oxygen tank (owner, 2026-11-10). How a scripted bot reports it is *open*.

### 3. Typed memory, kept in room storage

A multi-day run needs a bot to remember what it saw. `BotMemory` grows typed facts the bot observed itself (for example a fire seen in a room, with the day and cycle), never free text, so the reason for "No free-text notes" still holds. It is kept in the room's storage, per seat, outside game state, the record and every view, so a restart no longer wipes it. A replay still never needs it (bot rule 9).

### 4. Structured coordination, open to scripted bots

Conversation stays model-only. But a scripted bot can read anything structured that a human can also read, and neither of these is a backchannel:

- **Channel plans** (`docs/plans/on-call.md`). Bots post plans again where a roster is needed: an expedition crew, and a way for the Commander to know no pilot is out before moving the ship (the Commander's view doesn't show it; owner, 2026-11-10). The shape of that plan (a sortie slot a pilot holds until landing, or a departure roster pilots tick) is to design. #316 is on the critical path.
- **NERON's priority** (not built). Once a day the NERON admin sets the ship's priority, which makes research and projects or astronavigation easier. **The current priority is public** (owner, 2026-11-10; `docs/rules/rules-design.md`), so it doubles as a ship-wide signal of the day's intent: every bot, scripted ones included, reads it from its own view and leans toward that work.

### 5. The day plan: one model decision a day

The judgment a competent crew makes once a day: stay or travel and where, research or astronavigation, whether to run an expedition and with what kind of team. One call a day on a capable model, not one per bot per cycle. Code carries it out, including the admin setting NERON's priority to match. The Commander and the NERON admin are different seats, so the day plan travels between them through chat or a plan, like everything else. **The Commander decides it and says it in chat; plans supplement it** (owner, 2026-11-10). It runs on a **second, stronger model set in the BYOK panel** (owner, 2026-11-10; with #218), apart from the model the bots use for goal choice and chat. A scripted bot can't read chat, so whatever a scripted admin or crew member must act on has to be in a plan or in NERON's priority; which parts, and the plan's shape, are *open*. A crew with no key has no day plan, so the harness needs either a paid call a day or a scripted stand-in to compare against. Rebel bases awaiting contact are visible to the Commander (the comms terminal is on the bridge; owner, 2026-11-10).

### 6. Travel and expeditions: code prepares, a chooser picks

The owner's examples (2026-11-10) of why a priority ladder can't do astronavigation, and where each belongs:

| Decision | Kind | Done by |
| --- | --- | --- |
| Don't move while a rebel base awaits contact or a pilot is out | Hard precondition | Code |
| A Tracker with the compass when many sectors can lose someone | Probability from the sector tables in config | Code |
| A combat team or a Diplomat on a given planet (a Diplomat is safe but yields less; crystal fields are best with a combat team) | Expected value: team strength against the creature, loot either way | Code computes both |
| Which planet, given oxygen, fuel and what the ship is short of | Weighing competing needs | The chooser |
| Saving grenades for later zones; building combat strength through projects and the Centauri rebel base | Investing now for a payoff days later | The chooser, or a fixed build order |

Three layers, the same shape as goals (the model chooses from a short list code defines):

1. **Facts and constraints** (code): whether the ship may move, what each analyzed planet holds, what the ship is short of. Only from the deciding bot's own view and memory.
2. **Options with consequences** (code): three to five candidate plans, each with what it is expected to yield, risk and cost.
3. **The choice:** a model picks from that briefing, or tuned weights do. The harness scores both on the same seeds; the model stays only if it reaches Eden more often.

The long-horizon part (grenades, the projects-then-Centauri path) starts as a build order written by the owner, corrected where the harness shows it breaking. It is data, not code, so it grows as projects are added; it blocks nothing before this point (the Centauri base is built, projects are still being added).

### 7. Tuning and review

- **Tune numbers by search.** Goal priorities and thresholds are plain numbers; a script tries variations on the harness and keeps what survives longest.
- **The overseer (#225) looks at survival too:** after a batch of runs a strong model reads the reports and proposes goal changes for the owner to approve. Offline, at development cost; nothing reaches a live game's bots.
- **No trained model.** Reinforcement learning or fine-tuning would go stale each time a rule changes.

## Decided

### Goals (owner, 2026-10-25, still valid)

- **A fixed list of goals.** The model chooses among goals the code defines; it never invents one. Code carries out the chosen goal.
- **Re-choose only on finish, failure or interrupt.** One model call picks a goal; the goal then runs with no model calls until it finishes, fails, or an interrupt fires. This keeps the cost per cycle low.
- **Bot memory is never game state.** A bot's current goal and what it has seen live with the bot, never in game state, the record or a view. Where they are kept changed on 2026-11-10: room storage, per seat ("Direction", point 3), not only the `Bot` object.
- **AP reserve: 2.** Work goals stop when spending more would leave the bot under 2 AP, keeping it for emergencies. A config value.
- **No free-text notes.** The model writes nothing for itself; chat could inject text into a note that then stays in every later prompt. A bot's memory is its current goal, its last failure, and typed facts it observed itself ("Direction", point 3). (Its own chat messages are in the chat it reads, like anyone's; that isn't a note.)
- **Asking threshold.** A bot is prompted to consider asking for help when HP is 7 or less (a config value, a default for now). Morale asks have their own thresholds (owner, 2026-11-01: under 7 privately to a Shrink, under 5 publicly; below).
- **Always ask for healing** (after Gemini's review). No self-healing goal: a hurt bot without a medikit asks, even though the sick bay heals without one.
- **No wheelchair goals in the first pass.** A pusher can't know where Terrence wants to go. With natural-language chat bots can now say where they're headed, so this can be revisited.
- **Four more goals** (after Gemini's second review) so bots are competent crew: shower when dirty, pick skills, return to Sol, and helping a player who asked (heal, Fiery speech). See the goal list.
- **No framework.** LLM agent frameworks (Mastra and similar) coordinate by letting agents message each other directly or share a blackboard. That breaks the bot rule that a bot only ever receives its own seat's view, and in single player (the human is the only Mush) it would give the eight bots a perfect backchannel the human doesn't have. Bots coordinate only through what humans use: plans, channels, chat. If goals later share subgoals in tangled ways, game-AI structures (behavior trees, HTN) are the next step, hand-written or a small library (ask before adding one).

### Coordination (owner, 2026-11-01)

- **Conversation is models only.** Asking, offering, taking over and accepting in chat are done only by model bots; a bot without a key takes no part in chat. Structured coordination (plan slots, NERON's priority) is open to scripted bots too (2026-11-10, "Direction", point 4).
- **Scripted bots help mechanically** (2026-11-10, replacing "model-only for now"): healing first. A scripted bot can't see that someone needs help (HP and morale are private), so it reads a plan slot (owner, 2026-11-10); the slot's shape is to design with #316.
- **The Shrink spends the night in a dorm** (owner, 2026-11-01): people lying in a bed with a Shrink in the room gain morale, so once a day a Shrink bot (scripted or model) walks to a dormitory, Alpha and Beta on alternate days, and stays until the cycle ends (`shrinkDorm`, the `dorm` trigger in `duties.ts`). Priority 45, after the work goals and before `rest` (my choice, not asked); it lies down there if its AP isn't full and a bed is free, and may spend the AP reserve to get there, as resting does. Kept across cycles on the same day (unless a higher-priority goal opens or an interrupt fires), and marked done for the day only when waiting in the dorm (cleared if woken or hurt before the cycle ends; owner, 2026-11-01).
- **A Shrink holds its AP for comforting** (owner, 2026-11-01): it researches and works on NERON projects only when within 4 AP of its max (`SHRINK_DESK_WORK_WITHIN`, `deskWorkReserve` in `goals/work.ts`), and stops back at that line, keeping the rest to help with. Built for scripted and model bots alike (a scripted Shrink holds it too, though it doesn't comfort yet).
- **Asking a Shrink for morale** (owner, 2026-11-01; model bots, step 3): a bot under 7 morale contacts a Shrink through a private channel; under 5, it says so in global chat whenever it can't contact a Shrink privately for any reason (it knows of no Shrink, has no iTrackie, can't open or join a channel, ...), since that is an emergency. The asker states its morale, since morale is private: the Shrink goes by what it is told. A bot sees others' skills only when in their room, so a Shrink bot says in global chat early in the game that it is a Shrink (owner, 2026-11-01); others also learn it by meeting it. Each bot remembers in `BotMemory.shrinks` which players it has seen as Shrinks (in its room or announcing in global chat) and whether it has already announced itself in global chat (owner, 2026-11-01).
- **What a Shrink spends on comforting** (owner, 2026-11-01): when the person says they are under 7 morale, it may spend its AP reserve; otherwise it spends down to the reserve, comforting until their stated morale is topped off (2 morale a Comfort, at 1 AP).
- **Natural-language chat.** Bots write their own messages, so asks and offers are ordinary chat, not keyed catalog lines. This replaces the 2026-10-25 "fixed lines only" decision and the line catalog. It pulls model-written chat (#223) into this work.
- **No structured intents in chat.** The server never knows what a message means; models read each other's text and the human's alike. There are no intent tags on messages and no tagging buttons for the human.
- **Claims are settled in conversation.** "I'll heal you", "let me, I have nurse points to spend", "OK, Kuan Ti then": a helper offers, another may take over for any reason (closer, distrust, saving someone's AP, spending specialist points), and the one being helped accepts one. The model weighs the reasons; there is no rule for who wins. The bot being helped doesn't need anything structured to accept: it says so.
- **Clarify only when unclear.** A bot doesn't restate or confirm what someone said when the meaning is plain. If a message is genuinely ambiguous ("I'll heal her" with two hurt women), the model may ask, as a person would. An unclear message leads to no action: a bot never acts on a guess.
- **Healing asks go in global chat.** Private channels are too complicated for this for now (morale asks to a Shrink do use one; above). The Mush hearing who is hurt and where is as in the original.
- **A router decides whom a message wakes** (#341, 2026-11-03; replaces "every message wakes every bot"). Each chat message in a channel bots read (the human's or another bot's) gets one small model call, through the game's gate, that names which listening readers, other than its author, it is meant for: at most `ROUTER_MAX_WAKES` (3), or nobody. Each one woken gets a turn to reply, act, or do nothing. A private channel skips the router and wakes its members. A failed or unparseable router reply wakes nobody: a missed wake only delays a reply until the bot's next choice.
- **A reply-chain depth limit** bounds the cascade (`botChatChainDepth`, 3 to start). A message the human writes, or a bot writes on its own turn, has depth 0; a message a bot writes because a message of depth *d* woke it has depth *d + 1*; a message at the limit wakes nobody (bots still see it on their next turn). The server can't count "takeovers", since it doesn't know what a message means, so the limit counts reply depth, which bounds takeover arguments along with any other back-and-forth.
- **Bots post plans only for rosters** (2026-11-10; on 2026-11-01 they posted none). Plans are for structured rosters with a summons: an expedition crew, a departure check before the ship moves ("Direction", point 4), diners at a meal. Asking for help in conversation is still chat, not a plan. Bots claim slots in plans others post, are walked when summoned, do their claimed tasks and tick Done.

### Scripted order and skills (owner, 2026-11-01)

- **Scripted priority order** (a first draft): `returnToSol` (100), `pickSkill` (90), `snoop` (85), `eat` when hungry (80), `travel` (77, the Commander: owner, 2026-11-12, #417), `astro` (76, above piloting: owner, 2026-11-12, #417), `patrolShootHunters` (75), `shootHunters` (74, Shooter or Gunner), `shower` (70), the work goals down to the 2 AP reserve (`repairHull` 55, `contactSol` 54, `tendPlants` 53, `commsOfficer` 52, `research` and `project` 50, ties by the bot's RNG), `shrinkDorm` (45) before `rest` (40) once there's no AP left to spend on work, `explore` (30), `endCycle`. Numbers live on each goal's file or in `server/src/bots/duties.ts`. `repairPilgred` (60) is left out of single player for now (owner, 2026-11-01): returning to Sol with a Mush alive is a Mush win, and the human is the Mush. It comes back once bots can tell every Mush is dead, which waits for the public dead Mush count.
- **Skills a bot picks** (`server/src/bots/skillChoice.ts`, to change as features land): Logistics Expert always; Pilot always, but only preferred for Frieda and Terrence; Shooter only once a pilot; Astrophysicist always, Frieda only; Botanist and Green Thumb always, Ian only; Designer preferred; IT Expert (`computer`) always, Frieda, Janice and Eleesha only; Medic, Paranoid, Physicist, Shrink, Technician (`engineer`), Tracker (`hunt`), Lethargy, Gunner and Meticulous (`stickler`) always; Radio Expert always, Paola only; Scrapper (`metaliciste`) always, after Technician. "Always" means whenever it's on the character's own list. Otherwise a seeded random skill, never one a rule keeps from that character. #222 (owner, 2026-11-01): a bot's strategy follows the skills it has picked this way and the titles it holds, not a static per-character role. What each skill and title makes a bot do is in `server/src/bots/duties.ts` (`BOT_DUTIES`; owner-approved 2026-11-01, edited directly by the owner): duty goals read their priority and trigger from it, and `buildPrompt` includes each held duty's `prompt` line.
- **Costs elsewhere come from the view.** `PublicConfig` carries the base AP of the actions bots walk to (research, project, PILGRED, hull, shower, lie down), so a bot prices a trip without anything outside its view.

### Superseded

- *Plans first* (2026-10-25): coordination went through the old plan system (#44, locked AP, the executor). That design was dropped on 2026-10-30; plans now exist only for rosters and summons.
- *Fixed lines only* and *the line catalog* (2026-10-25): replaced by natural-language chat (2026-11-01).
- *One crew channel*, *bots post only "run when filled" plans*, *bots clean up their own plans*, *bots leave idle channels* (2026-10-25): bots post no plans, so none of this applies.
- *Interrupt on a chat message that names the bot, from a human only* (2026-10-25): every message wakes every bot, bounded by the chain depth.
- *Every message wakes every bot* (2026-11-01): one human line cost about bots × (depth + 1) prompts and drew a chorus of replies; the router (#341) wakes only those a message is meant for.
- *Scripted asks and answers* (`askForHealing` posting a plan; `healSomeone` and `raiseMorale` reading keyed lines): asking and answering are conversation between model bots.
- *`startRelay`*: pooled contributions make relays unnecessary.
- *Goal memory is lost on restart* (2026-10-25) and the open question about it (2026-11-05): bot memory is kept in room storage (2026-11-10).
- *Coordination is models only, with no scripted part* and *helping others is model-only for now* (2026-11-01): scripted bots read plans and NERON's priority, and help mechanically (2026-11-10).
- *Bots post no plans* (2026-11-01): they post roster plans (2026-11-10).
- *A model call per bot for every choice as the only place judgment lives*: ship-level judgment moves to one day plan a day (2026-11-10); per-bot goal choice by a model stays for single player against a human.

## Design

### Unchanged

Goals are an implementation detail inside a bot. Every action a goal returns is still checked against `legalIn(view)` and reaches the game through `GameRoom.act()` like any input, so the record and replays are unaffected (bot rule 9).

### What does change: bots send actions and chat

`Bot.decideAction` returns an `Action`, and `chatLines` returns raw strings that `GameRoom.botChat` posts in global chat. A model bot's turn now returns one structured reply: a goal choice (or a single action), a chat message, or both. Plan slot actions (`claim_slot`, `withdraw_slot`, `mark_done`) are ordinary registry actions in `view.actions`, so they need nothing new. `GameRoom` sends:

- the action through `act()`, checked against `legalIn(view)` as today;
- the message through the same path as a human's chat (`GameRoom.social`): the per-seat chat rate limit, `moderateChat` (#83), the rules' chat checks, `isBot` on the message. It goes in global chat, or a private channel the bot reads, if the model names one. Recorded like any chat.

The bot's reply is untrusted model output: the parser checks the shape, the goal and its parameters against the options offered, and the message's length and channel. Anything malformed is dropped (and counts as a garbage reply: the bot falls back to its scripted solo goals for that turn).

### Talking in chat

- **What the prompt shows.** Recent messages in the channels the bot reads (a window, newest last), each with its author's character name and an AI marker for bots, as quoted, delimited, escaped data (bot rule 7). The bot's own messages are there too, so it remembers what it promised. Plans in its channels are shown as structured data (below).
- **Language.** Bots write in the ship's language (#95), and the prompt says so.
- **No repeats** (owner, 2026-11-05, #224). A message that is the bot's own last chat line again (ignoring case, spacing and trailing punctuation) is dropped (`repeatsLastMessage` in `bots.ts`): flash-lite posted one line six turns running. Only the last line counts, so a bot can ask again after saying something else.
- **Waking.** When a message is posted below the depth limit, `GameRoom.wakeBots` collects the candidates: listening bots (a model with a key) that read the channel, are alive and haven't ended their cycle, other than the author. In a private channel all of them are woken. Anywhere else the chat router (`server/src/router.ts`) asks the model, through the game's `ModelGate` (counted against the budget and the in-flight limit), which of them to wake. Its input is only what the channel's readers see, since it goes to the player's own provider: the message and the channel's last `ROUTER_CONTEXT_LINES` lines, quoted as data like the main prompt, and who may be reading by public facts alone (every living player for global chat and threads, the dead for the graveyard, the Mush for their channel), with character name, given name and public titles (the address forms "commander", ...), marked AI or person and whether it can be woken. Who really reads global chat isn't public (it needs an iTrackie), so every listening bot is offered and the router is asked even if none of them reads it; a named bot that can't read the channel isn't woken. No roles, stats or other channels. The reply is `WAKE: <names>` or `WAKE: nobody`; only candidates count, capped at `ROUTER_MAX_WAKES`. A wake carries no content: the woken bot builds its own prompt from its own view. While a router call is under way, bots hold back `ready`, as for a pending wake. A bot already mid-call is asked once more when it finishes and then sees all new messages, so wakes merge into rounds. Cost: one router call per message (a human's, or a bot's reply below the limit) plus at most `ROUTER_MAX_WAKES` woken calls. The router uses the same provider and model as the bots for now; a fixed small router model per provider, or a second model setting in the BYOK panel, is to decide with #217/#218.
- **Depth bookkeeping.** The room remembers, per bot, the depth of the newest message that woke it, and stamps the bot's reply with that depth plus one. This lives in `GameRoom`'s memory only: not in game state, a message, a view or the record. After a restart it starts at 0, which is harmless.
- **Promises are words.** A bot that said "I'll heal you" chooses a goal (`help`, below) on the same turn; the promise itself isn't stored anywhere. If it can't follow through, it says so or doesn't; the asker asks again if nobody comes.

### A goal

```ts
interface Goal {
  id: string;                          // e.g. "rest", "help", "doSlot"
  key: string;                         // id plus params, e.g. "rest:BEDROOM_A": what "ended this cycle" remembers
  label: string;                       // how the model's list shows it (no player-written text unescaped)
  /** One action toward the goal, or what happened. Reads only the bot's own view and the goal's own progress. */
  step(view: PlayerView, memory: BotMemory): GoalStep;
  /** Whether to keep following this goal when a new cycle starts (default: false). */
  keepAcrossCycle?(view: PlayerView, memory: BotMemory, newDay: boolean, goals: readonly GoalDef[]): boolean;
  /** Called when an interrupt (a chat choice or losing HP) drops this goal before the cycle ends. */
  onInterrupt?(memory: BotMemory): void;
}
type GoalStep =
  | { kind: "act"; action: Action }
  | { kind: "wait" }                    // nothing to do until the next change (ends the cycle with `ready` when that is legal)
  | { kind: "done"; again?: true }      // `again`: may be chosen again this cycle (e.g. rest, or work stopped because dirty)
  | { kind: "failed"; reason: string };

interface GoalDef {
  id: string;
  /** Higher goes first for a bot without a key. The scripted order is these numbers, not a central if/else ladder. */
  priority: number;
  /** The concrete forms of this goal open to the bot now, e.g. "rest in the nearest bedroom". Empty when it doesn't apply. */
  options(view: PlayerView, memory: BotMemory): Goal[];
}
```

**Priority lives on each goal definition** (Gemini, 2026-10-25), so adding a goal means adding one file with its own number, not editing a list elsewhere. Ties break with the bot's seeded RNG. Only the solo goals have a priority; the coordination goals (`help`, `doSlot`) are model-only.

**One affordability helper.** `canAfford(view, room, cost)` answers "can I get there and do this, keeping the 2 AP reserve?" for every goal: it counts travel along `shortestPath` (including the AP-to-MP conversion when MP runs out) and counts free specialist points. Action costs for rooms the bot isn't in come from the public base config, since a view carries only the costs of actions open to it now.

**Keep options few.** A goal offers one or two options, not one per bed or room: `rest` offers the nearest bedroom, `explore` the one or two nearest rooms not visited this cycle. Options are also filtered by what the bot can afford with the 2 AP reserve kept (counting free specialist points, e.g. in `research.ts`, `project.ts`, `repair_pilgred.ts`). `endCycle` is offered only when nothing else is. So a bot out of spendable AP has one option and makes no model call (`ModelBot` already skips the call when there is one choice) unless a chat message woke it, since it may still want to talk.

**Parameterised goals.** `help` can't list every target and room as options; it is offered once, and the model's reply fills its parameters (a task from the plan task catalog, a living player, a room from `view.rooms`). The parser checks each against the view. Where the asker is comes only from what they said in chat; the goal fails on arrival if they aren't there.

**Only what the bot could know.** A view shows items, equipment state and who is in bed only for the bot's own room (`viewFor`). Options elsewhere come from the public, fixed ship map (which rooms have beds, the dispenser, the sick bay), never from live state in another room; the goal checks `view.actions` on arrival and fails if the thing isn't there. `BotMemory` is what the bot saw itself (rooms visited this cycle, see below), since `viewFor` strips `you.history`.

Goals are pure (view and memory in, step out), so they are unit-tested without a server or a model, like `prompt.ts`. They live in `server/src/bots/goals/`, one file per goal, with a registry like `shared/src/actions.ts`.

### Building blocks

Most goals are a few lines built from `server/src/bots/goals/blocks.ts`:

- `goTo(view, room)`: the next `move` along `shortestPath(view.rooms, here, room)` (`shared/src/paths.ts`), or `null` once there. Fails if no path exists or a door is refused.
- `offered(view, type)` and `find(view, type, predicate)`: the offered or first affordable action of `type` in `view.actions`.
- `travelAp(view, room)` and `canAfford(view, room, ap, reserve)`: price a walk and action while keeping `reserve` AP.
- `roomsWith(view, types)` and `nearest(view, rooms)`: reachable rooms from the public ship map, nearest first.

No goal sends `get_up`: any other action already gets a bot out of bed (`getUp` in `queue.ts`).

### How a bot runs goals

1. No goal: collect `options(view)` from every goal definition. A model bot gets a short list (goal names and parameters, not raw actions) in its prompt, with the chat and plans, and replies with a goal, a message, or both. A bot without a key uses the scripted priority order over the solo goals.
2. Each turn: `step` the current goal. `act` returns the action; `done` or `failed` clears the goal and goes back to 1; `wait` (and `endCycle`) holds off on sending `ready` while any living human player is not yet `ready` (or a chat wake is pending in the room), so bots stay responsive to chat and interrupts all cycle (owner, 2026-11-01).
3. An interrupt clears the goal, so the next turn goes back to 1. A model bot woken by chat may keep its goal: its reply can say "carry on".
4. Guards: a goal that takes more than a set number of steps, or makes no progress across a cycle, fails. The existing free-action cap (`MODEL_FREE_ACTIONS_PER_CYCLE`) still applies to model calls.
5. **Refused inputs fail the goal.** `GameRoom` tells the bot when an input it sent was refused (by the rules, or the chat rate limit). The goal fails at once instead of being stepped again.
6. **No loops.** Each goal (by its `key`) that finished or failed this cycle is left out of the options until the next cycle. Without this, a goal that fails without changing the view (no path) would be chosen again at once, forever, and two failing goals could alternate.

The bot's memory is fields on the `ModelBot` or scripted bot object today (to move to room storage, "Direction", point 3): the current goal, the goals done or failed this cycle, the goals done today, the rooms visited this cycle, the Shrinks seen or announced, and the last chat message it has seen.

**Interrupts:**

- *Attacked, or HP below the threshold.*
- *A new chat message* in a channel the bot reads, written by someone else, below the chain depth limit (see "Talking in chat"). Model bots only; a bot without a key ignores chat.
- *Summoned by a plan:* the body was walked (`docs/plans/on-call.md`); the bot re-reads where it is, and its goal re-paths or fails.
- *A new cycle:* not while `rest` is running (see its row), or a resting bot would get up after one cycle, and not while `shrinkDorm` is still the highest-priority solo goal on the same day. The exception (owner, 2026-11-01): while hunters attack and a hunter goal (`shootHunters`, `patrolShootHunters`) is open to it, a resting bot chooses again, staying in bed still among its options. So a model bot is asked once per cycle while hunters attack.

### Plans (`docs/plans/on-call.md`, model bots only)

- **The prompt shows the plans** of the bot's channels as structured data: purpose, room, author, and each slot (on-call or task, the task and its target, holder, reserved for, done, struck). Plans have no free text; channel names are quoted and escaped like chat.
- **Claiming is an action.** `claim_slot`, `withdraw_slot` and `mark_done` are in `view.actions`, and the prompt labels each with the slot it names in words. The model decides whether to claim, using the plan, the chat and what it knows of its own position and points; no scripted claim filter.
- **A claimed task becomes a goal** (`doSlot`): walk to where the task is done and do it, then `mark_done`. A struck slot (target died, already done) fails the goal. Ticking Done is the bot's word, like a human's.
- **An on-call claim is a promise to be reachable.** The prompt reminds the bot of its on-call slots, so it can keep the MP to get there. When the author calls, the game walks the body; the bot does nothing but notice where it now is.
- **Bots post plans only for rosters** (Decided).

### First goal list

Solo (scripted for a bot without a key, chosen by the model for one with a key):

| Goal | Options | Done when |
| --- | --- | --- |
| `rest` | the nearest bedroom | lies down (`lie_down`), then waits (`ready`) cycle after cycle, not interrupted by a new cycle (unless hunters attack and it could fight them, or `travel` is offered: a held jump's trigger, #421), until AP is full or another interrupt fires; its next action gets it up |
| `shootHunters` | a Shooter (`gunman`) or Gunner while hunters attack, a jump hold included (#421; owner, 2026-11-13: shoot or flee, never neither): the nearest turret room not ended this cycle. A scripted bot only at 5+ AP (owner, 2026-11-01: "above 4", `SCRIPTED_SHOOT_AP`); a model bot whenever it can afford the walk and one shot | shoots Aracks first, then the weakest, never an asteroid (owner, 2026-11-12: travel is how to escape asteroids; `shotOrder` in `hunterTargets.ts`) until out of AP, **the reserve included** (owner, 2026-11-01), or the hunters are gone; Shoot points make shots free. A room whose turrets have no charges fails (seen only on arrival) and the next is offered |
| `patrolShootHunters` | a Pilot while hunters attack and the Commander's jump isn't due (#421, `jumpDueByChat`: `Jump: now` is up, or a hold is up and its public trigger is met, since a takeoff under way can't be seen from the bridge; a held jump doesn't ground it; once the jump is due it stays docked, and airborne it lands without shooting, since the jump would take the ship and its pilot; owner, 2026-11-13): the nearest bay not ended this cycle. A scripted bot only at 9+ AP (owner, 2026-11-01, `SCRIPTED_PATROL_AP`); a model bot whenever the walk, takeoff, one shot and the landing are affordable. Aboard a ship it is always offered, and the only goal offered (ships have no doors) | one sortie: takes off in a docked patrol ship (never the Pasiphae, which can't shoot), shoots (Aracks first, then the weakest, never an asteroid) while a shot still leaves the 2 AP to land (a destroyed ship kills its pilot), then lands; waits aboard if it can't afford to land. A bay with no docked ship fails. Both hunter goals stay off while the only hunters are asteroids: `BotMemory.asteroidsOnly` holds the public count when the bot last saw a list of nothing but asteroids, trusted while the count is the same (`onlyAsteroids`) |
| `eat` | 16 cycles after satiety reached 0 (`BOT_EAT_AFTER_CYCLES`; Hungry starts at 24), or already Hungry, never while full; reads the bot's own `satiety` and `satietyZeroSince` (owner, 2026-11-01). Food at hand first (most satiety, cooked before uncooked), else the nearest food place from the fixed map: a kitchen or dispenser room (rations, the dispenser) or the garden (bananas), learned only on arrival. An uncooked ration is cooked first when that keeps the reserve, else eaten raw. A bot that isn't Hungry leaves fruit uneaten while an empty hydropot is on the garden floor (owner, 2026-11-12), so it can be sown | `consume` succeeded. A place with no food fails (`eat:<room>` ends) and the next place is offered. The dispenser gives one coffee per cycle ship-wide (`dispense.ts`) |
| `repairPilgred` | not offered in single player for now (see the priority order); later, when PILGRED isn't finished and every Mush is dead | AP down to the 2 AP reserve (pooled contributions, `docs/plans/relay-tokens.md`) |
| `repairHull` | when the hull is below 50 (owner, 2026-11-01: above that, scrap is worth more elsewhere; `HULL_REPAIR_BELOW`) and the bot carries a metal scrap or sees one in its room (`repair_hull.ts` needs one) | AP down to the 2 AP reserve, or no scrap left |
| `contactSol` | a Radio Expert while the link with Sol is down (`!view.comms.linked`): the Com center terminal | `contact_sol` until the link is up or AP reaches the 2 AP reserve |
| `sowHere` | any bot that isn't Hungry, standing in the garden with an empty hydropot on its floor and a banana it carries or sees there (owner, 2026-11-12: any bot may sow, and sowing is high priority; priority 81, above `eat`) | picks the banana up if needed and sows it into the floor pot (never a carried pot), within the reserve, garden points first |
| `setOutPots` | a Botanist-role or Green Thumb bot, once a game, early (priority 54; owner, 2026-11-12) | carries the empty hydropots it holds (Green Thumb's two) to the garden floor, then takes every empty pot in Storage Front and drops those in the garden too; sows a banana as soon as a slot is free. Storage Front is checked once a game (`memory.once`) |
| `tendPlants` | only a Botanist-role bot (`botanic` or `skilful`, who see sickness; owner, 2026-11-01: a bot can't tell whether a Botanist is aboard, so others leave plants alone): once a day, or whenever it stands in the garden with a job it can see | sow a banana into an empty garden hydropot first (owner, 2026-11-12; picking one up off the garden floor if it carries none), then water, then treat, all within the reserve, garden points first; done when no job is left |
| `astro` | an Astrophysicist, each cycle while it has planet work (#417; owner, 2026-11-12): the Astro terminal | in order: deletes a planet with Mankarog or Volcanic activity, farther than the ship's fuel, or fully analyzed with neither Oxygen nor Hydrocarbon (`delete_planet`); shares the destination in the bots' format (`planetShare.ts`, a `social` step; not while traveling or in orbit): a ready planet with a kind other than the last orbited one's, then the nearest; analyzes (`analyze_planet`); scans (`scan_planet`) while under `maxPlanets`; down to the 2 AP reserve |
| `commsOfficer` | the Comms Officer while the link with Sol is up (`view.comms.linked`): the Com center terminal | `decode_rebel` on open calls first (Computer points pay first), then `contact_xyloph`, then `update_neron`, down to the 2 AP reserve or until the link drops |
| `research` / `project` | each one the bot can work on, judged from the public list; research's lab requirements are checked only on arrival, since a view shows the lab's items only from inside it | AP down to the 2 AP reserve. Both refuse a dirty player (`research.ts`, `project.ts`) |
| `shrinkDorm` | a Shrink, once a day: today's dorm, `BEDROOM_A` and `BEDROOM_B` on alternate days (by day number) | stayed there until the cycle ended, lying down first if its AP isn't full and a bed is free |
| `explore` | the one or two nearest rooms not visited this cycle | arrived |
| `travel` | the Commander (#417; owner, 2026-11-12), out of orbit and not traveling, with an applicable share in the bots' format whose distance the tanks' fuel covers: the latest one, whoever wrote it | checks the combustion chamber (`check_combustion`; nobody sees its level otherwise), takes fuel capsules from the nearest tank and loads exactly the distance (or unloads the extra), turns at the Command terminal the shorter way (the other way if that reactor is broken), travels; may spend the AP reserve, like `returnToSol` (walking between tank and chamber burns AP once MP runs out). Doesn't look for pilots in flight (owner, 2026-11-12: travel regardless). Leaving orbit waits for slice 3: the explored sectors will come from expedition reports the crew shares in a bots' format (owner, 2026-11-12). **Holds the jump (#421; owner, 2026-11-12):** with no share in reach it prepares a 1-fuel escape jump on the current heading instead (and upgrades it if a share arrives mid-hold). It posts `Jump: hold` in global chat as it starts preparing, so a line is always up before a jump; running out of AP pauses the hold rather than cancelling it. Once prepared, at the bridge, and holds `travel` until 5+ hunters attack (`HOLD_HUNTER_TRIGGER`; 8 at first, lowered after the trial below, owner, 2026-11-13), 4 days pass (`HOLD_MAX_DAYS`), or oxygen is at or below 8 (`HOLD_MIN_OXYGEN`), then flees (owner, 2026-11-13): it jumps at once if its minimap shows every living crewmate aboard (nobody in a patrol ship or the Icarus; `crewAboard` in `planetShare.ts`, the unidentified dots count too), else it posts `Jump: now`, which grounds the Pilots, and jumps once they are back; the decision stands even if the count drops meanwhile. As a safety limit it jumps anyway 2 cycles after `Jump: now` (`JUMP_WAIT_CYCLES`; owner, 2026-11-13). Pilots land with their last 2 AP (3 when short of MP to walk to a bed), so a flight shouldn't outlast it. After the jump it posts `Jump: off` (also when it gives up). While holding, every other goal must leave it 1 AP and the walk back to the bridge (`canAfford` in `blocks.ts`, `GoalBot.keepsHeldJump`). If the line scrolls out of chat (only the latest pages are kept) it posts it again, keeping the first line's start. A human Commander means no hold and no escape jumps |
| `returnToSol` | PILGRED is repaired and the bot may return (the Commander, `return_to_sol.ts`) | returned; first in the scripted order, since it wins the game |
| `pickSkill` | a skill slot is open (`pick_skill`, free) | picked; second in the scripted order. Which skill: `chooseSkill` (`server/src/bots/skillChoice.ts`, `BOT_SKILL_RULES`), else a seeded random human skill |
| `snoop` | a Scrapper (`metaliciste`) where `snoop` is offered in its current room (a storage room not snooped today, free; owner, 2026-11-01); never walks to a storage for it | snooped; right after `pickSkill` in the scripted order (priority 85) |
| `shower` | the bot is dirty and a work goal it would otherwise choose refuses dirty players | showered (`shower.ts`); just before the work goals in the scripted order |
| `endCycle` | only when nothing else is open; a model bot first withdraws from slots it can no longer reach or do | `ready` |

Coordination (model only):

| Goal | Parameters | Done when |
| --- | --- | --- |
| `help` | a task (heal, comfort, Fiery speech, …, from the plan task catalog), its target, the room to go to | walked there and did it; fails if the target isn't there or the action isn't offered on arrival |
| `doSlot` | a task slot the bot holds | did the task and ticked `mark_done` |

Asking for help has no goal: the bot just says it in global chat. Answering an ask is `help`. Neither checks the asker's HP or morale, which are private; the ask itself is the signal.

Suspicion, accusations and other social goals are left for later; they need their own design, which natural-language chat now makes possible.

### Tests

- Each goal: the steps it returns for a hand-built view, including failure (no path, can't afford, the bed is taken, the target isn't there, the slot was struck).
- A bot with a goal makes no model call until the goal ends or an interrupt fires (a fake gate counts calls).
- Goal options, chat window, plans section and the whole prompt contain nothing outside the bot's view (the `bot` skill's leak test, and the `leak-check` skill): no private channel the bot isn't in, no plan of such a channel.
- Only actions from `legalIn(view)` reach `act()`, including when a goal's step is stale; a malformed reply (bad goal, bad parameter, overlong message, a channel the bot can't post in) is dropped.
- Bot messages go through moderation and the chat rate limit and carry `isBot`.
- Waking: the router's choice, never more than `ROUTER_MAX_WAKES`, never the author or a bot that can't read the channel, and nobody when it fails or answers garbage; a private channel wakes its members without a router call; a message at the depth limit wakes nobody; replies get the right depth; several messages during one call make one more call, not several; a bot without a key is never woken by chat.
- A goal that fails without changing the view isn't chosen again that cycle; two failing goals don't alternate.
- A summoned bot's goal re-paths from where it was walked to.
- Replay: a game where bots chatted and claimed slots rebuilds the same state from its record.

## Open questions

- Which language the ship uses, and so which language bots write in: #95.
- The chat window: how many messages, and how far back, go in the prompt. Start small and measure with `npm run model-trial` (#224).
- **Bot memory in room storage** (direction set 2026-11-10; replaces the 2026-11-05 question). Found 2026-11-05: a restart wipes `BotMemory`, so a Shrink bot announces itself again and once-a-day goals repeat. To design: the stored shape and how it changes across deploys.
- **Reporting a damaged oxygen tank** when the bot has no key: chat is model-only, so a scripted bot needs something structured. A plan with a repair slot is Claude's suggestion, not asked.
- **The day plan for scripted readers:** which parts go in a plan or the priority so a scripted NERON admin and crew can act on it, and what the harness uses when no model is called.
- **Eden's rules** (`docs/plans/balance.md`): the options and briefing in "Direction", point 6, can't be finished until they exist. NERON's priority needs its own rule pass too.

## Build order

1. Goal interface, building blocks, the interrupts, and the solo goals, with the scripted priority order and the 2 AP reserve. Bots without a key use it. **Built 2026-11-01** (`server/src/bots/goals/`, `GoalBot` in `bots.ts`). Choices made while building, not asked:
   - The reserve binds work, shower and explore; eat, rest and return to Sol may spend it (it is for emergencies).
   - Explore walks on MP only, never converting AP.
   - A bot doesn't shower while it could repair the hull, which doesn't mind dirt.
   - Ending the cycle isn't kept as a goal: a bot waiting for the clock looks again each turn.
   - A finished rest may be chosen again the same cycle.
   - The only interrupts so far are a new cycle (not while resting) and losing HP. Being summoned needs none, since `goTo` re-paths from where the bot stands each turn.
   - The asking threshold (7) waits for step 3, where it's used.
2. Model goal choice: the goal list in the prompt replaces the raw action list; measure with `npm run model-trial` against today's prompt (#224). Overlaps with the bot menu (#259). **Built 2026-11-01** (`ModelBot` extends `GoalBot`; `buildPrompt` lists goal labels; reply `GOAL: <n>`). The first prompt of a game went from about 4,700 characters to 1,400 (`--fake --dump-prompt`); a real-model run is still to do. Choices made while building, not asked:
   - The model is offered only the solo goals, and no single actions: heal, comfort and the like come back with `help` in step 3.
   - Goals are listed in registry order (about the scripted priority order), each with a label naming the room and how many doors away.
   - The free-action cap became a cap on model choices per cycle (`MODEL_CHOICES_PER_CYCLE`, still 8); past it, the bot goes by priority.
   - The exits line left the prompt, since the bot no longer chooses moves.
3. Model chat (#223): the chat window in the prompt, the structured reply with a message, posting through moderation and the rate limit, waking every bot with the chain depth limit, and `help`. **Built 2026-11-01** (`ModelBot` in `bots.ts`, `parseReply` in `prompt.ts`, `goals/help.ts`, `GameRoom.wakeBots` and `botSay`). No real-model run yet (`npm run model-trial` now posts bot chat and wakes the others too). Choices made while building, not asked:
   - The reply is lines: `GOAL: <n>` (0 carries on, offered only when woken mid-goal), `HELP: <task> <who> <room> [<times>] [reserve]`, and `SAY: <channel>: <text>` or `SAY: to <who>: <text>`. The last goal or help line wins; one message a turn. A malformed line drops the whole reply (it posts nothing, and the bot carries on or goes by priority). A reply with only a message carries on, or goes by priority.
   - `help` covers heal, comfort and Fiery speech (heal is offered to every bot: a medikit, or both in the sick bay); it repeats up to 5 times (`HELP_MAX_TIMES`), keeps the reserve unless the reply says `reserve`, may spend AP on the walk, and fails on arrival if the person isn't there or the action isn't offered.
   - `"to <who>"` posts in a private channel the two share alone, opening one if needed; if the invite is refused, the bot leaves the empty channel and says nothing.
   - The asking advice is prompt text from the bot's own stats: HP 7 or less (`ASK_HEALING_HP`), morale under 7 and under 5 (`ASK_SHRINK_MORALE`, `ASK_PUBLIC_MORALE`); a Shrink is told to announce itself if it hasn't. The prompt now also lists skills of people in the bot's room (public there), so a bot can spot a Shrink by meeting one.
   - A woken bot that is busy (an action bar) answers once its action is done. Woken calls don't count against `MODEL_CHOICES_PER_CYCLE`; the chain depth bounds them.
   - A chat message the bot couldn't post (rate limit, moderation) is only logged; it doesn't fail the goal.
   - Language: the ship's lobby language (`GameRoom.language`, English when there is none) is what the prompt asks for, a stand-in until #95 decides how a ship's language is chosen.
   - The chat window stays the last 10 messages (still open).
4. Plans for bots (#316): the plans section in the prompt, slot actions labelled in words, `doSlot`, on-call reminders and withdrawing at `endCycle`.
5. Reaching Eden ("Direction", 2026-11-10), in order: the survival harness with no Mush; upkeep goals, worst killer first; typed memory in room storage; roster plans posted by bots (expedition crew, departure check) and NERON's priority as a signal once it exists; the day plan; travel and expedition options with a chooser, once Eden's rules exist; tuning by search.
   - **The survival harness is built** (2026-11-11): `npm run survival -w server` (`server/src/testing/survival.ts`, `scripts/survival.trial.ts`; flags in `docs/process/commands.md`). A day cap of 30 by default (owner, 2026-11-11); death causes come from the rules (#177, owner); no model bots in it (owner, 2026-11-11). Choices made while building, not asked: the crew is 16 characters drawn with the seed (any character, as in `model-trial`); bots act one at a time in seat order, as the room's bot timers fire; a cycle that can't advance counts as `stalled`, never as survival; seeds run in parallel processes (`--jobs`), since the rules cost about 2.7 ms per input and 1.7 ms per view, so a 16-seat game day takes about 4 s on one core.
   - **First baseline** (2026-11-11, 50 seeds, crew 16, cap 30 days, incidents on, 6 minutes): no ship lasted past day 6 (median 3.7 days, min 2.4, max 5.5). Endings: ship destroyed 40, all crew dead 10. Deaths: Daedalus destroyed 380, asphyxia 280, burnt 82, depression 49, injury 4, metal plate 3, starvation 2. Oxygen ran out in 40 runs (median day 3.5) and the hull in 40 (median day 4); fuel never did. So the first upkeep goals are oxygen, then the hull against hunters, then fires. Also seen: `rest` was started 27,282 times and `explore` 10,563 (about 34 and 13 per bot per day), which looks like goals churning, while `repairHull` was started 22 times. The run is saved, minified, as `docs/scratchpad/survival-baseline-2026-11-11.json`: compare a bot change against it with `npm run survival -w server -- --seeds 1-50 --compare docs/scratchpad/survival-baseline-2026-11-11.json` (a rules change since then can move it too, so rerun the baseline after one).
   - **Holding jumps (#421, 2026-11-13, 50 seeds, crew 16, cap 30 days)**, against committed `main` from the same day (the #417 travel goal, no hold), run back to back: ships last slightly longer (median 3.50 → 3.69 days, max 4.88 → 5.88; 27 seeds longer, 20 shorter, mean +0.07 days), but hull destruction **rose** (ship destroyed 33 → 36, all crew dead 17 → 14), so the issue's bar is not met. Jumps 22 → 98 (in 48 of 50 runs); turret and patrol sorties fell (476 → 366, 222 → 164). Oxygen still runs out first (39 runs, median day 3), so most holds end on the oxygen trigger (at or below 8) long before 4 days, and asphyxia stays the top killer (308 → 340). Likely reading: the crew lives long enough for the hull to go instead, and the hunters below the trigger hit freely while the shooters wait (an accepted cost). The trigger of 8 is the tuning knob the owner left open. Runs saved minified as `docs/scratchpad/survival-pre421-2026-11-13.json` and `docs/scratchpad/survival-421-2026-11-13.json`.
   - **Shoot or flee, never neither (owner, 2026-11-13):** the turret gunners now keep shooting through a hold; only the Pilot stays docked (a jump would take the ship and its pilot). Rerun on the same seeds: no better (median 3.50 days, mean −0.04 against the pre-#421 run, 21 longer and 27 shorter; ship destroyed 38, all crew dead 12; jumps 70; average hull at day 2 91.6 against 97.3). Why, from the run: the Commander prepares an escape jump on day 1, so a hold is posted for most of the game and the Pilot is grounded for all of it (sorties 222 → 142), and waves rarely reach 8, so most jumps come from the oxygen trigger on day 3, when there are few hunters to shed. Two pilots died `abandoned`: when the trigger is already met as the jump becomes ready, the Commander jumps without posting a hold, so an airborne pilot isn't told to land. Saved as `docs/scratchpad/survival-421-shoot-2026-11-13.json`.
   - **Fly until the Commander flees (owner, 2026-11-13):** a held jump no longer grounds the Pilot; only `Jump: now`, posted when the trigger is met and someone is still out, does, and the Commander jumps only once its minimap shows the whole living crew aboard. Rerun on the same seeds against the pre-#421 run: median 3.50 → 3.63 days, mean +0.18 (25 longer, 22 shorter), the best of the three variants but within noise; ship destroyed 39, all crew dead 11, so hull destruction still hasn't fallen. Patrol sorties back to 232 (222 before #421), jumps 60 in 35 runs, no pilot `abandoned` (2 before), 3 pilots killed in flight (`space_battle`). Saved as `docs/scratchpad/survival-421-now-2026-11-13.json`. The 2-cycle wait limit added after it changed nothing on these seeds (identical rerun): bot pilots always land within the cycle.
   - **Trigger 5 (owner, 2026-11-13):** first run with 5 hunters as the trigger left 5 pilots `abandoned` on day 1: `travel` and `takeoff` are both timed, and a takeoff already under way can't be seen from the bridge, so the minimap check alone races it. Fixed by having pilots read the trigger from public information (`jumpDueByChat`), posting the hold line as preparing starts, and pausing instead of cancelling when the Commander is out of AP (a cancel had opened a gap with no line up). Final run, same seeds, against pre-#421: median cycle 29 → 31 (mean +0.23 days, 28 longer, 15 shorter), ship destroyed 33 → 34, all crew dead 17 → 16, average hull at day 2 80.6 → 85.9, jumps 107 (in all 50 runs), no pilot abandoned. An intermediate run (before the last two fixes, one pilot abandoned) had 28 ships destroyed, so the seed-to-seed noise is about ±5. Chat lines from the Commander: 724 over 50 runs (about 14 a game). Saved as `docs/scratchpad/survival-421-t5-2026-11-13.json`.
