# Bot goals (plan)

2026-10-25. How single-player bots act on purpose (walk to a bed to rest, keep PILGRED going with a relay partner) instead of choosing one action at a time from what is in front of them. The owner accepted this design for a first pass on 2026-10-25, to iterate on later. **Open questions** still need the owner's answer before the part they block is built. It builds on the plan system in `docs/action-plans.md` (#44), which comes first.

## The problem

Today (`server/src/bots.ts`, `server/src/prompt.ts`) a model bot gets a fresh prompt for each action: its view, the exits from its room, and a numbered list of affordable actions. It picks one and forgets it. So it can't follow through on anything longer than one step:

- **No memory.** "I should rest" one turn is gone the next.
- **No route.** The prompt lists only the current room's exits, though `view.rooms` already holds the whole (public) room graph. Planning a walk across 27 rooms, one model call per door, is unreliable and costs the player money (BYOK).
- **No coordination.** Some goals need another player. Repairing PILGRED alone loses `relayPenalty` per repair in a row (`shared/src/pilgred.ts`), so it needs someone else to repair in between; Terrence needs someone to push his wheelchair (`accommodate`).

## Decided

- **A fixed list of goals** (owner, 2026-10-25). The model chooses among goals the code defines; it never invents one. Code carries out the chosen goal.
- **Re-choose only on finish, failure or interrupt** (owner, 2026-10-25). One model call picks a goal; the goal then runs with no model calls until it finishes, fails, or an interrupt fires. This keeps the cost per cycle low.
- **Plans first** (owner, 2026-10-25). Coordination goes through the plan system, so #44's build steps 1–4 (registry additions with `shortestPath`, posting, claiming with locked AP, the executor) land before bot goals. No chat-based stopgap for relays.
- **Bot chat is fixed lines only, for now** (owner, 2026-10-25). Bots say only translated lines from a catalog (en/fr/es, through the `i18n` skill). Free-form model-written chat is a separate, later decision.
- **Goal memory is lost on restart** (owner, 2026-10-25). A bot's current goal lives in the `Bot` object's memory. If the Durable Object restarts, the bot just chooses again. Nothing about goals goes in game state, the record, storage, or a view.
- **Interrupts** (owner, 2026-10-25, for now): attacked or HP below a threshold; a chat message that names the bot; a new cycle. (A new plan or job was dropped after Gemini's second review: with one crew channel it would wake up to seven bots at once for one open job. Bots see open jobs whenever they next choose a goal.)
- **Scripted priority order** (owner, 2026-10-25, for now), used by bots without a key, which is every bot until the BYOK settings panel (#218) exists: eat if hungry; rest if low on AP or HP and a bed is reachable; claim an open job; work on the ship; explore; end the cycle. With the later additions the full order is: return to Sol, pick a skill, eat, ask for healing or morale, answer an ask, rest, claim a job, shower (only to unblock work), work, explore, end the cycle.
- **AP reserve: 2** (owner, 2026-10-25). Work goals stop when spending more would leave the bot under 2 AP, keeping it for emergencies. A config value.
- **No free-text notes** (owner, 2026-10-25). The model writes nothing for itself; chat could inject text into a note that then stays in every later prompt. A bot's memory is its current goal and its last failure. Richer memory is a later design.
- **Asking for healing or morale** (owner, 2026-10-25): a bot asks when HP or morale is 7 or less (config values, a default for now). In the scripted order the two asks come right after eat. A scripted bot can't read chat, so for now only the human or a model bot answers an ask; once plans exist, `askForHealing` can post the medic plan template instead, which any bot can claim.
- **After Gemini's review** (owner, 2026-10-25):
  - *Always ask for healing.* No self-healing goal: a hurt bot without a medikit asks, even though the sick bay heals without one.
  - *No wheelchair goals in the first pass.* A pusher can't know where Terrence wants to go; `pushWheelchair`, `askForPush` and their lines wait until bots can say where they're headed.
  - *Bots post only "run when filled" plans*, never timed ones, since single-player cycles don't follow the clock.
  - *One crew channel.* A player is in at most 3 private channels (`chat.ts`), and bot-only channels would leave the human out. The first bot that needs a channel for a plan creates one crew channel and invites everyone, the human included; every bot reuses it.
- **After Gemini's second review** (owner, 2026-10-25):
  - *Four more goals* so bots are competent crew: shower when dirty, pick skills, return to Sol, and answering asks for help (heal, Fiery speech). See the goal list.
  - *Bots clean up their own plans.* Before ending its cycle, a bot cancels any unfilled plan it posted and withdraws from jobs it can no longer afford, so its AP doesn't stay locked for cycles. No plan-rule change.
  - *Bots leave idle channels.* Invitations join without an accept step, so the Mush could fill a bot's three channel slots with empty channels. A bot that needs a slot for the crew channel leaves a channel with no plans in it.
- **The first goal list and the line catalog** below are accepted for a first pass (owner, 2026-10-25).
- **No framework.** LLM agent frameworks (Mastra and similar) coordinate by letting agents message each other directly or share a blackboard. That breaks the bot rule that a bot only ever receives its own seat's view, and in single player (the human is the only Mush) it would give the eight bots a perfect backchannel the human doesn't have. Bots coordinate only through what humans use: plans, channels, chat. If goals later share subgoals in tangled ways, game-AI structures (behavior trees, HTN) are the next step, hand-written or a small library (ask before adding one).

## Design

### Unchanged

Goals are an implementation detail inside a bot. Every action a goal returns is still checked against `legalIn(view)` and reaches the game through `GameRoom.act()` like any input, so the record and replays are unaffected (bot rule 9).

### What does change: bots send more than actions

`Bot.decideAction` returns an `Action`, and `chatLines` returns raw strings that `GameRoom.botChat` posts in global chat. Goals need more: posting, claiming and withdrawing plans are protocol inputs, not `Action`s in `view.actions`, and catalog lines must be translated. Two changes:

- **`decideAction` returns a bot input:** an `Action`, or one of the plan inputs (`postPlan`, `claimJob`, `withdrawJob`), or a catalog line. `GameRoom` sends each through the same validated path as a human's message (`parse*` in `protocol.ts`, then `act()`), so it is recorded and checked like a player's. Still never a `GameState`, and still checked: an action against `legalIn(view)`, a plan input by the plan rules.
- **Catalog lines are keyed, not text.** The server has no locale catalogs (`prompt.ts`), so a bot line can't be an English string. `ChatMessage` gets a field like the existing `system` one (`{ key, params }`), set only on bot messages, which each client translates. A bot line may go in global chat or a private channel the bot is in. `prompt.ts` shows such a message to model bots as its key and params, as it does log entries, since its `text` is empty.

### A goal

```ts
interface Goal {
  id: GoalId;                          // e.g. "rest", "repairPilgred", "claimJob"
  params: GoalParams;                  // filled from the view: a room, a bed, a plan job
  key: string;                         // id plus params, e.g. "rest:BEDROOM_A": what "done or failed this cycle" remembers
  label: string;                       // how the model's numbered list shows it (no player-written text unescaped)
  /** One action toward the goal, or what happened. Reads only the bot's own view and the goal's own progress. */
  step(view: PlayerView, progress: GoalProgress): GoalStep;
}
type GoalStep =
  | { kind: "act"; input: BotInput }   // an Action, a plan input, or a catalog line (above)
  | { kind: "wait" }                    // nothing to do until the next change (ends the cycle with `ready` when that is legal)
  | { kind: "done" }
  | { kind: "failed"; reason: FailReason };

interface GoalDef {
  id: GoalId;
  /** The concrete forms of this goal open to the bot now, e.g. "rest in the nearest bedroom". Empty when it doesn't apply. */
  options(view: PlayerView, memory: BotMemory): Goal[];
  /** Higher goes first for a bot without a key. The decided scripted order is these numbers, not a central if/else ladder. */
  priority(view: PlayerView, goal: Goal): number;
}
```

**Priority lives on each goal definition** (Gemini, 2026-10-25), so adding a goal means adding one file with its own number, not editing a list elsewhere. Ties break with the bot's seeded RNG.

**One affordability helper.** `canAfford(view, room, cost)` answers "can I get there and do this, keeping the 2 AP reserve?" for every goal: it counts travel along `shortestPath` (including the AP-to-MP conversion when MP runs out), subtracts locked AP, and counts free specialist points. Action costs for rooms the bot isn't in come from the public base config, since a view carries only the costs of actions open to it now.

**Keep options few.** A goal offers one or two options, not one per bed or room: `rest` offers the nearest bedroom, `explore` the one or two nearest rooms not visited this cycle. Options are also filtered by what the bot can afford with the 2 AP reserve kept (counting free specialist points, e.g. in `research.ts`, `project.ts`, `repair_pilgred.ts`). `endCycle` is offered only when nothing else is. So a bot out of spendable AP has one option and makes no model call (`ModelBot` already skips the call when there is one choice).

**Only what the bot could know.** A view shows items, equipment state and who is in bed only for the bot's own room (`viewFor`). Options elsewhere come from the public, fixed ship map (which rooms have beds, the dispenser, the sick bay), never from live state in another room; the goal checks `view.actions` on arrival and fails if the thing isn't there. `BotMemory` is what the bot saw itself (rooms visited this cycle, see below), since `viewFor` strips `you.history`.

Goals are pure (view and memory in, step out), so they are unit-tested without a server or a model, like `prompt.ts`. They live in `server/src/bots/goals/`, one file per goal, with a registry like `shared/src/actions.ts`.

### Building blocks

Most goals should be a few lines built from these:

- `goTo(room)`: the next `move` along `shortestPath(view.rooms, here, room)` (the function #44 step 1 adds to `shared`). Fails if no path exists or a door is refused.
- `use(action predicate)`: the matching action from `legalIn(view)`, or wait/fail.
- `take(itemType)`, `drop(itemType)`.
- `postPlan(template)`, `claimJob(plan, job)`: the plan protocol messages.
- `say(lineKey, params)`: a catalog line in a channel.

No goal sends `get_up`: any other action already gets a bot out of bed (`getUp` in `queue.ts`).

### How a bot runs goals

1. No goal: collect `options(view)` from every goal definition. A model bot gets a short numbered list (goal names and parameters, not raw actions) in its prompt and picks one; `parseChoice` stays the parser. A bot without a key uses the scripted priority order (Decided).
2. Each turn: `step` the current goal. `act` returns the input; `done` or `failed` clears the goal and goes back to 1; `wait` returns `ready` when legal, otherwise null.
3. An interrupt (Decided) clears the goal, so the next turn goes back to 1.
4. Guards: a goal that takes more than a set number of steps, or makes no progress across a cycle, fails. The existing free-action cap (`MODEL_FREE_ACTIONS_PER_CYCLE`) still applies to model calls.
5. **Refused inputs fail the goal.** `GameRoom` tells the bot when an input it sent was refused (by the rules, or the chat rate limit). The goal fails at once instead of being stepped again: instant inputs (plan messages, chat) don't start an action bar, so a refused one would otherwise be retried every scheduling tick.
6. **No loops.** Each goal (by its `key`) that finished or failed this cycle is left out of the options until the next cycle. Without this, a goal that fails without changing the view (no path) would be chosen again at once, forever, and two failing goals could alternate.

The bot's memory is fields on the `ModelBot` or scripted bot object, nowhere else: the current goal, the goals done or failed this cycle, and the rooms visited this cycle.

**Interrupt details.** The decided interrupts, made precise so they don't cost a model call per bot each time:
- *A chat message that names the bot:* messages the bot hasn't seen yet (it remembers the last message id), naming its character, from a human. Bot messages never interrupt, or one bot's line would cost another a call.
- *A new cycle:* not while `rest` is running (see its row), or a resting bot would get up after one cycle.

### Coordination through plans

- **Plan templates are goals.** `docs/action-plans.md` already makes templates the only auto-created jobs. Each template (a PILGRED relay; the medic template) is also a goal: "start a relay" posts that template in a channel the bot is in. One list serves the human UI and the bots.
- **Claiming is one generic goal.** `claimJob` has one option per open job the bot can see in its channels and can afford. It covers every kind of help without a goal per kind. Claiming locks the AP, and the goal is done at once; the executor runs the job later, and the bot carries on with other goals.
- **Bots treat plan text as untrusted**, as `docs/action-plans.md` Phase 6 says. Only the structured job (action, room, slot) drives a bot; any free text, channel names included, is quoted and escaped in the prompt like chat.
- **Humans and bots mix freely.** The human can claim a bot's relay job or post a plan a bot claims.

### First goal list

Solo, buildable as soon as `shortestPath` exists:

| Goal | Options | Done when |
| --- | --- | --- |
| `rest` | the nearest bedroom | lies down (`lie_down`), then waits (`ready`) cycle after cycle, not interrupted by a new cycle, until AP is full or another interrupt fires; its next action gets it up |
| `eat` | food in its room, or the dispenser | `consume` succeeded. The dispenser gives one coffee per cycle ship-wide (`dispense.ts`), so a bot that finds it empty fails and doesn't retry that cycle |
| `repairPilgred` | when PILGRED isn't finished | one repair (the next one alone gains less, `relayPenalty`; relays come with plans) |
| `repairHull` | when the hull is damaged and the bot carries a metal scrap or sees one in its room (`repair_hull.ts` needs one) | AP down to the 2 AP reserve, or no scrap left |
| `research` / `project` | each one the bot can work on, judged from the public list; research's lab requirements are checked only on arrival, since a view shows the lab's items only from inside it | AP down to the 2 AP reserve. Both refuse a dirty player (`research.ts`, `project.ts`) |
| `explore` | the one or two nearest rooms not visited this cycle | arrived |
| `askForHealing` | HP 7 or less, and the bot holds no medikit | asked (once per cycle at most) |
| `askForMorale` | morale 7 or less | asked (once per cycle at most) |
| `returnToSol` | PILGRED is repaired and the bot may return (the Commander, `return_to_sol.ts`) | returned; first in the scripted order, since it wins the game |
| `pickSkill` | a skill slot is open (`pick_skill`, free) | picked; second in the scripted order. Which skill: the scripted bot prefers ones that help its work goals (Engineer, Physicist), else a seeded random one |
| `shower` | the bot is dirty and a work goal it would otherwise choose refuses dirty players | showered (`shower.ts`); just before the work goals in the scripted order |
| `healSomeone` | a bot's `bot.askHealing` message this cycle, not yet answered, and this bot holds a medikit | walked to the asker's room and healed them, or the asker isn't there (fail) |
| `raiseMorale` | a bot's `bot.askMorale` message this cycle, not yet answered, and this bot is a Leader | walked to the asker's room and gave a Fiery speech |
| `endCycle` | only when nothing else is open; first cancels the bot's own unfilled plans and withdraws from jobs it can't afford | `ready` |

`healSomeone` and `raiseMorale` come right after the asks in the scripted order. They answer only bots: a bot line is a keyed message (see "What does change"), so a scripted bot can read it without understanding chat, while a human's free-text ask needs a model bot. Neither checks the asker's HP or morale, which are private; the ask itself is the signal. A Confident's chitchat isn't a responder goal, since the low-morale player is the one who starts it.

Needing plans (after #44 steps 1–4 and step 6, the server inputs, since bots send plan inputs through `GameRoom`):

| Goal | Options |
| --- | --- |
| `startRelay` | PILGRED only (research and projects have no repeat penalty yet, so relaying them gains nothing), as a "run when filled" plan in the crew channel (created if missing). Two jobs, the author's repair then a partner's; the author claims its own job right after posting, so one partner fills it |
| `claimJob` | one per open, affordable job the bot can see |

Suspicion, accusations and other social goals are left for later; they need their own design.

### Tests

- Each goal: the steps it returns for a hand-built view, including failure (no path, can't afford, the bed is taken).
- `shortestPath`: shortest route, no route, start equals goal (lands with #44 step 1).
- A bot with a goal makes no model call until the goal ends or an interrupt fires (a fake gate counts calls).
- Goal options and the goal prompt contain nothing outside the bot's view (the `bot` skill's leak test, and the `leak-check` skill).
- Only actions from `legalIn(view)` reach `act()`, including when a goal's step is stale.
- A goal that fails without changing the view isn't chosen again that cycle; two failing goals don't alternate.
- A bot with no spendable AP has only `endCycle` and makes no model call.
- A bot message never interrupts another bot.

### Line catalog (first pass)

Only goals speak, and each line belongs to one goal, said once when that goal reaches the step below. The model doesn't choose lines in the first pass. Lines go in the bot's channel for the goal (the plan's channel) or global chat, as keyed messages (see "What does change") translated through the `i18n` skill (en/fr/es), and carry `isBot` like all bot chat. `{…}` are parameters filled from the bot's view.

| Key | When | English |
| --- | --- | --- |
| `bot.relayPosted` | `startRelay` posted its plan | "I've posted a relay for {target}. Who can take turns with me?" |
| `bot.jobClaimed` | `claimJob` claimed a job | "I'll take step {step}." |
| `bot.jobWithdrawn` | a claimed job became unaffordable and the bot withdrew | "I can't make step {step} any more, sorry." |
| `bot.jobFailed` | the bot's job failed when the plan ran | "My part didn't work out, sorry." |
| `bot.resting` | `rest` lay down | "Resting for a bit in {room}." |
| `bot.askHealing` | `askForHealing` | "I'm hurt. Could someone with a medikit come to {room}?" |
| `bot.askMorale` | `askForMorale` | "I'm feeling pretty low. Could someone come lift my spirits? I'm in {room}." |

`bot.askMorale` names no skill on purpose: a Leader's Fiery speech, a Confident's chitchat and the Shrink all restore morale differently, and any of them should feel invited. `bot.askHealing` names the medikit because healing outside the sick bay needs one (`actions/heal.ts`).

Not in the first pass: answering questions ("where are you?"), accusations and reactions to events. They need the bot to understand chat, so they wait for the model to choose lines.

## Open questions

None for the first pass. Noted for `docs/action-plans.md` (#44), not this plan: plans run at a wall-clock time, but single-player cycles end when everyone has pressed End cycle (`manualCycles`), so a human's timed plan could be many cycles or none away.

## Build order

1. #44 steps 1–4 and 6 (`docs/action-plans.md`), including `shortestPath`. Only the solo goals' dependency is `shortestPath` (step 1); the plan goals also need the server inputs (step 6).
2. Goal interface, building blocks, the interrupts, and the solo goals, with the scripted priority order and the 2 AP reserve. Bots without a key use it.
3. Model goal choice: the goal list in the prompt replaces the raw action list; measure with `npm run model-trial` against today's prompt (#224).
4. `claimJob`, then `startRelay` and the other plan-template goals, alongside build step 9 (bots) in `docs/action-plans.md`.
5. Line catalog and `say`.
