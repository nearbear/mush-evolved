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

Check `docs/todo.md` ("Open rule decisions") and `docs/rules-design.md` ("Decisions received") first, since they may already have the answer. Don't read them whole: `grep -n -i "<keyword>" docs/todo.md docs/rules-design.md`, then read only the matching lines. The original game's values are in `Mush/data/*.ods` and `Mush/src/common/Gameplay.hx`; grep for the specific constant instead of opening them. Use them as suggestions to offer, never as decisions.

Skip a question only if the user's message, CLAUDE.md, `docs/todo.md`, or `docs/rules-design.md` already answers it.

## 2. Implement in `shared`, purely

- Don't read `rules.ts` whole. Find where things live in `docs/code-map.md` (or grep for `legalActions`, `applyAction`, `logPublic`, etc.) and read only those ranges. Open `modifiers.ts` and `protocol.ts` only when a step below needs them.
- `shared/src/rules.ts` and the modules next to it. No I/O, no clocks, no `Math.random`; randomness goes through the seeded RNG in state.
- New player-visible text (log lines, action labels, errors) goes through the `i18n` skill: don't hard-code English strings.
- State must stay plain JSON (it's persisted and cloned with JSON).
- **Numbers that items or skills might change** go through the modifier registry in `shared/src/modifiers.ts`: add a hook type to `Modifier`, fold it like `movementRules`, and compute the result in one function (like `moveCost`). Don't hard-code a value that the user says can vary.
- **Log entries:** use `logPublic(state, room, text)` (the room's history), `logPrivate(state, actor, text)` (only the actor ever sees it), or `logSecret(state, actor, text)` (room history only if another living player is in the room). Never push to `state.log` directly.
- **Legality:** new actions go in the `Action` union, `legalActions`, `applyAction`, and `parseGameMessage` in `protocol.ts`, which validates untrusted client input. Free-form input like chat is not an `Action`: give it its own rules function, and have the server moderate it first.
- If `GameState`'s shape changes, bump `STATE_VERSION` in `server/src/GameRoom.ts`.

## 3. Test it

In `shared/src/*.test.ts`:

- The happy path, each limit or edge case from step 1, and "illegal action leaves state unchanged".
- **Hidden information:** whenever `PlayerView` or the log changes, extend the `viewFor` tests to show that other players' roles, other rooms' history, and private entries do not appear in anyone else's view. This is the project's most important architecture rule.
- While iterating, run only what you need: `source ~/.nvm/nvm.sh && npm test -w shared -- rules.test.ts -t "name"`. Run the full `npm test && npm run typecheck` once, at the end.

## 4. Check it end to end

- If the client needs to show something new, add it to `PlayerView` in `viewFor` (the only place hidden info is stripped), then render it. Components never compute legality; they use `view.legalActions`.
- Make sure `WanderBot` (`server/src/bots.ts`) still acts legally.
- The action must be reachable on a phone too. Actions aimed at a target go through `actionsOn` in `web/src/hud/targets.ts`, so they appear in both the Inspect panel and the phone peek bar; give them a label in `ACTION_LABELS` there. Anything else needs a deliberate place in the phone layout (never hover- or double-click-only).
- For a UI change, mention that the `play` skill is available; run it only if the user asks.

## 5. Record it

- `docs/code-map.md`: update the "Implemented rules" paragraph. In `CLAUDE.md`, update "Open decisions" only if one was settled.
- `docs/todo.md`: tick the answered item under "Open rule decisions" and note the answer and date; add the decision to "Decisions received" in `docs/rules-design.md`. Grep for the line and use `Edit`; don't re-read the files.
- `docs/ai-workflow.md`: a dated entry with the decision, who decided it, what worked, and anything that needed correction. Only ever append with `cat >>`, and never read the file first (it is large); do not rewrite existing entries.
