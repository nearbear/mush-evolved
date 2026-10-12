---
name: rule
description: Add or change a game rule (actions, costs, visibility, win conditions, anything in shared/src/rules.ts). Enforces this project's loop - resolve every ambiguity with the user first, implement as pure code in shared, test it including hidden-information checks, verify end to end, and log the decision. Use whenever a request would change what players can do or see.
---

# Add or change a game rule

The rules are the core of the game and the place where hidden information can leak. Follow these steps in order.

## 1. Pin down the rule before writing code

CLAUDE.md: **do not invent game rules.** Before coding, list every question the request leaves open and ask them in **one** AskUserQuestion call (at most 4 questions, with concrete options). Typical gaps:

- **Numbers:** costs, caps, starting values, and whether they reset each cycle.
- **Who can do it:** which role, alive or dead, which room, any target requirements.
- **Who sees it:** public room history, private to the actor, or secret (witnessed). See the log helpers below.
- **Edge cases:** not enough AP/MP, the target leaves, the game is over.

Check `docs/plan.md` first, since it lists open rule questions and may already have the answer. The original game's values are in `Mush/data/*.ods` and `Mush/src/common/Gameplay.hx`. Use them as suggestions to offer, never as decisions.

Skip a question only if the user's message, CLAUDE.md, or `docs/plan.md` already answers it.

## 2. Implement in `shared`, purely

- `shared/src/rules.ts` and the modules next to it. No I/O, no clocks, no `Math.random`; randomness goes through the seeded RNG in state.
- State must stay plain JSON (it's persisted and cloned with JSON).
- **Numbers that items or skills might change** go through the modifier registry in `shared/src/modifiers.ts`: add a hook type to `Modifier`, fold it like `movementRules`, and compute the result in one function (like `moveCost`). Don't hard-code a value that the user says can vary.
- **Log entries:** use `logPublic(state, room, text)` (the room's history), `logPrivate(state, actor, text)` (only the actor ever sees it), or `logSecret(state, actor, text)` (room history only if another living player is in the room). Never push to `state.log` directly.
- **Legality:** new actions go in the `Action` union, `legalActions`, `applyAction`, and `parseGameMessage` in `protocol.ts`, which validates untrusted client input. Free-form input like chat is not an `Action`: give it its own rules function, and have the server moderate it first.
- If `GameState`'s shape changes, bump `STATE_VERSION` in `server/src/GameRoom.ts`.

## 3. Test it

In `shared/src/*.test.ts`:

- The happy path, each limit or edge case from step 1, and "illegal action leaves state unchanged".
- **Hidden information:** whenever `PlayerView` or the log changes, extend the `viewFor` tests to show that other players' roles, other rooms' history, and private entries do not appear in anyone else's view. This is the project's most important architecture rule.
- Run: `source ~/.nvm/nvm.sh && npm test && npm run typecheck`.

## 4. Check it end to end

- If the client needs to show something new, add it to `PlayerView` in `viewFor` (the only place hidden info is stripped), then render it. Components never compute legality; they use `view.legalActions`.
- Make sure `WanderBot` (`shared/src/bots.ts`) still acts legally.
- If there's a UI change, run the `play` skill and look at the screenshots.

## 5. Record it

- `CLAUDE.md`: update the "Implemented rules" paragraph (and "Open decisions" if one was settled).
- `docs/plan.md`: mark answered questions as answered, with the date.
- `docs/ai-workflow.md`: a dated entry with the decision, who decided it, what worked, and anything that needed correction.
