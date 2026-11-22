# Hacker Kit Implementation Plan

Status: **done, closed 2026-11-17.** Built (rules in `docs/rules/implemented-rules.md`, tests in `shared/tests/hack.test.ts` and `web/tests/hud/terminalUsername.test.ts`); the in-dialog `hack` `ActionButton` in Section 5 is **won't do** (owner, 2026-11-17).

## Decided Rules

1. **Item (`hacker_kit`)**
   - Spawns in the Center Corridor (`CORRIDOR_B`) at game start.
   - Must be carried in the player's inventory and working (`!item.broken`) to use `hack`.
   - Breakable, sabotagable, overload-breakable (`breaksInOverload: true`), repairable (`repairChance: 0.06`, matching `oscilloscope` / `DataExt.ods` `rep: 16`), and cannot be dismantled (no `dismantle` field).
2. **`hack` action**
   - Targets any working, enabled title-locked terminal (`PILOT_MODULE`, `COM_CENTER`, `NERON_BIOS_TERM`) in the player's room when the player does not already have access via title, skill, cheat, or an active hack. Works both when another player holds the title and when the title is vacant.
   - Costs **2 AP**, or **1 Computer point** (`resources.comp > 0` → `{ ap: 0, mp: 0, paidBy: "comp" }`).
   - Base success chance **25%** (`0.25`), **1.25×** failure streak (`config.failureMultiplier`), doubled (**×2**, to 50% base) by the **Computer Scientist** (`computer`) skill.
   - **Private** visibility (`visibility = "private"`, `logPrivate` on success and failure).
   - A successful hack grants access to that terminal **until the hacker leaves the room** (even if they close and reopen the terminal window).

---

## 1. Item, Config & Translations (`shared`)

- **`shared/src/items.ts`**
  - Export `HACKER_KIT_ITEM = "hacker_kit"`.
  - Add `[HACKER_KIT_ITEM]: { canBreak: true, canBeSabotaged: true, repairChance: 0.06, breaksInOverload: true }` to `ITEM_TYPES`.
- **`shared/src/types/config.ts` & `shared/src/config.ts`**
  - Add `hack: { cost: { ap: number }; successChance: number; computerFactor: number }` to `GameConfig` and `DEFAULT_CONFIG` (`{ cost: { ap: 2 }, successChance: 0.25, computerFactor: 2 }`).
  - Add `{ type: HACKER_KIT_ITEM, room: "CORRIDOR_B" }` to `DEFAULT_CONFIG.startItems`.
- **Locale names (`shared/src/locales/names.{en,fr,es}.json`)**
  - Add `items.hacker_kit`:
    - `en`: `"Hacker kit"`
    - `fr`: `"Bidouilleur"` (from `Mush/data/DataExt.ods`)
    - `es`: `"Kit de hacker"` (matches existing `web/src/locales/es.json` `"Kit de hacker activado..."`)
  - Add `actions.hack`:
    - `en`: `"Hack"`
    - `fr`: `"Forcer l'accès"` (from `Mush/data/DataAction.ods`)
    - `es`: `"Hackear"` (draft — flag for native speaker review)

---

## 2. State, Normalization, Transfer & Death (`shared`)

- **`shared/src/types/player.ts`**
  - Add `hackedEquipment?: string[]` to `PlayerState` (equipment IDs currently hacked in `player.room`).
  - Stays on `YouView` (not omitted in `shared/src/rules.ts` `seatViewFor`), and is **never** copied onto `OtherPlayerView`.
- **`shared/src/normalizeState.ts`**
  - In `normalizePlayer`, add `hackedEquipment: opt(raw.hackedEquipment, copy)` (`added`-style optional array copy; no `STATE_VERSION` bump required).
- **Clearing active hacks:**
  - **`shared/src/actions/move.ts`**: clear `delete player.hackedEquipment` in `MoveAction.apply` when the player changes rooms.
  - **`shared/src/death.ts`**: clear `delete player.hackedEquipment` in `killPlayer`.
  - **`shared/src/mind.ts`**: clear `delete a.hackedEquipment; delete b.hackedEquipment` in `swapMinds` (a body transfer shouldn't silently carry an active terminal hack across minds).
  - **`shared/src/breakage.ts`**: in `breakEquipment`, strip `equipment.id` from players' `hackedEquipment` (deleting the field when empty) so a broken-and-repaired terminal must be hacked again.
  - **`shared/src/rules.ts`**: in `toCheatRoom`, clear `delete p.hackedEquipment` when teleporting out of a room.

---

## 3. Title Access & Computer Scientist Modifier (`shared`)

- **`shared/src/titles.ts`**
  - Add `isHackedEquipment(state, player, equipmentId)` helper or check in `hasTitleAccess(state, p, title)`:
    - Keep `bypassesTitles(p, title)` for player-only bypasses (`freeHacking` cheat and `neron_access` for `neron_admin`), which only depend on `Pick<PlayerState, "cheats" | "skills" | "bookSkill" | "mushSkills">`.
    - Extend `hasTitleAccess(state, p, title)` so it also returns `true` when `p.hackedEquipment` includes a working, enabled equipment in `p.room` whose `EQUIPMENT_TYPES[e.type]?.title === title`.
    - Add a helper `hasHackedEquipment(p: Readonly<Pick<PlayerState, "hackedEquipment">>, equipmentId: string): boolean` for the client login banner (`terminalUsername.ts`).
- **`shared/src/modifiers/computer.ts`**
  - Add `actionSucessRate: (chance, { action, state }) => (action.type === "hack" ? chance * state.config.hack.computerFactor : chance)` to the `computer` modifier (25% → 50%; capped at 99% by `actionSuccessRate` in `shared/src/modifiers.ts`).
  - Update the file's header comment to note that Computer points pay for `hack` and the skill doubles `hack` odds.

---

## 4. `HackAction` (`shared/src/actions/hack.ts` & `shared/src/actions.ts`)

- Create `shared/src/actions/hack.ts` exporting `HackActionData = { type: "hack"; equipment: string }` and `HackAction`:
  - `visibility = "private"`
  - `terminal = false` (so it appears on the terminal's Inspect panel & mobile peek bar via `optionsOn`, and we also surface it inside locked terminal dialogs in `web`).
  - `getCandidates(state, player)`:
    - Return `[]` unless player carries a working `hacker_kit` (`itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === HACKER_KIT_ITEM && isWorking(i))`).
    - Return `{ type: "hack", equipment: eq.id }` for each equipment in `state.equipment[player.room]` where `!eq.broken`, `isEquipmentEnabled(state, eq)`, `EQUIPMENT_TYPES[eq.type]?.title` is defined, and `!hasTitleAccess(state, player, title)`.
  - `validate(state, player, target)`:
    - Check working carried `hacker_kit` (`"no_hacker_kit"`).
    - Find equipment in `state.equipment[player.room]`; check exists, `!broken`, `isEquipmentEnabled`, and has `title` (`"cant_hack"`).
    - Check `!hasTitleAccess(state, player, title)` (`"already_has_access"`).
  - `getCost(state, player)`:
    - `player.resources.comp > 0 ? { ap: 0, mp: 0, paidBy: "comp" } : { ap: state.config.hack.cost.ap, mp: 0 }`.
  - `getSuccessChance(state)`: `state.config.hack.successChance` (`0.25`).
  - `apply(state, player, target)`:
    - Push `target.equipment` onto `player.hackedEquipment ??= []` if absent.
    - `logPrivate(state, player.id, "hackedTerminal", { equipment: eq.type })`.
  - `fail(state, player, target)`:
    - `logPrivate(state, player.id, "hackFailed", { equipment: eq.type })`.
- Register `hack: new HackAction()` in `REGISTRY` in `shared/src/actions.ts`.

---

## 5. Client UI & Locales (`web`)

- **`web/src/art/assets.ts`**
  - No code change needed (`itemIcons` already globs `Mush/www/img/icons/items/*.jpg`, which includes `hacker_kit.jpg`).
- **`web/src/i18n/names.ts`**
  - Add `hack: "actions.hack"` to `ACTION_NAME_KEYS`.
- **`web/src/hud/terminalUsername.ts`**
  - Update `terminalLogin(type, view, equipmentId?)` (or pass `terminal: EquipmentView` / look up `view.roomEquipment` matching `type`):
    - Check `const hasHack = bypassesTitles(view.you, title) || view.roomEquipment.some((e) => e.type === type && view.you.hackedEquipment?.includes(e.id));`
    - Allow `"hacked"` when `holder !== mine && hasHack` **including when `holder == null` (vacant)**! When `holder == null`, pass `user = terminalUsername(mine)` (or an existing character/login string) so `terminal.login.hacked` renders cleanly instead of `"limited"`.
- **Terminal Windows (`web/src/hud/CommandTerminal.tsx`, `CommsCenter.tsx`, `BiosTerminal.tsx`)**
  - **Won't do (2026-11-17):** When the player lacks access to the terminal, offer the `hack` `ActionButton` (if `view.actions` contains `{ type: "hack", equipment: terminal.id }`) right inside the locked terminal dialog alongside the Inspect panel button, so clicking the terminal directly also exposes **Hack**.
  - Update the read-only helper text (`commander` / `officer` / `bios.adminOnly`) so hacked players don't see `"Only the Comms Officer can..."` or `"Commander only"` when they have unlocked the terminal via `hack` (e.g., check `hasHack` / `login.access !== "limited"` or whether actions are offered in `view.actions`).
- **Log messages (`web/src/locales/{en,fr,es}.json`)**
  - Add `logs.hackedTerminal` and `logs.hackFailed` in `en.json`, `fr.json`, and `es.json` (plus check `web/tests/` for any log-key coverage tests).

---

## 6. Tests, Leak Check & Docs

- **`shared/tests/protocol.test.ts`**: add `{ type: "hack", equipment: "COMMAND_CENTER:PILOT_MODULE" }` to `SAMPLES`.
- **`shared/tests/leakFields.ts` & `shared/tests/leaks.test.ts`**:
  - Document `hackedEquipment` in `PLAYER_STATE_FIELDS` (`reach: "own"`, tested in `hacker_kit.test.ts`).
  - Verify `hackedEquipment` and private hack log lines never appear in any other seat's `PlayerView` or `OtherPlayerView`.
- **`shared/tests/hacker_kit.test.ts`** (new test file):
  - Pin config numbers (`2 AP`, `25%`, `2×` Computer Scientist factor, `CORRIDOR_B` spawn).
  - Test hacking each of the 3 title-locked terminals (`PILOT_MODULE`, `COM_CENTER`, `NERON_BIOS_TERM`), both when held by someone else and when vacant.
  - Test gaining access to title-locked actions (`return_to_sol`, `turn_ship`, `travel`, `decode_rebel`, `set_bios`), closing & reopening (`access`) in the same room keeping access, and losing access upon leaving the room, breaking the terminal, dying, or mind transfer.
  - Test Computer Scientist (`computer`): spending `resources.comp` (0 AP, `paidBy: "comp"`), doubled base chance (`50%`), failure streak multiplier (`1.25×`), and failure leaving access locked.
  - Test item rules: must be carried (floor doesn't count), broken kit cannot hack, can be sabotaged/repaired/broken in overload, cannot be dismantled, and rejected when already holding access/title.
- **`web/tests/hud/terminalUsername.test.ts`**:
  - Update/add cases for `hackedEquipment` (including vacant title `holder: null`).
- **`tools/i18n` & `npm run verify` & `npm run build`**:
  - Run `npm test -w tools -- i18n`, `npm run verify`, and `npm run build`.
- **Docs**:
  - Record decision in `docs/rules/rules-design.md`, implementation bullet in `docs/rules/implemented-rules.md`, new file in `docs/code-map/shared.md`, and append one entry to `docs/process/ai-workflow.md`.
