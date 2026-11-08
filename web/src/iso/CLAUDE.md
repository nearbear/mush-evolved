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
- Clicks: floor walks you there (drawn at once, and sent as a `walk` so roommates see it: `PlayerState.spot`
  in shared, `spot.ts`; others stand at their view `spot`, or spread out if they have none); a person or
  equipment is selected, without walking to it (only acting on it does, below); bare floor clears the selection (on
  desktop, so does any press outside the Inspect panel). A single tap on a reachable door opens it
  in the peek bar; a double-click sends a move. Clicking a faded room acts like its door.
- Walking (`useWalkers.ts`): nobody jumps. Everyone in your room walks to their spot (you to where
  you clicked) at `CELLS_PER_SECOND`, along `walkPath`, stepping along the grid axes (a deliberate staircase, not straightened). React re-renders
  only when someone enters another cell or turns (paint order, strip); between those, a
  `requestAnimationFrame` loop hands the renderer and the overlay (`setFrame`) the camera and each
  walker's offset in whole pixels, so the camera stays locked on you. Facing is by screen direction: the face strip looks down-right
  and the back strip up-left, mirrored for the other two. Entering a room you step out of the
  doorway you came through and stand in front of it (`doorSpot`) until you walk off (the server records the same: `{ door }`). Nothing waits for a walk: actions and moves go to the
  server at once, mid-walk or not; you sit on a chair only once you reach it. The tiles are sorted
  once per room and fog depth (`prepareScene`, about 13 ms); each cell change re-places only the
  people (`placeActors`, about 2 ms, 5 ms with whole-ship fog), with the same result `placeScene`
  gives. The DOM layers (`useDomFrame.ts`) shift the `data-walker` elements found at their last
  commit, not a fresh query. With the instant actions cheat on,
  you teleport instead (`teleport`: your walks jump, and leaving a room switches at once); others still walk.
  Pushing a wheelchair, your clicks steer it (`walkTo`: its spot is the cell, yours the cell before it on its way), and the
  pusher's goal is `behind` it: they walk its trail a cell back (`followTrail`), on every client. Acting walks either of
  them only for an action that ends the push (`ActingOn.endsPush`); moves still walk the pusher to the door alone.
- Acting walks you there (`useActingOn.ts`): when an action on equipment, a person, or a body on the
  floor begins, you walk to the equipment's standing spot or the cell before the person or body; a
  move walks you to the door (a move takes `durationMs` like any action, and the room changes at its end).
  The walk is sent to the server (`ActingOn.share`) only for public actions (owner, 2026-10-20).
  Opening a terminal (`access`, `ActingOn.seats`) walks you there without sending it: the server seats you
  (an `occupancy` spot, #192), and you go to that chair (`terminalSpot`). Closing the terminal's window
  (`atTerminal` off) walks you to its standing spot, and that walk is sent, which ends the spot. While the
  window is open, actions (the window is modal, so they're its own) don't walk you anywhere. A chair off
  the floor (the pilot's, the turrets') is climbed into from the nearest floor cell (`offFloorStep`, `stepsOnto`,
  as a `Goal.then`), and stepped down from the same way.
  "Begins" is read from the view's queue: at once if you were idle, otherwise when it shows up as
  `current` (timed) or leaves the queue with nothing under way (instant). Clearing the queue walks
  nowhere; a click on the floor afterwards still overrides.
- Leaving a room (`LeavingRoom.tsx`): when the view's room changes before you've gone through the
  door, the room view keeps showing the room you left, as last seen and with clicks ignored, until
  you stand in its doorway (`IsoRoom`'s `leavingTo`/`onLeft`); then it switches to the new room with
  you in the same doorway, seen from the other side.
- Going through doors: nobody pops in or out at a door. `doorPassage` (`placement.ts`) is the walk
  from the floor in front of a door on one side, through its doorway (the drawn door's two cells,
  whichever room's wall holds it), to the floor on the other; it is searched from the same end
  whichever room you see it from, so both rooms agree on the doorway cell where the view switches
  (a test checks every door on the ship). A walker's `Goal` (`useWalkers.ts`) can come in along one
  (`from`, when they first appear) or go out along one (`then`). Others' ways in and out come from
  the room log's public `entered`/`left` entries (`doorMoves.ts`, only the last 15 seconds);
  someone who left stays drawn walking out until they're through, and isn't drawn in the room they
  went to (with ACTOPI on) until then. Without a log entry they still appear and vanish in place.
- Doors open and shut (`stepWalkers`, pure, one frame): a door starts opening when someone is about
  to walk through it, timed so it is open as they reach it; nobody steps into a doorway before it is
  open (someone standing at it waits), and it shuts once nobody is in the doorway or about to be.
  `describeScene` turns each door's state (`doors`, by sprite key) into its animation
  (`doorAnim`): opening, standing open (you came through it), or shutting.
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

- Anything animated on its own clock (the walk cycle, the camera's swivel, a door) is a `SceneAnim`
  the renderer plays; in the DOM renderer each keeps its timer in its own small component
  (`useAnimFrame`): a timer in `IsoRoom` re-renders every sprite in the scene. A renderer restarts
  an animation when its `animId` changes; one with `loops: "hold"` rests on its last frame.
- Scenery that loops on its own all the time is listed in `AMBIENT_SLICES` (`scene.ts`): the engine
  room's three reactors, PILGRED's core once repaired, and the placed MidFill/MidFill2 equipment with an
  `auto` anim (gravity simulator, surgery pod, NERON, BIOS, tanks, bridge LEDs and astro console, antenna, human tank). Like ones are kept out of step
  (`spreadAmbient`: each starts at a different frame, spread evenly around the loop). Only the slices listed there move; most
  `auto` anims in tiles.xml are not played yet. Frames step along a row and wrap every `perRow`
  (the slice's `framesX`; the reactors' frames run down a column), through `frameAt`. `looks`
  draws a tile as another slice of the same size: `core_pilgred` becomes the animated
  `core_pilgred_upgrade` once the view's public `pilgredRepaired` is true, and `human_tank`
  becomes `human_tank_full` once `humanTankFull` is true (a Mush has died on the ship).

## Where the animations are

The original's sprite animations are defined in `Mush/clients/iso/xml/tiles.xml`: each `<slice>`
has its sheet rectangle and frame count in `params`, and one or more `<anim range="..."
rhythm="..."/>` (frame numbers; how long each shows, in ticks of 1/30 s; `auto="true"` plays on its
own). The file holds a great many of them (doors, consoles, cameras, screens, plants, effects), so
look there first for anything that should move. A slice with several anims has them as `#0`,
`#1`, ... in the original. `npm run ship-layout` copies them into `Mush/derived/ship-art.json`
(`slices[id].anims`, with `frames`, `rhythm` and `auto`), which is what the client reads. Reading
`Mush/clients/**` asks for approval in the project settings, so extract the slices you need with a
short script rather than reading the whole file. For example, the doors (`DOOR_L`, `DOOR_R`, `DOOR_L_DECK`, `DOOR_R_DECK`): 24
frames, `#0` opens (frames 0-9), `#1` shuts (12-23, then 0); the original played `#0` back and forth
on hover (`Select.hx`). The floor-level front doors (`DOOR_BL`, `DOOR_BR`) only have a looping
5-frame glow and aren't drawn once the room behind them is.

## Looking at the whole ship

`npm run ship-view` (needs `npm run dev` running) joins a ship, sets the fog to "whole ship", makes
the iso panel fill a large window, and saves one screenshot to `.screenshots/ship.png`. Use it for
anything that spans rooms (walls, fog, neighbour placement); `npm run screenshot` only shows one room
at panel size. Have the `visual-check` subagent read the PNG and actually look (see the `play` skill). Both work with either renderer (headless Chromium
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

For walls and anything else static, `npm run ship-render` is quicker and steadier. It needs no
browser and no dev server. It runs `placeScene` itself and composites the sprites from the atlases
into `.screenshots/ship-render.png`, with no fog and no camera, so the same arguments give the same
image (the browser's camera follows a randomly placed character, so `--clip` shots move between
runs). It draws no people, effects or animation.

- `-- --cells=-30,10,-20,25 --scale 4` draws only those cells (on the ship plan, as `ship-check`
  and the tests print them), magnified. Write `--cells=` with the `=`, since the numbers can be negative.
- `-- --room LABORATORY --depth 1` draws the scene as seen from that room (default: the front
  corridor, the whole ship).
- `-- --ends` marks the wall ends that touch no other wall or post, and lists them: magenta where
  nothing is beyond (open front edges, the hull), orange where there is floor beyond.
- `-- --add "ROOM:slice:frame:x:y;..."` and `-- --drop "slice:x:y;..."` try wall pieces before
  changing code.

To see where things are without the iso view, `npm run ship-top` draws the same scene from above
(x to the right, y down; turn it 45° clockwise for the iso view) as plain shapes into
`.screenshots/ship-top.png`. It shows:

- floor in each room's colour, lighter for walkways and paths
- walls as lines on the cell edges they stand on, lilac for deck walls
- doors in cyan; dashed for doorways on a room's open front edge
- posts on corners, furniture footprints, room names, and grid lines every 5 cells, numbered with
  ship-plan coordinates

It takes `--cells=`, `--room`, `--depth`, `--ends`, `--add` and `--drop` as `ship-render` does,
and `--cell 32` for bigger cells. Both tools share `tools/src/play/shipScene.ts`.

## Directions

`gridToPx`: +x is down-right on screen, +y is down-left. A wall along x runs top-left to
bottom-right; one along y runs top-right to bottom-left. A room's back edges (where its walls are)
are its top-left and top-right sides; its front edges, bottom-left and bottom-right. When the user
describes a spot in screen terms, translate it to cells and confirm on the data before changing code.

## The ship map

- **`Mush/derived/ship-map.json` is the ship.** Every room (`RoomLayout`: id, label, `at`, equipment
  bindings) and every tile in it, one tile per line, edited by hand (and soon by the editor, #209).
  Nothing changes it at build or draw time: what is in the file is what is drawn. `npm run ship-layout`
  only regenerates the sprites (`ship-art.json`, from `tiles.xml`) and the rules' room graph
  (`ship-rooms.json`, from the map). Edit it with a short script through `readMap`/`writeMap`
  (`tools/src/shipLayout/shipMap.ts`), which keeps the format; `npm run layout-query` to search it.
- **The ship map editor** (`web/src/editor/`, dev builds only): `npm run dev`, then `/editor`. It
  draws the whole ship as fog depth "all" does, or what the game draws from one room at fog depth 1
  or 2 (where seams between rooms show), with pan, zoom, layer toggles, a grid and room outlines on
  the ship plan. Click a tile to select it (Tab steps through everything under that spot); move it a
  cell at a time, delete, duplicate, change its frame, hand it to another room, set a door's target;
  place new tiles from the palette (a placed sofa is bound as built-only `SOFA` equipment: the game draws it only once one is built; cameras are ordinary tiles); undo and redo; save writes `ship-map.json` and regenerates
  `ship-rooms.json` (`tools/src/editor/vitePlugin.ts`, after `validateMap`). The game tab needs a
  reload to see a save. A new tile's kind and layer are what the map already uses for its slice.
  Shift+arrows (or the Room pad) move the selected tile's room on the plan. The Checks panel
  re-checks the map a moment after each edit (`web/src/editor/checks.ts`, in a worker): overlaps,
  misaligned doors, doors with no room, floor or way back, equipment with no tile, loose wall ends
  from every room, gaps; clicking one centres it, marks its cells and selects its tile or room
  (switching to the one view it shows in, if any). What tests pin as left on purpose is folded away.
- It was frozen on 2026-10-21 from the converter's output plus what the old draw-time fixes added
  for the whole ship (widened and lengthened corridors, walkways and deck floors, doors slid to meet,
  floor under doors and across one-cell gaps, walls between floors, walls carried on to meet the next
  room's with corner pieces), seen from the front corridor with every room drawn. So the whole ship
  (fog depth "all") looks as before, pixel for pixel. At fog depths 1 and 2 it doesn't quite: the old
  fixes ran on whichever rooms were drawn, and some joins in the map only make sense with a room that
  isn't drawn there (wall stubs into empty space, a gap where a farther room's wall closed it). Those
  are fixed by hand, in the map.
- **The ship plan.** Every room has one fixed position (`RoomLayout.at`): its tile (x, y) is at
  (x + at.x, y + at.y) on the ship grid, and `neighborRooms` takes offsets from it, so a room is in
  the same place whichever room you stand in. Moving a room is changing its `at`; then
  `npm run ship-check` lists rooms on top of each other (errors, a test fails), doors whose two sides
  don't meet (pinned as `KNOWN_MISALIGNED` in `web/src/editor/checks.ts`, so a change there is deliberate),
  and gaps. Then look with `npm run ship-render` or `ship-view`.
- **Who owns a tile** decides when it is drawn (only with its room) and how it is lit (`describeScene`
  dims other rooms' sprites, except a door back to your room and a neighbour's wall on a cell next
  to your floor). A wall or floor between two rooms belongs to one of them. Ownership also decides
  paint order across rooms: a wall covers what stands behind it in another room, but a thing mounted
  on a wall goes over it only in the same room. Moving the sick bay's back wall to the front
  corridor hid the sick bay's camera behind it, so check what is mounted before moving a wall.
- **Walls stand on cell edges.** A cell's anchor (`gridToPx`) is its top corner, so cell (x, y)
  spans to (x + 1, y + 1): `BIG_WALL_L` stands on its +x edge, `BIG_WALL_R` on its +y edge,
  `corner_02` on both (the original's front corner), a door on its two cells' edges, and `COLUMN`
  is a post on the +x+y corner (the original's back corner). A wall's solid art runs about half a
  cell past its +x (R) or +y (L) end and not at all past the other, so a wall that stops one edge
  short of another shows a gap. Judge joins by the top ridges: they should run on into each other.
  "Leaves no wall stopping just short of another room's" in `placement.test.ts` checks the map from
  every room at fog depths 1 and all, with the ends left on purpose pinned with their reasons.
- Rooms have walls only on their back edges (low x and low y), as in the original, which drew one
  room at a time; their front edges are open, and a neighbour's back wall closes them. Don't close
  open front edges in general: a wall there covers the room behind it.
- Doors are two cells wide (footprint toward -x/-y) and their art includes the top ridge, so there
  is no wall on a door's second cell, and floor under both cells, which the doorway shows (owned and
  lit by the room whose back wall holds the door). Front-edge doors (`DOOR_BL`/`DOOR_BR`) only mark
  where you walk through: they aren't drawn once the room behind them is. A cell with a wall on it
  isn't walkable, even with floor under it (`walkableCells`).
- The deck corridors (the bays' `GROUND_DECK` plates and paths in the corridors, 2026-10-20) are in
  the map as tiles like any other.

## Working on it

- Look at the data before guessing. Dump a room as an ASCII grid of floor/wall/door cells from
  `Mush/derived/ship-map.json` (a few lines of Python), and for a whole scene, a throwaway Vitest
  file that calls `placeScene` and throws the sprites it wants to see.
- Scene cells are the first room's grid; each neighbour is shifted by the difference of the two
  rooms' plan positions. Editing the map moves things, so prefer tests that read a cell from the
  data over pinned coordinates.
- Measure art, don't eyeball it. Offsets come from `tiles.xml` but the pivot (centred) is inferred;
  compare opaque pixel profiles with `decodePng` (`tools/src/shipLayout/png.ts`). Doors and walls
  line up at the top; that's how the "doors float" bug was found.
- Sprite keys are `t<index>` into the room's tiles, and equipment bindings claim the first tile
  with their sprite in order (`placedEquipment`): append tiles rather than insert them before
  equipment. Two sprites that tie in paint order keep the order they are in the map.
- Dead ends: walls on every open front edge (they cover whole rooms); a wall drawn behind doors (the
  ridge doubles); odd corridor widths (a two-cell door can't be centred); widening the centre
  corridor (Bay Alpha's and Bay Beta's doors are four cells apart, so it hits the storage rooms).
