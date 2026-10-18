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
- `SelfPanel.tsx`: summary and other resources (Inspect tab on phones, without the summary).
- `InventoryOverlay.tsx` + `styles/inventory.css`: the sack button in the room view's lower right (badge = items in the room) that opens `InventoryPanel` over the room; closes on the button, Escape, or a press elsewhere in the room view. Both layouts; hidden when dead.
- `InventoryPanel.tsx`: item zones; drag to take/drop, tap fallback.
- `InspectPanel.tsx`: the selected person, equipment, or item, with its legal actions.
- `SkillSlots.tsx`: skill slots and the picker dialog.
- `StatusIcons.tsx`, `ItemAttrIcons.tsx`: status and item attribute icons.
- `ITrackie.tsx`: the right panel: room log, global chat, Features, Private tabs. Messages come from `readChannels`, the message box from `chatChannels`; the dead lose the Room and Private tabs, get a read-only note instead of the box in the other channels, and gain a skull Graveyard tab.
- `DeathNotice.tsx`: what a dead player sees where the room was.
- `ItemIcon.tsx`: an item's icon; a corpse shows its owner lying down.
- `FeatureSelect.tsx`: the Features drop-down.
- `IconButton.tsx`: `IconButton` and `IconTab`.
- `Markdown.tsx`: restricted chat message rendering.
- `ActionLabel.tsx`: an action button's label with its cost.
- `ActionQueue.tsx`: your action under way and the queued ones, with Clear queue, over the room view (both layouts).
- `targets.ts`: finds the selection in the view (`resolveTarget`, `actionsOn`, `costOf`, `actionLabelKey`), and what an action is aimed at (`actionTarget`).
- `BottomNav.tsx`, `PeekBar.tsx` (phone only): panel switcher; tapped target with its actions.

**iso/** (details in `web/src/iso/CLAUDE.md`)

- `placement.ts`: pure layout math (projection, paint order, walkable cells, hit-testing).
- `equipmentTiles.ts`: which tile draws which equipment (`equipmentByTileKey`, also used by the Inspect panel); `SOFA_SPOTS` (hand-picked sofa spots), `withoutBuiltOnly` (drops the map's built-only tiles at load) and `roomAsBuilt` (adds the room's sofa tile once one is built).
- `scene.ts`: the renderer seam, pure. `describeScene` turns placed sprites into a `Scene` (image frames, positions, animations, effects by meaning, see-through outlines); `SceneRendererProps` is what a renderer takes. Also `Occupant`, `Corpse`, `imageOf` (a sprite's frame, for hit-testing).
- `dom/DomScene.tsx`: the DOM renderer (one div per sprite, `fx-*` effect classes, the see-through SVG filter, `useAnimFrame`).
- `SceneOverlay.tsx`: status badges, action bars and speech bubbles over people, DOM whatever the renderer.
- `useDomFrame.ts`: per-frame camera transform and walker shifts for a DOM layer (DomScene and the overlay).
- `IsoRoom.tsx`: the controller: places the scene, follows you with the camera, hit-tests and handles input, and draws through `Renderer` (DomScene); the layout holds a `camera`/`camera2` tile in every room, drawn only in your own room and only when `view.roomEquipment` has a `CAMERA` (and clickable as that equipment); handles clicks. Corpses on the floor are placed as actors and drawn with the lying pose (`lyingFrame`); clicking one selects the item. Clicking a chair sits you on it (`seatFor`, `sittingFrame` in `art/assets.ts`); client-only like walking.
- `useWalkers.ts`: walking (client-only): everyone in your room walks to their spot along `walkPath` + `smoothPath`, moved per frame by whole pixels (handed to the renderer through a `paint` callback) with the camera locked on you; facing by screen direction. You enter standing at the door you came through (`doorSpot`). Nothing waits for a walk.
- `LeavingRoom.tsx`: `LeavingIsoRoom`, what `GameScreen` renders: `IsoRoom`, but on a room change it keeps the room you left on screen until you have walked to its door.
- `useActingOn.ts`: what your latest action is on (or the door, for a move), read from the view's queue (`begun`), so you walk up to it when it starts; `IsoRoom` turns it into a cell.
- `hitMask.ts`: per-frame alpha masks for hit-testing.
- `shipLayout.ts`: fetches the layout JSON and maps atlas sheets to image URLs.

**scene/**

- `Minimap.tsx` (not rendered now) and `plan.ts` (its pure helpers).
- `StatusBadges.tsx`: status icons over a character's head.
- `ActionBar.tsx`: the draining bar over a busy character's head (CSS animation, server times shifted by the view message's `now`).
- `useSpeechBubbles.ts`: chat messages as speech bubbles.

**art/**

- `assets.ts`: maps characters, room types, and item types to files in `Mush/`.
- `keyedSprite.ts`: `useKeyedSprite`, transparent sprite backgrounds at load.

**i18n/** (see the `i18n` skill)

- `index.ts`, `locale.ts`: i18next setup and language choice. Catalogs are `web/src/locales/{en,fr,es}.json`.
- `names.ts`: `useNames()`, display names for server ids.
- `LanguageSwitcher.tsx` + `languageSwitcher.css`: the lobby language picker.
