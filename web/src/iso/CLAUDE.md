# web/src/iso guidelines

Loaded when working on the isometric view. The UI rules in `web/CLAUDE.md` still apply.

## How the view works

- `placement.ts` is pure (no DOM) and reproduces the original Flash client: grid projection, paint
  order, walkable cells, standing spots, `cellAtPoint` (click to floor cell), `standSpot` (where to
  stand to use equipment), and `hitTest`. `IsoRoom.tsx` renders it at exactly 1x, one absolutely
  positioned div per sprite. `shipLayout.ts` fetches the layout JSON and maps atlas sheets to image
  URLs.
- Camera: the panel is `overflow: hidden` and follows your character by moving an inner `.iso-world`
  with a transform, clamped by `cameraOffset` to the current room's edges. No manual panning.
- Clicks: floor walks you there and equipment steps you up to it (local, cosmetic state only, never
  sent to the server); a person or equipment is selected; bare floor clears the selection (on
  desktop, so does any press outside the Inspect panel). A single tap on a reachable door opens it
  in the peek bar; a double-click sends a move. Clicking a faded room acts like its door.
- Hit-testing is against drawn pixels, not sprite boxes: sprites ignore pointer events and the
  viewport runs `hitTest` front to back with per-frame alpha masks from `hitMask.ts`, so scenery in
  front blocks what's behind it and see-through areas click through. The current room takes clicks
  first.
- Paint order: `placeScene` draws the current room and its neighbours in one topological sort over
  overlapping sprites using footprints, so wide furniture and neighbouring rooms layer correctly.
  Walls and doors cover whatever stands behind them, people included; footprints diagonally apart
  get no constraint. Front-edge doors (`DOOR_BL`/`DOOR_BR`) are left out once the room behind them
  is drawn.
- People a wall covers (`PlacedSprite.occluded`) get a glowing outline (an SVG filter) in a layer
  above the scene, so nobody can hide behind a wall: fixed scenery only, plus whoever the view
  places there. The client adds no ACTOPI check of its own.

## Looking at the whole ship

`npm run ship-view` (needs `npm run dev` running) joins a ship, sets the fog to "whole ship", makes
the iso panel fill a large window, and saves one screenshot to `.screenshots/ship.png`. Use it for
anything that spans rooms (walls, fog, neighbour placement); `npm run screenshot` only shows one room
at panel size. Read the PNG and actually look.

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
  edges (low x and low y), and its front edges are open. `neighborRooms` places the rooms behind the
  doors by lining up the two sides of each door, so a neighbour's back wall usually closes your
  room's front edge.
- Room shapes are ours in places: `tools/src/shipLayout/stretch.ts` widens the corridors to four
  cells (the front corridor so that its two-cell end doors have one wall each side) and
  lengthens the back corridor, then `npm run ship-layout` regenerates the data. Widening a room
  moves every room placed from its doors; the `neighborRooms` overlap test catches collisions.
- `fillGaps` (in `placeScene`) patches the holes where drawn rooms meet: floor under doors that
  have none, floor across a one-cell strip between a room and another room's wall, and a wall on
  an empty cell with floor on both sides. Don't close open front edges in general: a wall there
  covers the room behind it.
- Doors are two cells wide (footprint toward -x/-y) and their art includes the top ridge, so no
  wall is drawn on a door's second cell; `fillGaps` puts floor under both cells, which the doorway
  shows: one tile for both, owned (and lit) by the room whose back wall holds the door. The
  doormats (`DOOR_*_FLOOR`) are left out.
- Fog: sprites from other rooms are dimmed (`.neighbor` in `styles/iso.css`), except a door back to
  your room and a neighbour's wall on a cell next to your floor, which count as your room's outline.

## Working on it

- Look at the data before guessing. Dump a room as an ASCII grid of floor/wall/door cells from
  `Mush/derived/ship-layout.json` (a few lines of Python), and for a whole scene, a throwaway Vitest
  file that calls `placeScene` and throws the sprites it wants to see. Most "missing" or "wrong"
  walls here were in the data, not the renderer.
- Scene cells are the first room's grid; each neighbour is shifted so the two sides of the shared
  door coincide. Changing a room's shape (`stretch.ts`) shifts those offsets, so tests pinned to
  exact cells can fail just from the shift.
- Measure art, don't eyeball it. Offsets come from `tiles.xml` but the pivot (centred) is inferred;
  compare opaque pixel profiles with `decodePng` (`tools/src/shipLayout/png.ts`). Doors and walls
  line up at the top; that's how the "doors float" bug was found.
- Who owns a sprite decides its light: `IsoRoom` dims anything whose `room` isn't yours, except the
  cases under Fog above. Tiles added by `fillGaps` pick an owner on purpose.
- Sprite keys are `t<index>` into the room's tiles (equipment lookup uses them): append tiles, never
  insert. Two sprites that tie in paint order keep the order they were pushed in.
- Dead ends: walls on every open front edge (they cover whole rooms); a wall drawn behind doors (the
  ridge doubles); odd corridor widths (a two-cell door can't be centred); widening the centre
  corridor (Bay Alpha's and Bay Beta's doors are four cells apart, so it hits the storage rooms).
