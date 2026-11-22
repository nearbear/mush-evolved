# Design kit

Status: done, 2026-11-07 (every component in the plan is in the kit). Not a rules plan; nothing here changes the game.

The dev-only kit at `/design-kit-mush2` (`web/src/designKit/Mush2Kit.tsx`, `mush2Kit.css`) shows our own components with
sample props, so each one can be checked in isolation (desktop and the 360px phone width) without playing to the state
that shows it. Each component has its own page, `/design-kit-mush2/<id>` (the section's id), listed in a side nav by
group; below 1024px the nav is a drawer opened by the menu button in the header (2026-11-19).

Pages for game-screen pieces (`game: true` in `Mush2Kit.tsx`'s `GROUPS`) render inside `main.game`, so `card.css`'s
game-screen card look applies as in play; terminal and lobby pages don't, since the game shows those outside it.
Components that fill a whole panel (Inspect, the patrol cockpit, the expedition screen, the iTrackie, the death notice)
sit in `GameFrame.tsx`: the game's own layout (top bar, Inspect | room | iTrackie, the real bottom nav on phones) with
skeleton blocks for every part the page doesn't show, so each is seen against the rest of the screen. Every section renders the **real** component from `web/src`, never a copy. Sample text is English only;
the page never ships and the i18n hardcoded-text test skips it.

## In the kit now

Every component the plan listed is in the kit, either with its own section or inside a bigger one (2026-11-07). A piece
that already shows inside a composite gets no section of its own (the pip bar is in AP and MP and the Self HUD), so each
look is checked once, in the context it has in the game. Sections live in `CoreSections.tsx`, `GameScreenSection.tsx`,
`PrimitivesSection.tsx`, `HudSections.tsx`, `GameSections.tsx` and `LobbySections.tsx`; `KitSection.tsx` has the frames,
`GameFrame.tsx` the skeleton screen, `samples.ts` the views.

| Section | Component | Also shows |
|---|---|---|
| Game screen | `designKit/GameScreenSection.tsx`: the whole screen in `GameFrame`, every panel real except the room scene; the chrome is `tokens.css`'s Dusk ramp and `card.css` | `TopBar`, `InspectPanel`, `SelfHud` (`ShipOverlay` on phones), `ITrackie`, `BottomNav` |
| Ship card | `games/ShipCard.tsx` | |
| Terminal frame | `hud/TerminalFrame.tsx` | `TabOutline` (`"cut"`) |
| Terminals | `TerminalBody` (exported from `hud/TerminalDialog.tsx` for this), one per terminal, and the turret again with hunters | research/project lists, PILGRED, `PlanetList` → `SharePlanetForm`, `CommandTerminal` (`ShipNavigation`, `UnavailableButton`, `ConfirmPanel`), `CommsCenter`, `BiosTerminal`, `TurretPanel` (`HunterList`), `RelayDetails`, `ActionButton`, `ActionLabel` |
| Top bar | `hud/TopBar.tsx` | `CycleCountdown`, `ShipResources`, `TitleChip`, `PreselectionTag`, `BotsPausedTag`, `PlayerSummary` (phone), `SettingsDialog` (gear; `DialogHeader`, `TabOutline` `"round"`, `IconButton`, account settings, `Credits`) |
| Self HUD | `hud/SelfHud.tsx` (`SelfHud`) | `PlayerSummary`, `ResourceChips`, `StatInfo` |
| Ship card (phone) | `hud/ShipOverlay.tsx` | `ShipResources`, `Hint` |
| Inspect | `hud/InspectPanel.tsx`: you (human, Mush), someone else, equipment, an item, a broken item and broken equipment | `SkillSlots`/`SkillPopover`/`ConfirmPanel`, `StatusIcons`, `ItemFace`, `ActionButton` (enabled and unaffordable) |
| Inventory | `hud/InventoryOverlay.tsx` | `InventoryPanel`, `ItemIcon`, `ConsumeEffects`, heavy items |
| Queue and tips | `hud/ActionQueue.tsx`, `hud/TipCard.tsx` | |
| Peek bar | `hud/PeekBar.tsx` (phone CSS only: visible below 1024px) | |
| Status icons | `hud/StatusIcons.tsx`: every status plus contamination, a catalog for spotting missing art | `StatusIcon` |
| Item attribute icons | `hud/ItemAttrIcons.tsx` (heavy) and `hud/PlantStates.tsx` (young, thirsty, dried, sick) | `StatusIcon` |
| Patrol | `hud/PatrolCockpit.tsx`, alone and with hunters in sight | `HunterList` |
| iTrackie | `hud/ITrackie.tsx` | `FeedEntry` and markers, `CycleDivider`, `RecencyStamp`, `ExpeditionReportDialog` (from the room log), `Thread`/`MessageEntry`, `Markdown` checklists, `ChatInput`, `Threads`, the Mush channel, `SharedPlanets`, `ResearchTracker`, `PrivateChannels` (one with messages), `IconTab` badges, `TabOutline` |
| Death and end | `hud/DeathNotice.tsx`, `hud/BodyTakenDialog.tsx`, `hud/EndScreen.tsx` (dialogs behind buttons) | `DialogHeader` |
| Character picker | `lobby/CharacterPicker.tsx` | `SkillPopover` |
| Account | `account/AccountButton.tsx` | `AccountDetails`, `NameForm` (its buttons call the real API) |

Skipped: `Announcer`, `Credits` (standalone), `Scroller`, `Tracker`, `BottomNav`, `RoomList` (visually hidden),
`FeatureSelect` (in the iTrackie), `TabOutline`'s `outlinePath` (a function, already tested). `ItemAttrIcons` was unused when the kit was built; #396
put it back in the Inspect panel; the kit shows it there and in its own section. The last states the plan listed (a broken item and broken equipment, chat in the Mush channel, a private channel
with messages, hunters in sight) went in on 2026-11-07. There is no hacked sample: hacking is not in the game.

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
(`endGame`), and `sampleState({ preselection: true })`; then `channel`/`lastChannel` (`createChannel`), `breakAll` (the `broken`
flag on every item and equipment of the given types, which must be breakable) and `addHunters` (as the hunter tests
add them). The kit's views are built in `samples.ts`; its test checks each
reaches the state its section shows.

Narrowing a component's props (as `ShipResources` does) instead of passing the whole view is an alternative to the
fixture for the small ones; it also helps re-render cost. Do it only where it reads naturally, not just for the kit.

## Conventions for new sections

- One `<section id>` per component, a page of its own: add it to `GROUPS` in `Mush2Kit.tsx` (its id is the URL), with
  `game: true` if the game shows it on the game screen. A short paragraph naming the file and what each prop variant
  shows; `<figure>`s in `.m2k-row` with a `<figcaption>`.
- A component that fills a panel goes in `GameFrame` (its slot, and the `panel` a phone shows first), not a bare box.
- Real components only, imported from `web/src`. If a component cannot render outside the game, make it pure first
  (as with `TerminalFrame`), not a kit-only copy.
- Check every section at desktop and 360px (no horizontal scroll); the kit's terminal shots used a small Playwright
  script against `/design-kit-mush2`.
