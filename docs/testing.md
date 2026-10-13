# What to test, and why

The project's main risks, roughly in priority order: hidden information leaking to the wrong seat, untrusted input (clients, chat, and later model output) getting further than it should, rules that quietly break as features are added, and the game stalling. Tests should go where those risks are. This is a checklist, not a coverage target.

Status: **covered** = tests exist, **partial** = some exist, **missing** = none yet. Tests that need the Durable Object runtime would require `@cloudflare/vitest-pool-workers` (not installed; ask first). Most server risks can instead be tested by pulling the decision out into a pure function, as `server/src/rateLimit.ts` already does.

## 1. Hidden information (highest priority)

A leak can't be fixed after the fact: once a client has seen a role, the game is spoiled. Leaks also don't show up as bugs, since everything still looks fine on screen.

- **`viewFor` strips everything a seat shouldn't see:** other players' roles, HP, morale, and inventories; other rooms' items, equipment, and log history; private log entries; the RNG state. *Partial* (`rules.test.ts`, `items.test.ts`, `examine.test.ts`). Every new field on `GameState` or `PlayerView` needs a matching test. Worth adding one blunt test as well: build a game, serialize each seat's view, and assert that no other seat's hidden values appear anywhere in the string. That catches leaks through fields nobody thought to check.
- **Error messages don't depend on hidden state.** `applyAction` answers "Illegal action" whatever the reason. A message like "can't vote for a Mush" would leak a role through the error channel. Lock this in with a test before infection and voting arrive. *Missing.*
- **Each connection gets its own seat's view** (`GameRoom.broadcastViews`). A mix-up here (one view sent to everyone, or the wrong `playerId` in a connection's state) would leak everything, and no rules test would catch it. *Missing.*
- **Seat tokens.** A missing or unknown token is rejected (close code 4001). A valid token maps to exactly one seat. The matchmaker sends each human only their own token, never a broadcast. A token is effectively the seat itself, so whoever holds it can play that seat and see its view. *Missing.*
- **Bots see only their own seat's view.** This is structural today (`viewFor(game, botId)` in `scheduleBots`). Once model bots exist, also test that the prompt built for a seat contains nothing outside that seat's view (see the `bot` skill). *Missing.*

## 2. Untrusted input

Everything from a client is hostile until parsed. Player text will also become model input.

- **Wire parsers** (`parseGameMessage`, `parseMatchmakerMessage`): reject malformed JSON, wrong types, extra or unknown action kinds, and oversized strings, and never pass through fields that weren't validated. *Partial* (take/drop and examine are tested; move, ready, chat, and the matchmaker parser aren't). This would suit a small table of bad inputs.
- **Legality is the server's call.** `applyAction` rejects any action not in `legalActions(state, player)`, including well-formed actions for another player's item, a non-adjacent room, or a dead player. *Partial.*
- **Chat moderation** (`moderateChat`): invisible characters, links, masked words, length limits. *Covered* for the basics. Grow the cases as abuse turns up.
- **Player names** are trimmed and capped at 24 characters but not moderated, even though everyone sees them and they'll end up in bot prompts. Decide whether names go through `moderateChat`, then test that. *Missing.*
- **Rate limits:** the per-connection message limit, and a per-seat chat limit that survives reconnecting. `RateLimiter` is pure and takes `now` as a parameter, so it's easy to test. *Missing.*
- **Model output (later):** garbage, an action that isn't legal, or a prompt-injection attempt has to end up as a legal fallback action, never an unchecked one. *Not started.*

## 3. Rules correctness

The rules will grow the most (infection, voting, win conditions), and every addition can break an older rule.

- **Each rule's numbers** (AP/MP costs and caps, cycle gains, slot counts) against the confirmed values in `config.ts`. *Covered* for what exists.
- **Determinism:** the same seed and actions give the same state. Persistence and replays depend on it. *Partial* (`createGame` only). Add one test that replays a sequence of actions twice and compares the results.
- **Purity:** `applyAction` never mutates its input, and failed actions leave the state unchanged. *Covered.*
- **State survives a JSON round trip** (`JSON.parse(JSON.stringify(state))` deep-equals the original). State is persisted and cloned via JSON, so an accidental `Map`, `Set`, `Date`, or `undefined` would silently corrupt games. *Missing.*
- **Every legal action succeeds.** Anything in `legalActions` must be accepted by `applyAction`; the client and bots trust that list. *Partial.*
- **Invariants under random play:** run many seeded games with `WanderBot`-style random legal actions and check after every step that each item is in exactly one container, AP and MP stay within their caps, nobody is in a room that doesn't exist, and the game always offers someone a legal action. This catches combinations nobody wrote a test for. *Missing.*

## 4. The server keeps the game going

A stalled or wiped game is the most visible failure for players.

- **Persistence:** a restarted room restores the game, tokens, and bots. A save with a different `STATE_VERSION` is discarded, not loaded half-broken. *Missing.*
- **Bots never stall the game.** A bot isn't scheduled twice. A bot whose chosen action is illegal is logged and doesn't crash the room. A `decideAction` that throws or hangs needs a fallback. Today a rejected promise inside the `setTimeout` in `scheduleBots` is unhandled, and that bot only gets another turn when someone else acts. This matters most for model bots, which will time out. *Missing.*
- **Matchmaker:** a full queue starts immediately; the fill alarm starts a partial game with bots; extra players beyond one game roll into the next; queueing twice does nothing; leaving clears the alarm when the queue empties. *Missing.*

## 5. Data and tooling

- **Generated files are current:** `ship-layout.json` and `ship-rooms.json` match their sources. *Covered* (`tools`).
- **The ship map is sound:** every door goes both ways, and every room can be reached from the start room. *Covered.*
- **Converter edge cases:** unknown colors, mismatched doors, slices past their sheet. *Covered.*

## 6. Client

The client renders a view and sends intents, so there's little logic to unit test, and that's by design.

- **Pure layout math** (`placement.ts`: projection, paint order, standing spots, `fitScale`, `hitTest`). *Covered.*
- **`targets.ts`** (finding the selection in a view, `actionLabel`): pure and cheap to test. *Missing.*
- **Layouts, mobile, and touch** are checked with the `play` skill's desktop and 360px phone screenshot passes, not unit tests. The script already fails on sideways page scroll. The on-screen keyboard can only be checked on a real phone.
