# Bot goals (plan)

2026-10-25, revised 2026-11-01. How single-player bots act on purpose (walk to a bed to rest, answer a call for help, do the task they claimed in a plan) instead of choosing one action at a time from what is in front of them. The owner accepted the first design on 2026-10-25 and changed how bots coordinate on 2026-11-01: **coordination is model-only and happens in natural-language chat**, and plans (`docs/plans/on-call.md`) are only for structured rosters. **Open questions** still need the owner's answer before the part they block is built.

## The problem

Today (`server/src/bots.ts`, `server/src/prompt.ts`) a model bot gets a fresh prompt for each action: its view, the exits from its room, and a numbered list of affordable actions. It picks one and forgets it. So it can't follow through on anything longer than one step:

- **No memory.** "I should rest" one turn is gone the next.
- **No route.** The prompt lists only the current room's exits, though `view.rooms` already holds the whole (public) room graph. Planning a walk across 27 rooms, one model call per door, is unreliable and costs the player money (BYOK).
- **No coordination.** Some goals need another player: a hurt bot needs a healer, a low-morale one a Leader, and several healers answering one ask need to settle who goes. (PILGRED relays no longer need coordination: pooled contributions, `docs/plans/relay-tokens.md`.) Terrence needs someone to push his wheelchair (`accommodate`).

## Decided

### Goals (owner, 2026-10-25, still valid)

- **A fixed list of goals.** The model chooses among goals the code defines; it never invents one. Code carries out the chosen goal.
- **Re-choose only on finish, failure or interrupt.** One model call picks a goal; the goal then runs with no model calls until it finishes, fails, or an interrupt fires. This keeps the cost per cycle low.
- **Goal memory is lost on restart.** A bot's current goal lives in the `Bot` object's memory. If the Durable Object restarts, the bot just chooses again. Nothing about goals goes in game state, the record, storage, or a view.
- **AP reserve: 2.** Work goals stop when spending more would leave the bot under 2 AP, keeping it for emergencies. A config value.
- **No free-text notes.** The model writes nothing for itself; chat could inject text into a note that then stays in every later prompt. A bot's memory is its current goal and its last failure. Richer memory is a later design. (Its own chat messages are in the chat it reads, like anyone's; that isn't a note.)
- **Asking threshold.** A bot is prompted to consider asking for help when HP or morale is 7 or less (config values, a default for now).
- **Always ask for healing** (after Gemini's review). No self-healing goal: a hurt bot without a medikit asks, even though the sick bay heals without one.
- **No wheelchair goals in the first pass.** A pusher can't know where Terrence wants to go. With natural-language chat bots can now say where they're headed, so this can be revisited.
- **Four more goals** (after Gemini's second review) so bots are competent crew: shower when dirty, pick skills, return to Sol, and helping a player who asked (heal, Fiery speech). See the goal list.
- **No framework.** LLM agent frameworks (Mastra and similar) coordinate by letting agents message each other directly or share a blackboard. That breaks the bot rule that a bot only ever receives its own seat's view, and in single player (the human is the only Mush) it would give the eight bots a perfect backchannel the human doesn't have. Bots coordinate only through what humans use: plans, channels, chat. If goals later share subgoals in tangled ways, game-AI structures (behavior trees, HTN) are the next step, hand-written or a small library (ask before adding one).

### Coordination (owner, 2026-11-01)

- **Models only.** Coordination (asking for help, offering, taking over, accepting, claiming plan slots) is done only by model bots, with no scripted fallback for it. A bot without a key plays the scripted solo goals (eat, rest, work, explore, end the cycle) and takes no part in chat or plans. The owner judges whether the cost is acceptable.
- **Natural-language chat.** Bots write their own messages, so asks and offers are ordinary chat, not keyed catalog lines. This replaces the 2026-10-25 "fixed lines only" decision and the line catalog. It pulls model-written chat (#223) into this work.
- **No structured intents in chat.** The server never knows what a message means; models read each other's text and the human's alike. There are no intent tags on messages and no tagging buttons for the human.
- **Claims are settled in conversation.** "I'll heal you", "let me, I have nurse points to spend", "OK, Kuan Ti then": a helper offers, another may take over for any reason (closer, distrust, saving someone's AP, spending specialist points), and the one being helped accepts one. The model weighs the reasons; there is no rule for who wins. The bot being helped doesn't need anything structured to accept: it says so.
- **Clarify only when unclear.** A bot doesn't restate or confirm what someone said when the meaning is plain. If a message is genuinely ambiguous ("I'll heal her" with two hurt women), the model may ask, as a person would. An unclear message leads to no action: a bot never acts on a guess.
- **Healing asks go in global chat.** Private channels are too complicated for this for now. The Mush hearing who is hurt and where is as in the original.
- **Every message wakes every bot.** Each chat message in a channel a bot reads (the human's or another bot's) is an interrupt for every bot except its author, which gets a turn to reply, act, or do nothing.
- **A reply-chain depth limit** bounds the cascade (`botChatChainDepth`, 3 to start). A message the human writes, or a bot writes on its own turn, has depth 0; a message a bot writes because a message of depth *d* woke it has depth *d + 1*; a message at the limit wakes nobody (bots still see it on their next turn). The server can't count "takeovers", since it doesn't know what a message means, so the limit counts reply depth, which bounds takeover arguments along with any other back-and-forth.
- **Bots post no plans** (reverses on-call.md's 2026-10-28 and 2026-10-30 bot-posting decisions). Plans are for structured rosters with a summons (an expedition crew, diners at a meal); a bot may post one again when such a goal exists. Bots do claim slots in plans others post, are walked when summoned, do their claimed tasks and tick Done.

### Scripted order and skills (owner, 2026-11-01)

- **Scripted priority order** (a first draft): `returnToSol`, `pickSkill`, `eat` when hungry, `shower`, the work goals down to the 2 AP reserve, `rest` once there's no AP left to spend on work, `explore`, `endCycle`. Numbers in each goal's file. Among the work goals (my order, not asked): `repairHull` 55, `research` and `project` 50 (ties by the bot's RNG). `repairPilgred` (60) is left out of single player for now (owner, 2026-11-01): returning to Sol with a Mush alive is a Mush win, and the human is the Mush. It comes back once bots can tell every Mush is dead, which waits for the public dead Mush count.
- **Skills a bot picks** (`server/src/bots/skillChoice.ts`, to change as features land): Logistics Expert always; Pilot always, but only preferred for Frieda and Terrence; Shooter only once a pilot; Astrophysicist always, Frieda only; Botanist and Green Thumb always, Ian only; Designer preferred; IT Expert (`computer`) always, Frieda, Janice and Eleesha only; Medic, Paranoid, Physicist, Shrink, Technician (`engineer`), Tracker (`hunt`), Lethargy and Meticulous (`stickler`) always. "Always" means whenever it's on the character's own list. Otherwise a seeded random skill, never one a rule keeps from that character. #222 (owner, 2026-11-01): a bot's strategy follows the skills it has picked this way and the titles it holds, not a static per-character role. What each skill and title makes a bot do is drafted in `server/src/bots/duties.ts` (`BOT_DUTIES`), for the owner to edit; nothing reads it yet.
- **Costs elsewhere come from the view.** `PublicConfig` carries the base AP of the actions bots walk to (research, project, PILGRED, hull, shower, lie down), so a bot prices a trip without anything outside its view.

### Superseded

- *Plans first* (2026-10-25): coordination went through the old plan system (#44, locked AP, the executor). That design was dropped on 2026-10-30; plans now exist only for rosters and summons.
- *Fixed lines only* and *the line catalog* (2026-10-25): replaced by natural-language chat (2026-11-01).
- *One crew channel*, *bots post only "run when filled" plans*, *bots clean up their own plans*, *bots leave idle channels* (2026-10-25): bots post no plans, so none of this applies.
- *Interrupt on a chat message that names the bot, from a human only* (2026-10-25): every message wakes every bot, bounded by the chain depth.
- *Scripted asks and answers* (`askForHealing` posting a plan; `healSomeone` and `raiseMorale` reading keyed lines): asking and answering are conversation between model bots.
- *`startRelay`*: pooled contributions make relays unnecessary.

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
- **Waking.** `GameRoom` marks every bot except the author as interrupted when a message is posted below the depth limit. A bot already mid-call is asked once more when it finishes and then sees all new messages, so wakes merge into rounds: one round costs at most one call per bot (8 in single player), and one chain at most about 8 × (depth limit + 1), usually fewer, since bots that have nothing to say end the chain.
- **Depth bookkeeping.** The room remembers, per bot, the depth of the newest message that woke it, and stamps the bot's reply with that depth plus one. This lives in `GameRoom`'s memory only: not in game state, a message, a view or the record. After a restart it starts at 0, which is harmless.
- **Promises are words.** A bot that said "I'll heal you" chooses a goal (`help`, below) on the same turn; the promise itself isn't stored anywhere. If it can't follow through, it says so or doesn't; the asker asks again if nobody comes.

### A goal

```ts
interface Goal {
  id: GoalId;                          // e.g. "rest", "help", "doSlot"
  params: GoalParams;                  // filled from the view or the model's reply: a room, a bed, a target, a plan slot
  key: string;                         // id plus params, e.g. "rest:BEDROOM_A": what "done or failed this cycle" remembers
  label: string;                       // how the model's list shows it (no player-written text unescaped)
  /** One action toward the goal, or what happened. Reads only the bot's own view and the goal's own progress. */
  step(view: PlayerView, progress: GoalProgress): GoalStep;
}
type GoalStep =
  | { kind: "act"; action: Action }
  | { kind: "wait" }                    // nothing to do until the next change (ends the cycle with `ready` when that is legal)
  | { kind: "done" }
  | { kind: "failed"; reason: FailReason };

interface GoalDef {
  id: GoalId;
  /** The concrete forms of this goal open to the bot now, e.g. "rest in the nearest bedroom". Empty when it doesn't apply. */
  options(view: PlayerView, memory: BotMemory): Goal[];
  /** Higher goes first for a bot without a key. The scripted order is these numbers, not a central if/else ladder. */
  priority(view: PlayerView, goal: Goal): number;
}
```

**Priority lives on each goal definition** (Gemini, 2026-10-25), so adding a goal means adding one file with its own number, not editing a list elsewhere. Ties break with the bot's seeded RNG. Only the solo goals have a priority; the coordination goals (`help`, `doSlot`) are model-only.

**One affordability helper.** `canAfford(view, room, cost)` answers "can I get there and do this, keeping the 2 AP reserve?" for every goal: it counts travel along `shortestPath` (including the AP-to-MP conversion when MP runs out) and counts free specialist points. Action costs for rooms the bot isn't in come from the public base config, since a view carries only the costs of actions open to it now.

**Keep options few.** A goal offers one or two options, not one per bed or room: `rest` offers the nearest bedroom, `explore` the one or two nearest rooms not visited this cycle. Options are also filtered by what the bot can afford with the 2 AP reserve kept (counting free specialist points, e.g. in `research.ts`, `project.ts`, `repair_pilgred.ts`). `endCycle` is offered only when nothing else is. So a bot out of spendable AP has one option and makes no model call (`ModelBot` already skips the call when there is one choice) unless a chat message woke it, since it may still want to talk.

**Parameterised goals.** `help` can't list every target and room as options; it is offered once, and the model's reply fills its parameters (a task from the plan task catalog, a living player, a room from `view.rooms`). The parser checks each against the view. Where the asker is comes only from what they said in chat; the goal fails on arrival if they aren't there.

**Only what the bot could know.** A view shows items, equipment state and who is in bed only for the bot's own room (`viewFor`). Options elsewhere come from the public, fixed ship map (which rooms have beds, the dispenser, the sick bay), never from live state in another room; the goal checks `view.actions` on arrival and fails if the thing isn't there. `BotMemory` is what the bot saw itself (rooms visited this cycle, see below), since `viewFor` strips `you.history`.

Goals are pure (view and memory in, step out), so they are unit-tested without a server or a model, like `prompt.ts`. They live in `server/src/bots/goals/`, one file per goal, with a registry like `shared/src/actions.ts`.

### Building blocks

Most goals should be a few lines built from these:

- `goTo(room)`: the next `move` along `shortestPath(view.rooms, here, room)` (`shared/src/paths.ts`). Fails if no path exists or a door is refused.
- `use(action predicate)`: the matching action from `legalIn(view)`, or wait/fail.
- `take(itemType)`, `drop(itemType)`.

No goal sends `get_up`: any other action already gets a bot out of bed (`getUp` in `queue.ts`).

### How a bot runs goals

1. No goal: collect `options(view)` from every goal definition. A model bot gets a short list (goal names and parameters, not raw actions) in its prompt, with the chat and plans, and replies with a goal, a message, or both. A bot without a key uses the scripted priority order over the solo goals.
2. Each turn: `step` the current goal. `act` returns the action; `done` or `failed` clears the goal and goes back to 1; `wait` returns `ready` when legal, otherwise null.
3. An interrupt clears the goal, so the next turn goes back to 1. A model bot woken by chat may keep its goal: its reply can say "carry on".
4. Guards: a goal that takes more than a set number of steps, or makes no progress across a cycle, fails. The existing free-action cap (`MODEL_FREE_ACTIONS_PER_CYCLE`) still applies to model calls.
5. **Refused inputs fail the goal.** `GameRoom` tells the bot when an input it sent was refused (by the rules, or the chat rate limit). The goal fails at once instead of being stepped again.
6. **No loops.** Each goal (by its `key`) that finished or failed this cycle is left out of the options until the next cycle. Without this, a goal that fails without changing the view (no path) would be chosen again at once, forever, and two failing goals could alternate.

The bot's memory is fields on the `ModelBot` or scripted bot object, nowhere else: the current goal, the goals done or failed this cycle, the rooms visited this cycle, and the last chat message it has seen.

**Interrupts:**

- *Attacked, or HP below the threshold.*
- *A new chat message* in a channel the bot reads, written by someone else, below the chain depth limit (see "Talking in chat"). Model bots only; a bot without a key ignores chat.
- *Summoned by a plan:* the body was walked (`docs/plans/on-call.md`); the bot re-reads where it is, and its goal re-paths or fails.
- *A new cycle:* not while `rest` is running (see its row), or a resting bot would get up after one cycle.

### Plans (`docs/plans/on-call.md`, model bots only)

- **The prompt shows the plans** of the bot's channels as structured data: purpose, room, author, and each slot (on-call or task, the task and its target, holder, reserved for, done, struck). Plans have no free text; channel names are quoted and escaped like chat.
- **Claiming is an action.** `claim_slot`, `withdraw_slot` and `mark_done` are in `view.actions`, and the prompt labels each with the slot it names in words. The model decides whether to claim, using the plan, the chat and what it knows of its own position and points; no scripted claim filter.
- **A claimed task becomes a goal** (`doSlot`): walk to where the task is done and do it, then `mark_done`. A struck slot (target died, already done) fails the goal. Ticking Done is the bot's word, like a human's.
- **An on-call claim is a promise to be reachable.** The prompt reminds the bot of its on-call slots, so it can keep the MP to get there. When the author calls, the game walks the body; the bot does nothing but notice where it now is.
- **Bots post no plans** for now (Decided).

### First goal list

Solo (scripted for a bot without a key, chosen by the model for one with a key):

| Goal | Options | Done when |
| --- | --- | --- |
| `rest` | the nearest bedroom | lies down (`lie_down`), then waits (`ready`) cycle after cycle, not interrupted by a new cycle, until AP is full or another interrupt fires; its next action gets it up |
| `eat` | food in its room, or the dispenser | `consume` succeeded. The dispenser gives one coffee per cycle ship-wide (`dispense.ts`), so a bot that finds it empty fails and doesn't retry that cycle |
| `repairPilgred` | not offered in single player for now (see the priority order); later, when PILGRED isn't finished and every Mush is dead | AP down to the 2 AP reserve (pooled contributions, `docs/plans/relay-tokens.md`) |
| `repairHull` | when the hull is below 50 (owner, 2026-11-01: above that, scrap is worth more elsewhere; `HULL_REPAIR_BELOW`) and the bot carries a metal scrap or sees one in its room (`repair_hull.ts` needs one) | AP down to the 2 AP reserve, or no scrap left |
| `research` / `project` | each one the bot can work on, judged from the public list; research's lab requirements are checked only on arrival, since a view shows the lab's items only from inside it | AP down to the 2 AP reserve. Both refuse a dirty player (`research.ts`, `project.ts`) |
| `explore` | the one or two nearest rooms not visited this cycle | arrived |
| `returnToSol` | PILGRED is repaired and the bot may return (the Commander, `return_to_sol.ts`) | returned; first in the scripted order, since it wins the game |
| `pickSkill` | a skill slot is open (`pick_skill`, free) | picked; second in the scripted order. Which skill: the scripted bot prefers ones that help its work goals (Engineer, Physicist), else a seeded random one |
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
- Waking: a message wakes every bot but its author; a message at the depth limit wakes nobody; replies get the right depth; several messages during one call make one more call, not several; a bot without a key is never woken by chat.
- A goal that fails without changing the view isn't chosen again that cycle; two failing goals don't alternate.
- A summoned bot's goal re-paths from where it was walked to.
- Replay: a game where bots chatted and claimed slots rebuilds the same state from its record.

## Open questions

- Which language the ship uses, and so which language bots write in: #95.
- The chat window: how many messages, and how far back, go in the prompt. Start small and measure with `npm run model-trial` (#224).

## Build order

1. Goal interface, building blocks, the interrupts, and the solo goals, with the scripted priority order and the 2 AP reserve. Bots without a key use it. **Built 2026-11-01** (`server/src/bots/goals/`, `GoalBot` in `bots.ts`). Choices made while building, not asked:
   - The reserve binds work, shower and explore; eat, rest and return to Sol may spend it (it is for emergencies).
   - Explore walks on MP only, never converting AP.
   - A bot doesn't shower while it could repair the hull, which doesn't mind dirt.
   - Ending the cycle isn't kept as a goal: a bot waiting for the clock looks again each turn.
   - A finished rest may be chosen again the same cycle.
   - The only interrupts so far are a new cycle (not while resting) and losing HP. Being summoned needs none, since `goTo` re-paths from where the bot stands each turn.
   - The asking threshold (7) waits for step 3, where it's used.
2. Model goal choice: the goal list in the prompt replaces the raw action list; measure with `npm run model-trial` against today's prompt (#224). Overlaps with the bot menu (#259).
3. Model chat (#223): the chat window in the prompt, the structured reply with a message, posting through moderation and the rate limit, waking every bot with the chain depth limit, and `help`.
4. Plans for bots (#316): the plans section in the prompt, slot actions labelled in words, `doSlot`, on-call reminders and withdrawing at `endCycle`.
