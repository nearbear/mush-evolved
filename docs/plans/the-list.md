# THE List (plan)

2026-11-21. Decided by the owner (2026-10-25 on [#266](https://github.com/nearbear/mush2/issues/266), and 2026-11-21 in planning); not built. Builds on Finola's lost analysis ([#394](https://github.com/nearbear/mush2/issues/394)): the generic `document` item, `DocumentDialog`, and the `tear` action.

## Sources

- The original: `PRINT_ZE_LIST` in `Mush/derived/data/DataAction/actions.json` (0 AP, needs `HUNT`, tracked, not stealthy); `PRINTER` ("Tabulatrice") in `DataExt/objects.json`, placed in `COMMAND_CENTER` by `DataExt/daedalus_objects.json`. The frozen ship map has no tile for it; its only art is the item icon `Mush/www/img/icons/items/printer.jpg`.
- eMush (clean-room spec, `npm run emush -- spec tabulatrix`): `tabulatrix` is fixed bridge equipment, breakable, 12% repair and sabotage. Its code differs from the wiki: the list starts at the number of non-starting-Mush players, drops a name every 12 hours, and only names a living starting Mush. Reference only; the decisions below rule.
- eMushpedia: "LA Liste", "Enquêter" (8 names, one fewer per day, a certainty at one name, never Chun).

## Decisions

### The tabulator

- A new item type, `tabulator`, starting in `COMMAND_CENTER` (in the starting items, as the freezer is in the refectory).
- It **can't be taken** (so it never leaves the bridge), dropped, hidden or dismantled. Not heavy (moot, since it never moves).
- It can break, including in random cycle-change breakdowns (`canBreakOnCycleChange`), be sabotaged, and be repaired (`repairChance` 0.12, eMush's value).
- Names: Tabulator / Tabulatrice / Tabuladora. Icon: `printer.jpg` (through the `asset` skill).

### Printing

- Action `print_list`, 0 AP (from config), on a tabulator the player can reach.
- Only offered to a player with the Tracker skill (`hunt`), including Stephen through Apprentice. Hidden from everyone else.
- **Disabled with a reason** (not hidden) in each of these cases:
  - `mush_not_selected`: before Mush selection.
  - `list_printed`: the one print is spent (printed earlier, whether or not the list was torn since).
  - `BROKEN`: the tabulator is broken (the existing reason).
- One print per game, whoever prints first. Tearing the document (the existing `tear`) destroys it for good, and it can never be printed again.
- The document goes into the printer's hands, or onto the floor if their hands are full. Public room log: "X printed THE List."

### What the list says

- **Dead characters are never named.**
- **Size:** `max(1, 8 − whole days since Mush selection)`, capped at the names available. The clock starts at selection, as the rebel calls' does. The 8 is `config.theList.startNames`.
- **The guaranteed name,** the first of these that exists, picked at random within its group:
  1. A living starting Mush who isn't Chun.
  2. Any living Mush who isn't Chun (a later conversion).
  3. Chun, if Chun is a living Mush.
  4. Nobody: the document names no one and says no Mush are left aboard, worded like the existing log lines. That print still spends the one print.
- **Filler:** living crew other than Chun and the guaranteed name, drawn at random without replacement. The whole list is shuffled so the Mush's place says nothing.
- A one-name list reads as a certainty: "[Name] is infected by the Mush. It is a certainty."
- The printed list never changes afterwards (deaths, conversions and later days don't touch it).

## Build

### `shared`

1. **`items.ts`:** a `canTake?: boolean` flag on `ItemType`, and the `tabulator` type with `canTake: false, canDrop: false, canHide: false, canBreak: true, canBreakOnCycleChange: true, canBeSabotaged: true, repairChance: 0.12` and no `dismantle`. Check `canTake` in `take` (`actions/transfer.ts`: left out of the candidates) and `tube_transfer`; check other movers (`search`, the Schrödinger and expedition moves) don't apply to it.
2. **Starting items** (`config.ts`): `{ type: "tabulator", room: "COMMAND_CENTER" }`.
3. **`theList.ts`** (new): `TheListState` on `GameState.theList`, never in any view:
   - `rng`: its own stream, `streamFor(seed, "the-list")`, so printing moves no other roll.
   - `startingMush: CharacterId[]` and `selectedAt: number | null`, set at selection (next to `rollAtSelection`, from `selectMush` and `createGame`).
   - `printed: boolean`.

   Pure functions: `listSize(state)`, `guaranteedName(state)`, `rollList(state)`.
4. **`types.ts`:** a `DocumentState` variant `{ kind: "the_list"; characters: CharacterId[] }` (empty means "no Mush left").
5. **`actions/print_list.ts`:** the action as above. Its entries in `ACTIONS`, the reasons in `UNAFFORDABLE_REASONS`, and `config.theList.cost`.
6. **`normalizeState.ts`:** `added(raw, "theList", ...)` for games in progress: starting Mush from current Mush roles, `selectedAt` from the first rebel call's `arrivedAt`, `printed` false. A `the_list` case in the document normalizer. No `STATE_VERSION` bump. Running ships get no tabulator (the databases are empty, so that's acceptable).

### `web`

- `DocumentDialog` shows the new kind (the list, the certainty, the "no Mush left" text).
- `ACTION_NAME_KEYS`, the item name and description, the log line, the disabled reasons and the document text in en/fr/es (`i18n` skill).
- On phones: the tabulator is a room item, so its actions are in the Inspect panel and the peek bar through `optionsOn`. Nothing new.

### Tests (`shared/tests/theList.test.ts`)

- Pinned numbers: 8 names, 0 AP, 0.12 repair.
- Size: per day since selection, the floor of 1, the cap at living names.
- The guaranteed name through each fallback (1 to 4), dead never named, Chun only at step 3, no duplicates, seeded and repeatable.
- Disabled before selection, after a print, and after a tear; broken tabulator; hidden without `hunt`; Stephen through Apprentice.
- The tabulator can't be taken, dropped, hidden or dismantled; it can break at a cycle change and be repaired.
- Leaks: `theList` listed in `leakFields.ts` with a sentinel; a holder's view shows only the names; other seats gain nothing.
- `SAMPLES` in `protocol.test.ts` and the document variant in the normalizer round trip.

### Checks and docs

- `leak-check` skill; bots never print (single player is out of scope); `npm run verify` and `npm run build`.
- `implemented-rules.md`, `rules-design.md` (these decisions), `changes-from-emush.md` (the tabulator is an item, the list can name a converted Mush or Chun, filler is living crew only, the "no Mush left" print, 8 names and one a day), the code-map, `docs/README.md`, the ai-workflow log, and [#266](https://github.com/nearbear/mush2/issues/266).
