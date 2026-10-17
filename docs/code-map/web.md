# Code map: web

All under `web/src/`. UI rules are in `web/CLAUDE.md`.

**App shell**

- `main.tsx`: React entry.
- `App.tsx`: lobby or game; keeps the seat ticket in sessionStorage.
- `net.ts`: PartySocket connections (host from `VITE_PARTY_HOST`).
- `Lobby.tsx` + `lobby.css`: the cryopod landing page.
- `WakeUp.tsx` + `wakeUp.css`: the wake-up overlay.
- `GameScreen.tsx`: three panels on desktop, tabbed on phones; sends intents. A dead player gets `DeathNotice` instead of the room and no peek bar. The minimap is stubbed out here (`TODO(minimap)`).
- `Toasts.tsx`: transient messages.
- `useMobile.ts`: the phone-layout media query.
- `fogDepth.ts`: the fog depth preference, in localStorage.
- `styles.css`: only `@import`s of `styles/*.css`; `responsive.css` must stay last.

**hud/**

- `TopBar.tsx`: cycle, End cycle, Leave, settings.
- `PlayerSummary.tsx`: portrait, name, faction icon, AP/MP/HP/morale bars.
- `PipBar.tsx`: the pip bar in SVG, tinted by CSS `color`.
- `SettingsDialog.tsx` + `settings.css`: settings dialog.
- `SelfPanel.tsx`: summary, room items, inventory (Inspect tab on phones).
- `InventoryPanel.tsx`: item zones; drag to take/drop, tap fallback.
- `InspectPanel.tsx`: the selected person, equipment, or item, with its legal actions.
- `SkillSlots.tsx`: skill slots and the picker dialog.
- `StatusIcons.tsx`, `ItemAttrIcons.tsx`: status and item attribute icons.
- `ITrackie.tsx`: the right panel: room log, global chat, Features, Private tabs. Messages come from `readChannels`, the message box from `chatChannels`; the dead lose the Room and Private tabs and get a read-only note instead of the box.
- `DeathNotice.tsx`: what a dead player sees where the room was.
- `ItemIcon.tsx`: an item's icon; a corpse shows its owner lying down.
- `FeatureSelect.tsx`: the Features drop-down.
- `IconButton.tsx`: `IconButton` and `IconTab`.
- `Markdown.tsx`: restricted chat message rendering.
- `ActionLabel.tsx`: an action button's label with its cost.
- `targets.ts`: finds the selection in the view (`resolveTarget`, `actionsOn`, `costOf`, `actionLabelKey`).
- `BottomNav.tsx`, `PeekBar.tsx` (phone only): panel switcher; tapped target with its actions.

**iso/** (details in `web/src/iso/CLAUDE.md`)

- `placement.ts`: pure layout math (projection, paint order, walkable cells, hit-testing).
- `IsoRoom.tsx`: renders the scene with a following camera; handles clicks. Corpses on the floor are placed as actors and drawn with the lying pose (`lyingFrame`); clicking one selects the item. Clicking a chair sits you on it (`seatFor`, `SeatedSprite`, `sittingFrame` in `art/assets.ts`); client-only like walking.
- `hitMask.ts`: per-frame alpha masks for hit-testing.
- `shipLayout.ts`: fetches the layout JSON and maps atlas sheets to image URLs.

**scene/**

- `Minimap.tsx` (not rendered now) and `plan.ts` (its pure helpers).
- `CrewSprite.tsx`: a character's sprite.
- `StatusBadges.tsx`: status icons over a character's head.
- `useSpeechBubbles.ts`: chat messages as speech bubbles.

**art/**

- `assets.ts`: maps characters, room types, and item types to files in `Mush/`.
- `keyedSprite.ts`: `useKeyedSprite`, transparent sprite backgrounds at load.

**i18n/** (see the `i18n` skill)

- `index.ts`, `locale.ts`: i18next setup and language choice. Catalogs are `web/src/locales/{en,fr,es}.json`.
- `names.ts`: `useNames()`, display names for server ids.
- `LanguageSwitcher.tsx` + `languageSwitcher.css`: the lobby language picker.
