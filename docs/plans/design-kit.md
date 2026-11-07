# Design kit: what to add next

Status: handoff, 2026-11-07. Not a rules plan; nothing here changes the game.

The dev-only page `/design-kit-mush2` (`web/src/designKit/Mush2Kit.tsx`, `mush2Kit.css`) shows our own components with
sample props, so each one can be checked in isolation (desktop and the 360px phone width) without playing to the state
that shows it. Every section renders the **real** component from `web/src`, never a copy. Sample text is English only;
the page never ships and the i18n hardcoded-text test skips it.

## In the kit now

| Section | Component | Notes |
|---|---|---|
| Ship card | `games/ShipCard.tsx` | Link and plain variants. |
| Terminal | `hud/TerminalFrame.tsx` | Added 2026-11-07. No tabs / tabbed / hacked login. Sits in a stand-in `.m2k-terminal.terminal-popup.kit-panel`, since the real popup (`.settings-popup`) is `position: fixed`. |

The terminal frame was split out of the old `TerminalShell` to make it pure: it takes `name`, `type` (icon and corner
art), `login` (`{ user, access }`), `onClose`, an optional `titleId`, and the body. It renders a plain `<h2>` and close
`<button>` instead of Base UI's `Dialog.Title`/`Dialog.Close`, so it needs no dialog context; `TerminalDialog` passes
`aria-labelledby={titleId}` to its popup (Base UI lets an explicit prop win). The login logic moved to
`terminalLogin(type, view)` in `hud/terminalUsername.ts`, with tests. The frame also owns its `TabOutline` and imports
`terminal.css`/`settings.css` itself.

## Ready now (plain props, no `PlayerView`)

Each can be added with sample props alone. Suggested order: the first three are the game's look; the rest are quick.

| Priority | Component | What to show |
|---|---|---|
| 1 | `hud/PipBar.tsx` | AP/MP/health/morale: horizontal and `vertical`, `thin`, `bigIcon`, empty/partial/full, a value change (the wipe animation). |
| 1 | `hud/TabOutline.tsx` + `styles/cut-card.css` | The iTrackie's shape: `shape="round"` with a Base UI tab list over a `.cut-card` (the terminal already covers `"cut"`). Needs a `.kit-panel` parent with `--pad`, like the terminal stand-in. |
| 1 | `hud/IconButton.tsx` | `IconButton`, `IconTab` with and without `badge`, `Hint` tooltip. |
| 2 | `hud/DialogHeader.tsx`, `hud/ConfirmPanel.tsx` | Dialog chrome. `ConfirmPanel` takes `open`; show it open inline or behind a button. |
| 2 | `hud/FeedEntry.tsx` (`FeedEntry`, `InfoMarker`, `WarningMarker`, `CrewAvatar`), `hud/CycleDivider.tsx` | Log and chat line building blocks; one row per marker. |
| 2 | `hud/StatusIcons.tsx` (`StatusIcons`, `StatusIcon`) | Every status in one row, plus contamination; a quick way to spot missing art. |
| 2 | `hud/TitleChip.tsx`, `hud/BotsPausedTag.tsx`, `hud/PreselectionTag.tsx` | Tags and chips. `TitleChip` takes a `TitleView`, a small plain object. |
| 3 | `hud/ItemAttrIcons.tsx`, `hud/PlantStates.tsx`, `hud/ItemFace.tsx`, `hud/ConsumeEffects.tsx` | Item details. `PlantStates` takes `ItemView["plant"]`, a small object. |
| 3 | `hud/RecencyStamp.tsx`, `hud/CycleCountdown.tsx` | Time displays. Both read the clock: pass timestamps relative to `Date.now()`; the countdown ticks. |
| 3 | `hud/ChatInput.tsx`, `hud/Markdown.tsx` | Enabled and disabled input; markdown with checkboxes. |
| 3 | `hud/ActionLabel.tsx` | Has its own test; check its props before adding. |
| 3 | `hud/ExpeditionReportDialog.tsx`, `hud/SharePlanetDialog.tsx`, `hud/SettingsDialog.tsx` | Whole dialogs on plain props. They render in a portal over the page; open them from a button in the section. |
| 3 | `lobby/CharacterPicker.tsx` | `taken` and `onBoard` only. |
| 3 | `account/AccountButton.tsx`, `account/NameForm.tsx`, `account/AccountDetails.tsx` | Account UI. Check none of them fetch on mount before adding. |

Skip: `Announcer`, `Credits`, `Scroller`, `Tracker`, `BottomNav` (no look of their own, or layout plumbing), and
`TabOutline`'s `outlinePath` (a function, already tested).

## Needs a `PlayerView` fixture

These take the whole view (or `PlayerView` parts) and are what a player sees most, so they are worth the fixture.

**Fixture recommendation:** build it from the real rules, not by hand: `createGame(...)` then `viewFor(state, id)` from
`@mush2/shared`, which is pure and runs in the browser. A hand-written `PlayerView` would drift every time the type
changes; this one cannot. Put it in `web/src/designKit/sampleView.ts`, with small helpers that apply a state change
through the rules (spend AP, give a title, add an item) before taking the view. Open question: whether the kit may use
the `cheats` helpers to reach states quickly; they are test-deployment only in the game, but the kit never ships.

| Component | Notes |
|---|---|
| `hud/TopBar.tsx`, `hud/SelfHud.tsx` (`SelfHud`, `SelfPoints`), `hud/PlayerSummary.tsx` | The HUD. Show human and Mush. |
| `hud/ShipResources.tsx` | Already narrowed: takes `ship`, `hunters`, `titles`, `orbit`. Could go in now with a hand-made `ship` slice. |
| `hud/ResourceChips.tsx` (`CompactResourceChips`), `hud/StatInfo.tsx` | Stat chips and their popovers. |
| `hud/SkillSlots.tsx` (`SkillSlots`, `SkillPopover`) | Empty, partial and full slots. |
| `hud/InventoryPanel.tsx`, `hud/InventoryOverlay.tsx`, `hud/ItemIcon.tsx` | Inventory: empty slots (`.kit-slot.big`), heavy items, plants. |
| `hud/ActionButton.tsx` (`ActionButton`, `DisabledActionButton`), `hud/CommandTerminal.tsx`'s `UnavailableButton` | Enabled, blocked, unaffordable. `UnavailableButton` is plain props already. |
| `hud/ActionQueue.tsx`, `hud/PeekBar.tsx`, `hud/TipCard.tsx`, `hud/DeathNotice.tsx`, `hud/BodyTakenDialog.tsx`, `hud/EndScreen.tsx` | Smaller pieces and end states. |
| Terminal bodies: `ResearchList`/`ProjectList`/`PilgredRepair` (in `TerminalDialog.tsx`), `PlanetList`, `CommsCenter`, `BiosTerminal`, `TurretPanel`, `CommandTerminal`, `ShipNavigation`, `HunterList`, `PatrolCockpit`, `RelayDetails`, `ResearchTracker` | Each inside a `TerminalFrame` with a real `EquipmentView` from the fixture. |
| `hud/ITrackie.tsx`, `hud/Thread.tsx` (`Thread`, `MessageEntry`), `hud/Threads.tsx`, `hud/PrivateChannels.tsx`, `hud/SharedPlanets.tsx` | Chat. Needs a fixture with chat lines; the heaviest to set up, so last. |
| `hud/InspectPanel.tsx`, `hud/RoomList.tsx`, `hud/ShipOverlay.tsx` | Room and ship panels. |

Narrowing a component's props (as `ShipResources` does) instead of passing the whole view is an alternative to the
fixture for the small ones; it also helps re-render cost. Do it only where it reads naturally, not just for the kit.

## Conventions for new sections

- One `<section id>` per component, linked from the header nav; a short paragraph naming the file and what each prop
  variant shows; `<figure>`s in `.m2k-row` with a `<figcaption>`.
- Real components only, imported from `web/src`. If a component cannot render outside the game, make it pure first
  (as with `TerminalFrame`), not a kit-only copy.
- Check every section at desktop and 360px (no horizontal scroll); the kit's terminal shots used a small Playwright
  script against `/design-kit-mush2`.
