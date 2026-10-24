// The editor's hierarchy, as in a game engine's scene editor: every room, then its tiles grouped by layer
// (floor, walls, doors, props, furniture), with rooms off the plan greyed at the bottom. Picking a row
// selects that room or tile; the eye on a room or a layer group hides it in the view. The selected tile's
// room and layer open by themselves, and its row scrolls into view.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ShipMap, TilePlacement } from "@mush2/shared";
import type { TileAt } from "./edits.ts";
import { LAYERS, type Layer } from "./shipScene.ts";

export const LAYER_NAMES: Record<Layer, string> = { ground: "Floor", wall: "Walls", door: "Doors", prop: "Props", entity: "Furniture and fittings" };

/** What a hidden-set entry is for a room, or for one layer of it. */
export const hideKey = (room: string, layer?: Layer) => (layer ? `${room}/${layer}` : room);

export function Hierarchy({
  map,
  selected,
  roomSel,
  hidden,
  onToggleHidden,
  onSelectTile,
  onSelectRoom,
}: {
  map: ShipMap;
  selected: TileAt | null;
  roomSel: string | null;
  hidden: ReadonlySet<string>;
  onToggleHidden: (key: string) => void;
  onSelectTile: (at: TileAt) => void;
  onSelectRoom: (id: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const toggle = (key: string) => {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    setOpen(next);
  };

  // The selected tile's room and layer open, and its row comes into view.
  const selKind = selected && map.rooms.find((r) => r.id === selected.room)?.tiles[selected.index]?.kind;
  useEffect(() => {
    if (!selected || !selKind) return;
    setOpen((o) => (o.has(selected.room) && o.has(hideKey(selected.room, selKind)) ? o : new Set([...o, selected.room, hideKey(selected.room, selKind)])));
  }, [selected, selKind]);
  // Scrolled to once per new selection, after its groups have opened, not on every render.
  const selRow = useRef<HTMLLIElement>(null);
  const toScroll = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection changes, to mark it for scrolling.
  useEffect(() => {
    toScroll.current = true;
  }, [selected?.room, selected?.index]);
  useEffect(() => {
    if (!toScroll.current || !selRow.current) return;
    toScroll.current = false;
    selRow.current.scrollIntoView({ block: "nearest" });
  });

  const rooms = useMemo(
    () =>
      [...map.rooms]
        .sort((a, b) => Number(!a.at) - Number(!b.at) || a.id.localeCompare(b.id))
        .map((room) => {
          const groups = LAYERS.map((layer) => ({
            layer,
            tiles: room.tiles.flatMap((tile, index) => (tile.kind === layer && (!q || tile.slice.toLowerCase().includes(q)) ? [{ tile, index }] : [])),
          })).filter((g) => g.tiles.length > 0);
          const named = !q || room.id.toLowerCase().includes(q) || room.label.toLowerCase().includes(q);
          return { room, groups, show: named || groups.length > 0 };
        })
        .filter((r) => r.show),
    [map, q],
  );

  // While searching, everything that matched is open.
  const isOpen = (key: string) => (q ? true : open.has(key));
  const eye = (key: string, name: string, under = false) => (
    <button
      type="button"
      className={`eye${hidden.has(key) ? " off" : ""}`}
      aria-pressed={!hidden.has(key)}
      aria-label={`Show ${name}`}
      disabled={under}
      onClick={() => onToggleHidden(key)}
    >
      {hidden.has(key) ? "–" : "●"}
    </button>
  );
  const caret = (key: string, name: string) => (
    <button type="button" className="caret" aria-label={`${isOpen(key) ? "Collapse" : "Expand"} ${name}`} onClick={() => toggle(key)}>
      {isOpen(key) ? "▾" : "▸"}
    </button>
  );
  const tileName = (t: TilePlacement) => `${t.slice}${t.frame ? ` [${t.frame}]` : ""}`;

  return (
    <section className="editor-pane editor-hierarchy" aria-label="Hierarchy">
      <header className="editor-pane-head">
        <h2>Hierarchy</h2>
      </header>
      <input type="search" placeholder="Search rooms and slices" aria-label="Search the hierarchy" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="editor-tree" role="tree" aria-label="Rooms">
        {rooms.map(({ room, groups }) => {
          const roomHidden = hidden.has(room.id);
          return (
            <li
              key={room.id}
              role="treeitem"
              aria-expanded={isOpen(room.id)}
              aria-selected={roomSel === room.id && !selected}
              className={room.at ? undefined : "off-plan"}
            >
              <div className={`row room${roomSel === room.id ? (selected ? " in" : " on") : ""}`}>
                {caret(room.id, room.id)}
                <button type="button" className="name" onClick={() => onSelectRoom(room.id)}>
                  {room.id}
                  <span className="muted"> {room.at ? room.tiles.length : "off the plan"}</span>
                </button>
                {room.at && eye(room.id, room.id)}
              </div>
              {isOpen(room.id) && (
                <ul role="group">
                  {groups.map(({ layer, tiles }) => {
                    const key = hideKey(room.id, layer);
                    return (
                      <li key={layer} role="treeitem" aria-expanded={isOpen(key)} aria-selected={false}>
                        <div className="row group">
                          {caret(key, `${room.id} ${LAYER_NAMES[layer]}`)}
                          <button type="button" className="name" onClick={() => toggle(key)}>
                            {LAYER_NAMES[layer]}
                            <span className="muted"> {tiles.length}</span>
                          </button>
                          {room.at && eye(key, `${room.id} ${LAYER_NAMES[layer]}`, roomHidden)}
                        </div>
                        {isOpen(key) && (
                          <ul role="group">
                            {tiles.map(({ tile, index }) => {
                              const on = selected?.room === room.id && selected.index === index;
                              return (
                                <li key={index} role="treeitem" aria-selected={on} ref={on ? selRow : undefined}>
                                  <button type="button" className={`row tile${on ? " on" : ""}`} onClick={() => onSelectTile({ room: room.id, index })}>
                                    <span className="name">{tileName(tile)}</span>
                                    <span className="muted">
                                      {tile.x},{tile.y}
                                      {tile.door && ` → ${tile.door.target || "?"}`}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
