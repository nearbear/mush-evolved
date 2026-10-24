---
name: leak-check
context: fork
description: Review the current changes for hidden-information leaks - anything that could send a player (or a bot) data their seat shouldn't have, like other players' roles, private stats, other rooms' history, or private log entries. Use after any change to viewFor, PlayerView or OtherPlayerView, the log, protocol.ts, GameRoom.ts, Matchmaker.ts, or bot prompts, and when asked to check for leaks or security of game state.
---

# Check for hidden-information leaks

Architecture rule 1: the server holds the real state and each client gets only its own `PlayerView`. A leak here breaks the game (a social deduction game where you can read roles off the wire is over). This is a focused review, not a general bug hunt; use `/code-review` for that.

## 1. Scope the diff

```bash
git diff HEAD --stat
git diff HEAD -- shared/src/types.ts shared/src/rules.ts shared/src/protocol.ts server/src
```

Include staged and untracked files (`git status --short`). If nothing in the list below changed, say so and stop.

## 2. Walk every path data takes off the server

For each, check what's sent and to whom:

| Path | What to check |
|---|---|
| `viewFor` (`shared/src/rules.ts`) | The only place hidden info is stripped. `you` is the viewer's full `PlayerState`; `players` must list fields **explicitly** (never spread a `PlayerState`). New `PlayerState` fields are private by default; anything added to `OtherPlayerView` needs a reason. |
| Log | Entries filtered by `visibleTo` and room. New entries use `logPublic`/`logPrivate`/`logSecret`, never `state.log.push`. Check text doesn't embed secrets (e.g. "X infected Y" logged publicly). |
| Chat | Channels filtered by `chatChannels`. No role-only channel readable by others. |
| `GameRoom.ts` | Every `send`/`broadcast` sends `viewFor(game, thatConnectionsSeat)`. Nothing sends `GameState`, `this.game`, `tokens`, or another seat's view. Errors don't echo state. |
| `Matchmaker.ts` | Seat tokens go only to their owner. Nothing reveals roles (they're assigned in `createGame`, after matchmaking). |
| `protocol.ts` | Every client message goes through a `parse*` validator; a client can't name another seat or ask for another view. |
| Bots | `decideAction` receives the bot's own `viewFor`. Prompts are built from the view only. |
| Persistence / logs | `console.log`/`warn` don't print state that ends up somewhere public. |

Also look for indirect leaks: legal actions that reveal hidden state (e.g. an action only offered when the target is Mush), timing or counts that reveal a role, and IDs or ordering that encode the RNG. A room effect (`roomActionCost` in modifiers.ts) shows up in the actor's prices, so its holder must be someone the actor can already see; an effect from a hidden source would leak through the cost.

## 3. Prove it with tests

Start with `shared/tests/leaks.test.ts`, which gives every hidden value in a game a unique sentinel and checks that each one appears only in the views allowed to have it (and does appear there, so the check isn't vacuous). A new field on `GameState`, `PlayerState` (or `Seat`), or `ItemState` fails the tests until it is listed in `shared/tests/leakFields.ts` with who may see it and the test that checks it (`tools/tests/leaks/fields.test.ts` reads the interfaces, so optional fields count too). If its value can be made unique, add a sentinel to `ship()` in `leaks.test.ts`; if not (a role, an enum, a player id), write a targeted test in the feature's test file and name that file in `leakFields.ts`. Targeted tests can use the same trick: serialize the view and count occurrences:

```ts
const json = JSON.stringify(viewFor(state, s.id));
expect(json.match(/"hp"/g)).toHaveLength(1); // only the viewer's own
```

Add a test for each new hidden field or log kind if one is missing, then run `npm test` (a single file or test while iterating: `npm test -w shared -- <file> -t "<name>"`).

## 4. Report

List each path from step 2 you checked with a one-line verdict, then any leak found with file:line, what leaks to whom, and a fix. If you added tests, say which. If `agy` is available (see "External tools" in CLAUDE.md), also give it the diff and this checklist, and report any leak it finds that you missed (after verifying it). Don't fix design-level questions (e.g. "should Mush see each other?") yourself; those are rules, so ask the user.
