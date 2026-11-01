# Lethargy (plan)

2026-11-01. Decided with the owner on 2026-11-01 (answers below). The Web section is built (`PipBar` columns, `SelfPoints`); the rules (`shared`), tests, docs and the screenshot check are not. Lethargy is already a pickable skill with no effect (`shared/src/skills.ts`, Chun's list; see `docs/rules/rules-design.md`, "Character skill lists"). It also shows in the bot duties (`server/src/bots/duties.ts`, "waits"), which nothing reads yet.

## Source

eMushpedia, *Léthargie* (a source, not a decision):

- If you stay lying down for at least 4 cycles, you gain 1 extra AP per cycle. The bonus is lost if you get up, for any reason. Getting up, acting, and lying down again in the same cycle restarts the count.
- The maximum capacity of your AP gauge is doubled (24 AP).
- Worked example: lying down at 0 AP in cycle 1 and never getting up gives 8 AP at cycle 5 (+2 a cycle: base and bed), then +3 a cycle: 11 at cycle 6, 14 at cycle 7, and so on, up to the cap.
- The wiki marks the skill as lost for Mush.

## Decisions (owner, 2026-11-01)

1. **Timing:** as on the wiki. The +1 AP applies from the 5th cycle change spent lying down. Any getting up resets the count, including getting up and lying down again in the same cycle.
2. **Becoming Mush:** Lethargy is kept, like every other skill on conversion today (`infection.ts`). A general rule for losing skills on conversion would be a separate decision.
3. **Inactivity:** the "AP full while away" check uses the player's own `maxAp`, not `config.maxAp`. A Lethargy player counts as full at 24, and a cap lowered by disease also counts correctly.
4. **Feedback:** nothing beyond the extra AP: no log line, no new HUD field. The skill description already explains the effect.
5. **Desktop AP bar:** past 12 slots, the AP gauge becomes two columns of 12 side by side, so it stays as tall as the MP gauge (see "Web").

## Rules (`shared`)

- **State:** `PlayerState.lyingSince?: number`, the `state.cycle` the player lay down in. `LieDownAction.apply` sets it. `getUp()` (`actions/lie_down.ts`) deletes it, which covers every way out of a bed: `get_up`, any other timed action (`performAction`, `queue.ts`), a broken or dismantled bed (`breakage.ts`), summons (`summon.ts`), and `accommodate.ts`. The state stores the starting cycle instead of a counter, so nothing has to change at each cycle change.
  - This changes the state's shape: bump `STATE_VERSION` in `server/src/GameRoom.ts` (101 → 102 when written; this ends every live game) and refresh `server/tests/state-shape.json` with `UPDATE_STATE_SHAPE=1 npm test -w server -- stateShape.test.ts`.
- **Config:** `lethargy: { cyclesLying: 4, bonusAp: 1, maxApMultiplier: 2 }` in `shared/src/config.ts` and `types/config.ts`. A config knob needs no version bump.
- **Modifier `shared/src/modifiers/lethargy.ts`**, registered in `MODIFIERS` (`modifiers.ts`):
  - `maxAp: (base) => base * maxApMultiplier`.
  - `apPerCycle: (gain) => gain + bonusAp` while the player is lying down and `state.cycle - lyingSince >= cyclesLying`. The refill reads the cycle before it advances; check this against the wiki example in a test and adjust the comparison if it's off by one.
  - `onPick: updateMaxValues(next, player)`, so the cap doubles as soon as the skill is picked, including when it comes from a skill book.
- `SKILL_STATUS.lethargy = "full"` (`skills.ts`).
- **Inactivity:** in `shared/src/inactivity.ts:54`, change `p.ap < state.config.maxAp` to `p.ap < p.maxAp`.
- **Hidden information:** `lyingSince` stays server-only. `viewFor` doesn't send it. List it in `shared/tests/leakFields.ts` (reach: nobody) with a sentinel in `leaks.test.ts`. The doubled cap already reaches its owner through `view.maxAp`. `OtherPlayerView` doesn't carry `maxAp`.

## Web (built 2026-11-01)

Built, but not yet checked in a browser: nothing gives a player 24 AP until the rule exists.

- **`PipBar` (`web/src/hud/PipBar.tsx`)** gets a `columns` prop, for vertical bars only. The slots split into columns of `ceil(slots / columns)`, drawn side by side, each a complete frame (start cap, slots, end cap). Filling goes bottom to top in the first column, then the second. The wipe animation follows the same order: the clip's position along the whole run maps to a column and a height. Each column fades its shades over its own length, so both look like the original gauge.
- **`SelfPoints` (`web/src/hud/SelfHud.tsx`)** passes `columns={view.maxAp > 12 ? 2 : 1}` to the AP bar. The 12 is the single-column height (the MP gauge's) and should be a named constant, not a literal. The value under the bar stays a single number.
- **Phones:** nothing changes. AP is an icon and a number in `PlayerSummary`.
- **AP help text** (`stat.info.ap` in en/fr/es): it already uses `{{maxAp}}`, so it shows 24 for a Lethargy player. No new strings. Optionally mention Lethargy's bonus in the lying-down line (the `i18n` skill).
- **Check:** take a desktop screenshot of the bottom-left HUD with Lethargy and 24 AP: two columns, as tall as MP, filling bottom to top. Also check the phone layout with the `play` skill.

## Tests

`shared/tests/lethargy.test.ts`:

- The config numbers, pinned once: `[cyclesLying, bonusAp, maxApMultiplier]` equals `[4, 1, 2]`.
- The wiki's sequence: lie down at 0 AP, then 8 AP after 4 cycle changes, then +3 a cycle.
- The cap is reached at 24, never passed, and doubles straight away when the skill is picked.
- Getting up resets the count: through `get_up`, another action, getting up and lying down again in the same cycle, a broken bed, and a summon.
- No bonus without the skill, and none for a Lethargy player who isn't lying down.
- The inactivity check uses the player's own cap.
- `lyingSince` doesn't leak (`leaks.test.ts`).

## Docs and bots

- `docs/rules/implemented-rules.md`: a Lethargy bullet. `docs/rules/rules-design.md`: the decisions above, under "Decisions received". `docs/code-map/shared.md` and `web.md`: the new modifier, and the `PipBar` columns.
- Bots: nothing needed for the rule. The duty in `duties.ts` (stay in bed) waits for bot goals (`bot-goals.md`).
- `docs/process/ai-workflow.md`: one entry, appended at the end of the task.
