# Action code cleanup: handoff plan

Written 2026-10-25 from a planning session (Claude Opus 5.5, reviewed twice by Gemini `gemini-4-argon-high`). **Nothing here is started.** Line numbers drift; grep for the names instead.

## Why

Two inputs:

1. **A code-cleanliness review** of `shared/src/actions/` (10 findings: casts, duplicated helpers, dead code). Checked against the code on 2026-10-25; most still hold.
2. **Feedback from a collaborator:** "I try to change something that feels like it should be a one file change. Then it turns out there are several other files that require a change… action.ts, target.ts, protocal.ts, and names.ts. All contain lists of every action."

The second is the more important. The oxygen-capsule commit (62a1448) added two simple actions and had to edit **6 lists of action types**, on top of the action files, tests, config, locales and docs:

| List | If forgotten | Status |
|---|---|---|
| `shared/src/types.ts`: the `Action` union | typecheck fails | open: **Step 1** |
| `shared/src/actions.ts`: the `ACTIONS` registry | typecheck fails | keep (the one source of truth) |
| `shared/src/protocol.ts`: client-message parsing | **silent**: the server drops the action | open: **Step 3** |
| `shared/src/actionTarget.ts`: player-targeted types | **silent**: no walk-up, a push isn't ended | open: **Step 4** |
| `web/src/hud/targets.ts`: `aimedAt` switch | **silent**: the button never shows | open: **Step 4** |
| `web/src/hud/targets.ts`: `ACTION_LABEL_KEYS` | silent | **done** (1001823, now uses `names.action`) |
| `web/src/i18n/names.ts`: `ACTION_NAME_KEYS` | typecheck fails (`satisfies Record<…>`) | keep (compiler-checked, and translations need it) |

The silent lists already caused a real bug: `vaccinate` was missing from `actionTarget.ts`. That bug is fixed (046e10f), but the list is still there to be forgotten again.

**Goal:** a new action edits the action file plus 2 lists (`ACTIONS` and `ACTION_NAME_KEYS`), both checked by the compiler. Config, the three locale files, tests and docs are still needed; that's inherent.

## Constraints

- A pure refactor: **behaviour must not change** and existing tests must pass as they are, unless a step says otherwise.
- Small commits on `main`. Typecheck and the relevant tests per commit; full `npm test` and `npm run typecheck` at the end.
- No new dependencies (so no zod; the field schema in Step 3 is hand-rolled).
- `moduleLoad.test.ts` guards against import cycles; type-only imports (`import type` / `export type`) are erased and don't count.

## Steps, in order

### Step 1: build the `Action` union from `ACTIONS` (spike first)

Today `types.ts` holds a hand-written union, and each action file also declares its own `XyzActionData`. Make `actions.ts` the source:

```ts
export const ACTIONS = { ready: new ReadyAction(), ... } satisfies { [K in ActionType]: ActionDef<ActionOf<K>> };
export type ActionType = keyof typeof ACTIONS;
export type Action = ReturnType<(typeof ACTIONS)[ActionType]["candidates"]>[number];
```

…and `types.ts` re-exports it with `export type { Action } from "./actions.ts"`.

- Gemini says this has no circularity, because every subclass's `getCandidates` already returns its literal `XyzActionData[]` (including `new TransferAction("take")` and `new ShareAction("dtt")`). **This is unverified; test it first.** Look for "circularly references itself" errors, and check that `ActionOf<"take">` still narrows.
- **Fallback if it fails:** move the explicit `MoveActionData | TakeActionData | …` list from `types.ts` into `actions.ts`, beside the registry. Still a list, but in the same file as the registry.
- **Do not** constrain the base class as `Action<T extends AnyAction>` (an earlier draft did): that ties each class to the hand-written union and fights this step. After this step, the `target as unknown as AnyAction` casts in `action.ts` may go away on their own. If not, keep the single justified cast with its comment.
- Where `ShareAction`/`TransferAction` are generic, keep them as `Action<{ type: T; target: string }>`, not `Action<ActionOf<T>>`. TypeScript can't resolve `Extract<…, { type: T }>` while `T` is unresolved, so a cast would still be needed (Gemini, review 1).

### Step 2: base-class cleanup (review findings 1–2)

Done before Step 3 so each action file is edited once.

- `actions/action.ts`: delete `baseAPCost`, `baseMPCost`, `baseSuccessChance` (no subclass sets them); the defaults become literals (`{ ap: 0, mp: 0 }`, `1`). Add `: number` return types to `dirtChanceMods` and `injuryChanceMods`.
- Delete the 10 `getCost() { return { ap: 0, mp: 0 }; }` overrides (examine, check_combustion, consume, ready, access, lie_down, set_bios, dispense, and two in accommodate), and the 2 empty `apply(): void {}` overrides (access, lie_down's GetUp).
- `actions.ts` `ActionDef`: make `chance`, `dirtChanceMods`, `injuryChanceMods` and `fail` required (the base class always has them); remove the `?.` / `?? 1` / `?? 0` fallbacks in `rules.ts` (`legalActions`-area code, `applyAction`, the view's action options) and in `tests/history.test.ts`.
- **Keep the `candidates()` → `getCandidates()` forwarder.** The rename across ~60 files was dropped as churn with no gain (Gemini agreed). Keep method syntax on `ActionDef` (it relies on method bivariance for `ActionDef<Action>` in `rules.ts` and `queue.ts`).

### Step 3: field schemas and a generic `protocol.ts`

`protocol.ts` parses untrusted client JSON with about 60 hand-written `if` statements. Replace them with a schema per action:

- The base `Action<T>` gets a `fields` map from each non-`type` key to a validator `(v: unknown) => boolean` (`isString`, `isBoolean`, and the existing `isBiosOption`, `isSkill`/`isMushSkill`, a turn-side check). Type it so the compiler **requires** it when `Exclude<keyof T, "type">` is non-empty.
- The base `parse(raw)` builds a **fresh** `{ type: this.type, … }` copying only the keys in `fields`, the same stripping today's code does. This matters: extra client fields must never reach `PlayerState.queue` or replay records.
- Override `parse` only for the shapes a flat schema can't express: `dismantle` (`item` **or** `equipment`), `attack` (`target` optional), `examine` (nested `target`).
- In `protocol.ts`: `typeof a.type === "string" && Object.hasOwn(ACTIONS, a.type) ? ACTIONS[a.type].parse(a) : null`. **`Object.hasOwn` is required**: a plain `ACTIONS[a.type]` finds `"constructor"` and `"toString"`.
- A schema beats a free-form `parse` method per class: hand-written `parse` methods invite `return raw as T`.
- **Test:** for every action type, a round trip (each `candidates()` result parses back to an equal object), plus rejection of an unknown type, a prototype key, a wrong field type, and extra fields being stripped. Then run the `leak-check` skill and review carefully: this is the server's boundary for untrusted input.

### Step 4: generic `actionTarget` and `aimedAt`

- **`shared/src/actionTarget.ts`:** replace the player-type list with the action's shape. Gemini's version:
  ```ts
  if ("target" in a) return typeof a.target === "string" ? { kind: "player", id: a.target } : a.target;
  ```
  The order of checks matters for `attack` (`weapon` plus an optional `target`) and `examine` (`target` is a `Target` object). `stop_accommodation` has a `target`: check whether walking to it is intended (today it returns null). `endsAccommodation` excludes the accommodation actions explicitly, so a push isn't affected; the walk-up in `web/src/iso/useActingOn.ts` might be. If it changes behaviour, keep a one-line exception.
- **`web/src/hud/targets.ts` `aimedAt`:** becomes `sameTarget(actionTarget(a), target)`, except:
  1. Actions with no fields besides `type` (extract_spore, get_up, search, self_disease, fiery_speech, boring_speech; not `ready`) aim at yourself.
  2. Actions done inside a terminal window (`web/src/hud/TerminalDialog.tsx`, about 16 now that `delete_planet` has an `equipment` field, c5a4c31) don't show on the inspect panel. Add a `terminal = true` field on those action classes (a domain fact, like `timed`), read through `ACTIONS` the way `actionVisibility` already is.
  3. `take`, `drop` and `ready` don't show (the inventory panel handles take and drop).
- Check the result against today's switch for every action type: write a temporary test that compares old and new over all `candidates()` before deleting the old one.

### Step 5: helpers (review findings 3, 4, 5, 8, 9, 10)

- `equipmentHere` moves from `actions/take_fuel.ts` to `equipment.ts`. Use it in place of `research.ts` `labs()` and `project.ts` `cores()`.
- `dayOf` moves from `rules.ts` to `helpers.ts`, with `rules.ts` re-exporting it so callers don't change. Delete the copies in `actions/share.ts` (which also computes an unused `cycleOfDay`) and the inline formula in `actions/scan_planet.ts`.
- `bond.ts` and `share.ts` use `peopleHere` (4 inline copies). Delete the commented-out `who.morale` line in share.
- **Capsules:** a new `actions/capsule.ts` holding `carriedCapsule(state, player, itemType)` and `combustionLevel`, used by take/return fuel, take/return oxygen, load/unload fuel and check_combustion. **Keep the files separate.** A parameterized class was rejected: fuel and oxygen differ in 7 places (type, equipment, item, ship field, max, config key, error and log keys), and a lookup table makes those harder to grep.
- **Items:** `items.ts` gets `removeItem(state, id): ItemState` and a new-item-ID helper (replacing inline `` `item-${state.nextItemId++}` `` in dismantle, research and build). Use `itemsIn(state, { kind: "player", id })` for carried items (`install.ts` `carriedCameras`, `jettison.ts` `carriedCorpses`, `sow.ts`). **Keep `TransferAction.apply`'s splice-then-push**: it moves the item to the end of `state.items`, and the order is visible.
- **Cooking:** `cook.ts` and `express_cook.ts` share a `cookable(state, player, item)` predicate and the transform (`item.type = …cook.into; delete item.spores`). Leave `read_book.validate` alone (it returns 4 different error codes in a fixed order, and its checks deliberately differ from `getCandidates`). Treat `sow` the same way.
- Remove the unused `state` parameter from `paidWithComputer` in research and project. No shared helper (`comp > 0` is too small to be worth one, and project also accepts Designer points).

### Step 6: document what a new action needs

Update `.claude/skills/rule/SKILL.md` (and `docs/code-map/shared.md` if it lists them) with the exact files a new action still touches after Steps 1–4: the action file, the `ACTIONS` entry, `ACTION_NAME_KEYS`, config, the en/fr/es locales, tests and docs.

Append a short entry to `docs/ai-workflow.md` with `cat >>` (never rewrite it).

## Dropped, with reasons

- **Renaming `getCandidates` to `candidates`:** churn across about 60 files and noisy `git blame` for no type or runtime gain.
- **Moving move's affordability check out of `validate`** (review finding 6): the move price can have negative MP (converting AP gives MP). Without the check in `validate`, a modifier that lowers the AP could let a player with 0 AP move and *gain* MP, and `mpCap < mpPerMove` is an impossible move, not an unaffordable one. Instead, consider a comment on `MoveAction.validate` saying why it checks the price itself.
- **Replacing `ACTION_NAME_KEYS` with a camelCase convention:** all 70 names follow it, but the map is compiler-checked. If someone does this later, add a test in `tools/tests/i18n/i18n.test.ts` that every `ActionType` except `ready` has an `en.actions.<camelCase>` key.

## Open question for the owner

- `UnloadFuelAction` has no injury chance; take, return and load fuel all have `config.fuel.injuryChance`. Is that intended? (Not a cleanup; don't change it without an answer.)

## Already done elsewhere (2026-10-25)

- 046e10f: `vaccinate` added to `actionTarget.ts` (walks up and ends a push).
- 1001823: `ACTION_LABEL_KEYS` deleted; the inspect panel and peek bar use `names.action`.
- c5a4c31: `delete_planet` limited to the Astro terminal (it now has an `equipment` field; the TODO is gone).
