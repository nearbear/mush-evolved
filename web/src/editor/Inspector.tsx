// The editor's inspector: what is selected (a tile, its room, or a room on its own from the hierarchy),
// with the edits that apply to it. Every edit here also has a key (ShipEditor) and a menu item.

import type { PlacedEquipment, RoomLayout, ShipMap, TilePlacement } from "@mush2/shared";
import { ARROWS, type TileAt } from "./edits.ts";

const PAD = { ArrowLeft: "↖", ArrowUp: "↗", ArrowDown: "↙", ArrowRight: "↘" } as const;

export interface InspectorEdits {
  move: (dx: number, dy: number) => void;
  remove: () => void;
  duplicate: () => void;
  frame: (step: number) => void;
  rotate: () => void;
  toRoom: (room: string) => void;
  doorTo: (room: string) => void;
  moveRoom: (dx: number, dy: number) => void;
}

export const isSofa = (t: TilePlacement) => t.slice === "sofa" || t.slice === "sofaReverse";

function Pad({ label, onMove }: { label: string; onMove: (dx: number, dy: number) => void }) {
  return (
    <div className="editor-pad" role="group" aria-label={label}>
      {(Object.keys(PAD) as (keyof typeof PAD)[]).map((k) => (
        <button key={k} type="button" aria-label={`${label} ${ARROWS[k]!.label}`} onClick={() => onMove(ARROWS[k]!.dx, ARROWS[k]!.dy)}>
          {PAD[k]}
        </button>
      ))}
    </div>
  );
}

export function Inspector({
  map,
  sel,
  tile,
  room,
  equipment,
  stack,
  focusRoom,
  planRooms,
  edit,
}: {
  map: ShipMap;
  sel: TileAt | null;
  tile: TilePlacement | null;
  room: RoomLayout | null;
  equipment: PlacedEquipment | undefined;
  /** Where the selection is in what was under the last click, when that was more than one thing. */
  stack: { at: number; of: number } | null;
  focusRoom: RoomLayout | undefined;
  planRooms: string[];
  edit: InspectorEdits;
}) {
  return (
    <section className="editor-pane editor-inspector" aria-label="Inspector">
      <header className="editor-pane-head">
        <h2>Inspector</h2>
      </header>
      <div className="editor-pane-body">
        {!sel || !tile || !room ? (
          !focusRoom && <p className="muted">Nothing selected. Click a tile in the view or pick one in the hierarchy; Tab steps through everything under a click.</p>
        ) : (
          <section className="editor-component">
            <h3>Tile</h3>
            <dl>
              <dt>Tile</dt>
              <dd>
                {sel.room} #{sel.index}
                {stack && ` (${stack.at + 1} of ${stack.of} here)`}
              </dd>
              <dt>Slice</dt>
              <dd>{tile.slice}</dd>
              <dt>Frame</dt>
              <dd className="editor-inline">
                <button type="button" aria-label="Previous frame" onClick={() => edit.frame(-1)}>
                  −
                </button>
                <span>{tile.frame}</span>
                <button type="button" aria-label="Next frame" onClick={() => edit.frame(1)}>
                  +
                </button>
              </dd>
              <dt>Kind</dt>
              <dd>
                {tile.kind}, layer {tile.layer}
              </dd>
              <dt>Cell</dt>
              <dd>
                {tile.x + (room.at?.x ?? 0)}, {tile.y + (room.at?.y ?? 0)} (room cell {tile.x}, {tile.y})
              </dd>
              {equipment && (
                <>
                  <dt>Equipment</dt>
                  <dd>
                    {equipment.id} ({equipment.type})
                  </dd>
                </>
              )}
              <dt>Room</dt>
              <dd>
                <select aria-label="Belongs to room" value={sel.room} onChange={(e) => edit.toRoom(e.target.value)} disabled={!room.at}>
                  {planRooms.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </dd>
              {tile.kind === "door" && (
                <>
                  <dt>Door to</dt>
                  <dd>
                    <select aria-label="Door to" value={tile.door?.target ?? ""} onChange={(e) => edit.doorTo(e.target.value)}>
                      <option value="">(none)</option>
                      {map.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id}
                        </option>
                      ))}
                    </select>
                  </dd>
                </>
              )}
            </dl>
            <Pad label="Move" onMove={edit.move} />
            <div className="editor-row">
              {isSofa(tile) && (
                <button type="button" onClick={edit.rotate}>
                  Rotate
                </button>
              )}
              <button type="button" onClick={edit.duplicate}>
                Duplicate
              </button>
              <button type="button" onClick={edit.remove}>
                Delete
              </button>
            </div>
          </section>
        )}
        {focusRoom && (
          <section className="editor-component">
            <h3>Room</h3>
            <dl>
              <dt>Room</dt>
              <dd>{focusRoom.id}</dd>
              <dt>Label</dt>
              <dd>{focusRoom.label}</dd>
              <dt>On the plan</dt>
              <dd>{focusRoom.at ? `at ${focusRoom.at.x}, ${focusRoom.at.y}` : "no (not drawn)"}</dd>
              <dt>Tiles</dt>
              <dd>{focusRoom.tiles.length}</dd>
            </dl>
            {focusRoom.at && <Pad label="Move room" onMove={edit.moveRoom} />}
          </section>
        )}
      </div>
    </section>
  );
}
