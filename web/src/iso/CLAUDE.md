# web/src/iso guidelines

Loaded when working on the isometric view. The UI rules in `web/CLAUDE.md` still apply.

## How the view works

- `placement.ts` is pure (no DOM) and reproduces the original Flash client: grid projection, paint
  order, walkable cells, standing spots, `cellAtPoint` (click to floor cell), `standSpot` (where to
  stand to use equipment), and `hitTest`. `shipLayout.ts` fetches the layout JSON and maps atlas
  sheets to image URLs.
- The renderer is swappable. `IsoRoom.tsx` is the controller: placement, walking, the camera, input
  and hit-testing. It turns the placed sprites into a `Scene` with `describeScene` (`scene.ts`,
  pure and unit tested): each sprite's image frame, position, flips, animation, and its effect by
  meaning (`fogged`, `foggedLifted`, `hover`, `doorHover`, `selected`), plus see-through outlines.
  A renderer is a component taking `{ scene, ref }` (`SceneRendererProps`): it draws the scene at
  exactly 1x and takes per-frame camera and walker offsets through `ref.setFrame`, with no input
  and no game state. The DOM one is `dom/DomScene.tsx` (one absolutely positioned div per sprite,
  effects as `fx-*` classes in `styles/iso.css`). The Pixi one (`pixi/`, the default; `ROOM_RENDERER` in
  `rendererChoice.ts` picks) is an imperative class behind a thin component,
  lazy-loaded; only `pixi/` (and the lobby's `web/src/lobby/pixi/`) may import `pixi.js` (a Biome rule). Its effects are hand-written GLSL
  filters (`pixi/filters.ts`) drawing the looks in `pixi/effects.ts`, which copies the numbers from
  `styles/iso.css`: change a look in both. It survives a lost WebGL context (stops drawing, redraws
  when the context is back) and a StrictMode or hot-reload remount (one canvas, one context at a
  time). `IsoRoom` picks one from `RENDERERS`. Effect
  precedence (which wins when hovered and selected) is decided in `describeScene`, not in CSS.
  Badges, action bars and speech bubbles stay DOM whatever the renderer (`SceneOverlay.tsx`, in its
  own world above the scene, moved by the same frames). Keep renderer-specific code out of
  `scene.ts`, `placement.ts` and `IsoRoom.tsx`.
- Camera: the panel is `overflow: hidden` and follows your character by moving an inner `.iso-world`
  with a transform, always centred on you (not clamped to the room's edges). No manual panning.
- Clicks: floor walks you there (local, cosmetic state only, never sent to the server); a person or
  equipment is selected, without walking to it (only acting on it does, below); bare floor clears the selection (on
  desktop, so does any press outside the Inspect panel). A single tap on a reachable door opens it
  in the peek bar; a double-click sends a move. Clicking a faded room acts like its door.
- Walking (`useWalkers.ts`): nobody jumps. Everyone in your room walks to their spot (you to where
  you clicked) at `CELLS_PER_SECOND`, along `walkPath`, stepping along the grid axes (a deliberate staircase, not straightened). React re-renders
  only when someone enters another cell or turns (paint order, strip); between those, a
  `requestAnimationFrame` loop hands the renderer and the overlay (`setFrame`) the camera and each
  walker's offset in whole pixels, so the camera stays locked on you. Facing is by screen direction: the face strip looks down-right
  and the back strip up-left, mirrored for the other two. Entering a room you stand in front of the
  door you came through (`doorSpot`) and don't move. Purely cosmetic: actions and moves go to the
  server at once, mid-walk or not; you sit on a chair only once you reach it. The tiles are sorted
  once per room and fog depth (`prepareScene`, about 13 ms); each cell change re-places only the
  people (`placeActors`, about 2 ms, 5 ms with whole-ship fog), with the same result `placeScene`
  gives. The DOM layers (`useDomFrame.ts`) shift the `data-walker` elements found at their last
  commit, not a fresh query. With the instant actions cheat on,
  you teleport instead (`teleport`: your walks jump, and leaving a room switches at once); others still walk.
- Acting walks you there (`useActingOn.ts`): when an action on equipment, a person, or a body on the
  floor begins, you walk to the equipment's standing spot or the cell before the person or body; a
  move walks you to the door (a move takes `durationMs` like any action, and the room changes at its end).
  "Begins" is read from the view's queue: at once if you were idle, otherwise when it shows up as
  `current` (timed) or leaves the queue with nothing under way (instant). Clearing the queue walks
  nowhere; a click on the floor afterwards still overrides.
- Leaving a room (`LeavingRoom.tsx`): when the view's room changes before you've reached the door,
  the room view keeps showing the room you left, as last seen and with clicks ignored, until you
  stand at the door (`IsoRoom`'s `leavingTo`/`onLeft`); then it switches and you stand at the door
  of the new room.
- Hit-testing is against drawn pixels, not sprite boxes: sprites ignore pointer events and the
  viewport runs `hitTest` front to back with per-frame alpha masks from `hitMask.ts`, so scenery in
  front blocks what's behind it and see-through areas click through. The current room takes clicks
  first.
- Paint order: `placeScene` draws the current room and its neighbours in one topological sort over
  overlapping sprites using footprints, so wide furniture and neighbouring rooms layer correctly.
  Walls and doors cover whatever stands behind them, people included; footprints diagonally apart
  get no constraint. Front-edge doors (`DOOR_BL`/`DOOR_BR`) are left out once the room behind them
  is drawn.
- People a wall covers (`PlacedSprite.occluded`) get a glowing outline (`Scene.outlines`; an SVG
  filter in the DOM renderer) in a layer above the scene, so nobody can hide behind a wall: fixed scenery only, plus whoever the view
  places there. The client adds no ACTOPI check of its own.

- Anything animated on its own clock (the walk cycle, the camera's swivel) is a `SceneAnim` the
  renderer plays; in the DOM renderer each keeps its timer in its own small component
  (`useAnimFrame`): a timer in `IsoRoom` re-renders every sprite in the scene.

## Looking at the whole ship

`npm run ship-view` (needs `npm run dev` running) joins a ship, sets the fog to "whole ship", makes
the iso panel fill a large window, and saves one screenshot to `.screenshots/ship.png`. Use it for
anything that spans rooms (walls, fog, neighbour placement); `npm run screenshot` only shows one room
at panel size. Read the PNG and actually look. Both work with either renderer (headless Chromium
has WebGL through SwiftShader): they find things through the dev-only `isoProbe` that `IsoRoom`
puts on `.iso-viewport` (clickable things with their boxes, and the hover key), and wait for the Pixi
host's `data-art="ready"` (`tools/src/play/isoProbe.ts`). Keep both up to date when changing what
can be clicked.

- `-- --walk "Front corridor,Bridge"` walks through those doors in order first (door labels, as the
  room's title shows them). The lit room is the last one; everything else is fogged.
- `-- --clip x,y,width,height` crops to part of the window, in window pixels. Take the full shot
  first (`--width 3000 --height 2200` fits the ship) to find the region, then clip to zoom in.
- `-- --scale 3` renders at 3 device pixels per pixel, to magnify a `--clip` (pixels stay crisp).
- To see what a change did, take the same `--walk`/`--clip` shot with and without it (`--out` to a
  scratch folder for the "before"). Vite reloads the change before the next run.

## Directions

`gridToPx`: +x is down-right on screen, +y is down-left. A wall along x runs top-left to
bottom-right; one along y runs top-right to bottom-left. A room's back edges (where its walls are)
are its top-left and top-right sides; its front edges, bottom-left and bottom-right. When the user
describes a spot in screen terms, translate it to cells and confirm on the data before changing code.

## How rooms fit together

- Rooms come from the original, which drew one room at a time: each room has walls only on its back
  edges (low x and low y), and its front edges are open, so a neighbour's back wall closes your
  room's front edge.
- **The ship plan.** Every room has one fixed position on a ship-wide grid (`RoomLayout.at`, from
  the `ROOM_POSITIONS` table in `tools/src/shipLayout/roomPositions.ts`), and `neighborRooms` takes
  offsets from it, so a room is in the same place whichever room you stand in. Don't place rooms by
  chaining doors: the original's doors disagree with each other by up to a few cells, so the ship
  came out differently from each room and a fix in one view broke others. Once rooms are placed,
  the converter moves each front-edge door (`DOOR_BL`/`DOOR_BR`, never drawn while the room behind
  it is) along its edge onto the neighbour's drawn door; it only marks where you walk through. A
  door with a walkway drawn on the floor to it never moves, so where a walkway ends is where the
  doorway is: the drawn door on the other side slides along its wall to it instead (with its
  doormat; the wall tiles swap into the old doorway; never onto a wall with something mounted).
  Pairs neither can fix show up as doors that don't line up (`alignDoors` in `roomPositions.ts`).
- Walkways we add (the milky blue `GROUND` frame 1) are rectangles in `tools/src/shipLayout/walkways.ts`,
  painted over plain floor before rooms are placed: the dorm-to-storage crossings in the rear
  corridor and the bridge-to-refectory strip through the front and centre corridors.
- **Moving a room:** change its numbers in `ROOM_POSITIONS`, `npm run ship-layout`, then
  `npm run ship-check`. That lists overlaps and doors moved off their floor paths (both errors: a
  test fails on them, the paths checked against the converter's unplaced rooms), doors whose two sides
  still don't meet (pinned in `tools/tests/shipLayout/check.test.ts`, so a change there is
  deliberate), and gaps between rooms. Then look at it with `npm run ship-view`. `npm run ship-check
  -- --seed BEDROOM_A --fit` rebuilds the whole table (placed door to door, then nudged until
  nothing overlaps); the current table came from that.
- Room shapes are ours in places: `tools/src/shipLayout/stretch.ts` widens the corridors to four
  cells (the front corridor so that its two-cell end doors have one wall each side) and
  lengthens the back corridor, then `npm run ship-layout` regenerates the data. Changing a room's
  shape doesn't move other rooms any more; `npm run ship-check` shows what it now overlaps.
- `fillGaps` (in `placeScene`) patches the holes where drawn rooms meet: floor under doors that
  have none, floor across a one-cell strip between a room and another room's wall, and a wall on
  an empty cell with floor on both sides. Don't close open front edges in general: a wall there
  covers the room behind it.
- Doors are two cells wide (footprint toward -x/-y) and their art includes the top ridge, so no
  wall is drawn on a door's second cell; `fillGaps` puts floor under both cells, which the doorway
  shows: one tile for both, owned (and lit) by the room whose back wall holds the door. The
  doormats (`DOOR_*_FLOOR`) are left out.
- Fog: sprites from other rooms are dimmed (`fogged` in `describeScene`), except a door back to
  your room and a neighbour's wall on a cell next to your floor, which count as your room's outline.

## Working on it

- Look at the data before guessing. Dump a room as an ASCII grid of floor/wall/door cells from
  `Mush/derived/ship-layout.json` (a few lines of Python), and for a whole scene, a throwaway Vitest
  file that calls `placeScene` and throws the sprites it wants to see. Most "missing" or "wrong"
  walls here were in the data, not the renderer.
- Scene cells are the first room's grid; each neighbour is shifted by the difference of the two
  rooms' plan positions. Changing a room's shape (`stretch.ts`) or a front-edge door snapping
  elsewhere moves cells, so prefer tests that read a cell from the data over pinned coordinates.
- Measure art, don't eyeball it. Offsets come from `tiles.xml` but the pivot (centred) is inferred;
  compare opaque pixel profiles with `decodePng` (`tools/src/shipLayout/png.ts`). Doors and walls
  line up at the top; that's how the "doors float" bug was found.
- Who owns a sprite decides its light: `describeScene` dims anything whose `room` isn't yours, except the
  cases under Fog above. Tiles added by `fillGaps` pick an owner on purpose.
- Sprite keys are `t<index>` into the room's tiles (equipment lookup uses them): append tiles, never
  insert. Two sprites that tie in paint order keep the order they were pushed in.
- Dead ends: walls on every open front edge (they cover whole rooms); a wall drawn behind doors (the
  ridge doubles); odd corridor widths (a two-cell door can't be centred); widening the centre
  corridor (Bay Alpha's and Bay Beta's doors are four cells apart, so it hits the storage rooms).
