# House cleaning, 2026-10-21

Remaining items from a code-cleanliness and abstraction review. Done already: the starfield type error, the
read_book lint/typecheck errors, the ITrackie split, and (commit 6394aa3) the `validate` template method, dead
`visibleTargets`/`examineEvent`, the heal.ts commented block, and the `getUp` re-export.

## Failing tests

- `shared/tests/jettison.test.ts` ("defaults to 0 AP in the four bays") expects the jettison config without
  `dirtyChance`; commit 7ff8793 added `dirtyChance: 0.25`. Update the test, or drop the field if jettison shouldn't
  have a dirt chance.
- `tools/tests/i18n/i18n.test.ts` (two "hardcoded English text" tests) fails after the ITrackie split. Either the
  new files have hardcoded strings to move to `t()`, or the baseline needs updating to the new file names.

## Abstraction

1. **Two action abstractions.** The `ActionDef` interface (`shared/src/actions.ts`) and the `Action` base class
   (`shared/src/actions/action.ts`). The class name clashes with the `Action` union type, so `action.ts` imports
   it as `AnyAction` and needs an `as unknown as` cast in `cost()`. The class also has pass-through pairs
   (`candidates`/`getCandidates`, `chance`/`getSuccessChance`). Suggestion: keep the class, rename it (e.g.
   `ActionRule`), drop the wrappers, and decide whether `ActionDef` is still needed or just `ActionRule<A>`.
   Worth planning first: it touches every action file and the rule skill.
2. **Dirt rule inline in `performAction`** (`shared/src/rules.ts`, the `dirtyChance > 0` block). The game loop
   knows about aprons and Stickler, and the block's formatting is uneven (`){`, `else{`). Suggestion: a
   `rollDirt(next, actor, chance)` in `statuses.ts` (or a `dirt.ts`), so new protections are added there.
3. **`viewFor` is ~120 lines.** Pull the per-other-player block out as `otherPlayerView(state, you, o, present,
   located)`. The leak-sensitive part becomes one small function to review, and the leak tests can target it.
4. **`legalOptions` and `unaffordableActions` duplicate building an `ActionOption`,** and `viewFor` runs every
   action's `candidates()` twice (once through `legalActions`, once through `unaffordableActions`). Suggestion: one
   pass over candidates that splits them into legal and `cant_afford`, sharing one `optionFor(def, state, p, a,
   lacks)`. `legalActions` stays for bots and the queue.

## Duplication

5. **Lookups by id.** `state.players.find((p) => p.id === x)` appears ~24 times beside 27 uses of `findPlayer`;
   `state.items.find((i) => i.id === x)` ~14 times; "is this player carrying an item of type X"
   (`itemsIn(state, { kind: "player", id: p.id }).some((i) => i.type === ...)`) 4 times (heal, rules.ts dirt,
   …). Suggestion: `findItem(state, id)` in `helpers.ts` and `carries(state, p, type)` in `items.ts`.
   (`findPlayer` takes a non-Readonly `GameState`; loosening it to `Readonly` would let the action `validate`
   methods use it.)
6. **Cheat setters** (`setCheat`, `setRoleCheat`, `setActopiCheat` in `rules.ts`) each repeat find, clone, find,
   mutate. A `withPlayer(state, id, (next, p) => …)` helper makes each one line.
7. **Cheat message types listed three times in `server/src/GameRoom.ts`**: the `cheatsAllowed` guard and the
   `act` branch in `onMessage`, and the `Exclude<…>` in `social()`'s signature. Suggestion: a `CHEAT_MESSAGES`
   const set (or a type guard in `protocol.ts`) used in all three. Also, `GameRoom` does
   `this.game.players.find((p) => p.id === playerId)` in three places where `findPlayer` would do.

## Large files

8. **`web/src/iso/placement.ts` (1195 lines)** holds two jobs: paint order and occlusion (`placeRoom` through
   `entityPass`, ~line 910) and walking (`walkableCells`, `spreadActors`, `cellAtPoint`, `standSpot`, `walkPath`,
   `doorSpot`, `doorPassage`, `neighborRooms`). Splitting at that seam into `paintOrder.ts` and `walking.ts` is
   mostly moves; `hitTest` and `bounds` could go with paint order or in a small `geometry.ts`.
9. **`CHAT_PREVIEW = false`** (now in `web/src/hud/ChatInput.tsx`) keeps a disabled preview toggle in the code.
   Delete it, or keep it with its TODO if the preview is coming back soon.

## Suggested order

Quick: 9, 7, 6. Small refactors that make rules harder to get wrong: 2, 5. Plan first: 1, 3, 4. 8 whenever
you're next in `placement.ts`.
