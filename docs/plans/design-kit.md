# Design kit

Status: done, 2026-11-07 (every component in the plan is in the kit). Not a rules plan; nothing here changes the game.

The dev-only page `/design-kit-mush2` (`web/src/designKit/Mush2Kit.tsx`, `mush2Kit.css`) shows our own components with
sample props, so each one can be checked in isolation (desktop and the 360px phone width) without playing to the state
that shows it. Every section renders the **real** component from `web/src`, never a copy. Sample text is English only;
the page never ships and the i18n hardcoded-text test skips it.

## In the kit now

Every component the plan listed is in the kit, either with its own section or inside a bigger one (2026-11-07). A piece
that already shows inside a composite gets no section of its own (the pip bar is in AP and MP and the Self HUD), so each
look is checked once, in the context it has in the game. Sections live in `Mush2Kit.tsx` (the first four),
`HudSections.tsx`, `GameSections.tsx` and `LobbySections.tsx`; `KitSection.tsx` has the frames, `samples.ts` the views.

| Section | Component | Also shows |
|---|---|---|
| Ship card | `games/ShipCard.tsx` | |
| Terminal frame | `hud/TerminalFrame.tsx` | `TabOutline` (`"cut"`) |
| Terminals | `TerminalBody` (exported from `hud/TerminalDialog.tsx` for this), one per terminal | research/project lists, PILGRED, `PlanetList` → `SharePlanetDialog`, `CommandTerminal` (`ShipNavigation`, `UnavailableButton`, `ConfirmPanel`), `CommsCenter`, `BiosTerminal`, `TurretPanel` (`HunterList`), `RelayDetails`, `ActionButton`, `ActionLabel` |
| Top bar | `hud/TopBar.tsx` | `CycleCountdown`, `ShipResources`, `TitleChip`, `PreselectionTag`, `BotsPausedTag`, `PlayerSummary` (phone), `SettingsDialog` (gear; `DialogHeader`, `TabOutline` `"round"`, `IconButton`, account settings, `Credits`) |
| Self HUD | `hud/SelfHud.tsx` (`SelfHud`) | `PlayerSummary`, `ResourceChips`, `StatInfo` |
| AP and MP | `SelfPoints` | `PipBar` (horizontal and vertical, partial, empty, wrapped) |
| Ship card (phone) | `hud/ShipOverlay.tsx` | `ShipResources`, `Hint` |
| Inspect | `hud/InspectPanel.tsx`: you (human, Mush), someone else, equipment, an item | `SkillSlots`/`SkillPopover`/`ConfirmPanel`, `StatusIcons`, `ItemFace`, `ActionButton` (enabled and unaffordable) |
| Inventory | `hud/InventoryOverlay.tsx` | `InventoryPanel`, `ItemIcon`, `ConsumeEffects`, heavy items |
| Queue and tips | `hud/ActionQueue.tsx`, `hud/TipCard.tsx` | |
| Peek bar | `hud/PeekBar.tsx` (phone CSS only: visible below 1024px) | |
| Status icons | `hud/StatusIcons.tsx`: every status plus contamination, a catalog for spotting missing art | `StatusIcon` |
| Patrol | `hud/PatrolCockpit.tsx` | `HunterList` |
| iTrackie | `hud/ITrackie.tsx` | `FeedEntry` and markers, `CycleDivider`, `RecencyStamp`, `ExpeditionReportDialog` (from the room log), `Thread`/`MessageEntry`, `Markdown` checklists, `ChatInput`, `Threads`, `SharedPlanets`, `ResearchTracker`, `PrivateChannels`, `IconTab` badges, `TabOutline` |
| Death and end | `hud/DeathNotice.tsx`, `hud/BodyTakenDialog.tsx`, `hud/EndScreen.tsx` (dialogs behind buttons) | `DialogHeader` |
| Character picker | `lobby/CharacterPicker.tsx` | `SkillPopover` |
| Account | `account/AccountButton.tsx` | `AccountDetails`, `NameForm` (its buttons call the real API) |

Skipped: `Announcer`, `Credits` (standalone), `Scroller`, `Tracker`, `BottomNav`, `RoomList` (visually hidden),
`FeatureSelect` (in the iTrackie), `TabOutline`'s `outlinePath` (a function, already tested), and `ItemAttrIcons`,
which nothing in `web/src` uses. Not reached yet: a planted hydropot (`PlantStates`), a hacked or broken item, chat in
the Mush channel and private channels with messages, hunters in sight.

Found while building it (not fixed here): a Base UI console warning that `EntryTip`'s popover trigger in
`TerminalDialog.tsx` is not a native `<button>`, and the Astro terminal's `.planet-title` overflows its frame at 360px.

## The PlayerView fixture

`web/src/designKit/sampleView.ts`, tested in `web/tests/designKit/sampleView.test.ts`.
`sampleState({ role, character })` is a launched 16-seat ship (fixed seed, 2 Mush, the kit seat `p0` forced to `role`,
Jin Su by default); helpers return a new state: `act` (any action through `applyAction`), `pickSkills`, `giveItems`
(`produceItem`), `spend` (AP/MP) and `giveTitle` (the last two edit the state directly, as the rules tests do);
`sampleView(state)` is `viewFor` for `p0`. It does not use the cheats. Build views once at module level, not per render.

Later helpers (2026-11-07): `queue` (through `queueAction`), `moveTo`/`moveToEquipment`, `givePlanet`, `say` and
`thread` (the chat rules), `share` (`sharePlanet`), `kill` (`killPlayer`), `bodyTaken` (the flag only), `ended`
(`endGame`), and `sampleState({ preselection: true })`. The kit's views are built in `samples.ts`; its test checks each
reaches the state its section shows.

Narrowing a component's props (as `ShipResources` does) instead of passing the whole view is an alternative to the
fixture for the small ones; it also helps re-render cost. Do it only where it reads naturally, not just for the kit.

## Conventions for new sections

- One `<section id>` per component, linked from the header nav; a short paragraph naming the file and what each prop
  variant shows; `<figure>`s in `.m2k-row` with a `<figcaption>`.
- Real components only, imported from `web/src`. If a component cannot render outside the game, make it pure first
  (as with `TerminalFrame`), not a kit-only copy.
- Check every section at desktop and 360px (no horizontal scroll); the kit's terminal shots used a small Playwright
  script against `/design-kit-mush2`.
