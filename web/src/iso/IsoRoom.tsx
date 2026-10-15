// DOM renderer for one room of the original isometric ship. Every sprite is
// an absolutely positioned div cropped from its atlas; DOM order is paint
// order. Presentational only: doors emit move intents, and people and
// equipment emit a selection; legality comes from props.
//
// Sprites don't take pointer events themselves: their boxes overlap a lot.
// The viewport hit-tests against the pixels actually drawn (hitTest + hitMask),
// so a click lands on whatever is visibly under the pointer.
//
// The rooms behind the doors are drawn dimmed around this one, in one paint
// order with it (placeScene), so a neighbour in front covers this room and
// one behind is covered by it; only people in this room are never covered.
// They show only what the view already gives you: their fixed scenery, and
// the people the view places there (everyone while ACTOPI is on, nobody
// while it's off). Clicking one counts as clicking its door.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { placedEquipment, type CharacterId, type EquipmentView, type RoomId, type ShipLayout, type Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { spriteStrip } from "../art/assets.ts";
import { CrewSprite } from "../scene/CrewSprite.tsx";
import { roomLabel } from "../scene/names.ts";
import { atlasUrl } from "./shipLayout.ts";
import { opaqueAt, preloadImage } from "./hitMask.ts";
import {
  bounds,
  cameraOffset,
  cellAtPoint,
  hitTest,
  neighborRooms,
  placeScene,
  spreadActors,
  standSpot,
  walkableCells,
  type PlacedSprite,
} from "./placement.ts";

export interface Occupant {
  id: string;
  name: string;
  isBot: boolean;
  character: CharacterId | undefined;
  you: boolean;
}

export function IsoRoom({
  layout,
  room,
  occupants,
  nearby,
  equipment,
  reachable,
  selected,
  selectedDoor,
  onMove,
  onSelect,
  onClear,
  onDoorTap,
}: {
  layout: ShipLayout;
  room: RoomId;
  occupants: Occupant[];
  /** People the view places in other rooms, by room. Only the rooms behind this room's doors are drawn. */
  nearby: Partial<Record<RoomId, Occupant[]>>;
  /** Equipment in this room, from the view. Only these sprites are clickable. */
  equipment: EquipmentView[];
  reachable: Set<RoomId>;
  selected: Target | null;
  /** The door whose target is shown in the peek bar, if any. */
  selectedDoor: RoomId | null;
  onMove: (to: RoomId) => void;
  onSelect: (target: Target) => void;
  /** Bare floor was tapped: drop the selection (and any peeked door). */
  onClear: () => void;
  /** A single click or tap on any door, reachable or not. */
  onDoorTap: (to: RoomId) => void;
}) {
  const roomLayout = layout.rooms.find((r) => r.id === room);
  const occupantKey = occupants.map((o) => o.id).join(",");
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  // Where you've clicked to walk. Client-only and cosmetic: the server never hears of it,
  // and it resets when you change rooms.
  const [walk, setWalk] = useState<{ room: RoomId; cell: { x: number; y: number } } | null>(null);
  const myCell = walk?.room === room ? walk.cell : null;
  const cells = useMemo(() => (roomLayout ? walkableCells(layout, roomLayout) : []), [layout, roomLayout]);

  // This room and the rooms behind its doors, each with its people, drawn as one scene so that
  // whichever is in front covers the other. Display only: where people stand isn't game state.
  const nearbyKey = JSON.stringify(Object.entries(nearby).map(([r, os]) => [r, os?.map((o) => o.id)]));
  // biome-ignore lint/correctness/useExhaustiveDependencies: occupantKey and nearbyKey stand in for occupants and nearby: positions only change when who is where changes.
  const { scene, sprites, neighborSprites, neighbors, box } = useMemo(() => {
    if (!roomLayout) return { scene: [], sprites: [], neighborSprites: [], neighbors: [], box: bounds([]) };
    const spots = spreadActors(cells, occupants.length);
    const actors = occupants.map((o, i) => ({
      id: o.id,
      cell: (o.you && myCell) || spots[i] || { x: 0, y: 0 },
      width: 32,
      height: 48,
    }));
    const neighbors = neighborRooms(layout, roomLayout).map(({ room: n, dx, dy }) => {
      const people = nearby[n.id as RoomId] ?? [];
      const spots = spreadActors(walkableCells(layout, n), people.length);
      const actors = people.map((o, i) => ({ id: o.id, cell: spots[i] ?? { x: 0, y: 0 }, width: 32, height: 48 }));
      return { room: n, dx, dy, actors, id: n.id as RoomId, people };
    });
    const scene = placeScene(layout, [{ room: roomLayout, dx: 0, dy: 0, actors }, ...neighbors]);
    // Both in paint order, for hit-testing this room before its neighbours.
    const sprites = scene.filter((s) => s.room === room);
    const neighborSprites = scene.filter((s) => s.room !== room);
    return { scene, sprites, neighborSprites, neighbors, box: bounds(sprites) };
  }, [layout, roomLayout, cells, myCell, occupantKey, nearbyKey]);

  // Sprites draw at exactly one screen pixel per source pixel, so art stays crisp.
  // The camera always follows you: there is no manual panning, and it stops at this room's edges
  // (the neighbours only fill the space around a room smaller than the panel). It moves the world
  // with a transform rather than scrolling, because the neighbours would widen the scroll range.
  const youSprite = sprites.find((s) => s.kind === "actor" && occupants.some((o) => o.you && o.id === s.key.slice(2)));
  const youX = youSprite ? youSprite.left - box.minX + youSprite.width / 2 : box.width / 2;
  const youY = youSprite ? youSprite.top - box.minY + youSprite.height / 2 : box.height / 2;
  const [panel, setPanel] = useState({ width: 0, height: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomLayout is a trigger: the viewport only exists once the room has a layout.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanel({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [roomLayout]);
  const camX = Math.round(cameraOffset(panel.width, box.width, youX));
  const camY = Math.round(cameraOffset(panel.height, box.height, youY));
  // Jump when entering a room; glide when walking inside it.
  const [settled, setSettled] = useState<RoomId | null>(null);
  useEffect(() => setSettled(room), [room]);
  const glide = settled === room;

  // Sprite key ("t<tile index>") -> the equipment it draws.
  const equipmentByKey = useMemo(() => {
    const names = new Map(equipment.map((e) => [e.id, e]));
    return new Map(
      (roomLayout ? placedEquipment(roomLayout) : []).flatMap((p) => {
        const e = names.get(p.id);
        return e ? [[`t${p.tile}` as string, e] as const] : [];
      }),
    );
  }, [roomLayout, equipment]);

  const byId = new Map([...occupants, ...neighbors.flatMap((n) => n.people)].map((o) => [o.id, o]));
  /** The image a sprite's pixels come from, and whether its background is color-keyed. */
  const source = (s: PlacedSprite): { url: string | undefined; keyed: boolean } =>
    s.kind === "actor"
      ? { url: spriteStrip(byId.get(s.key.slice(2))?.character, "face"), keyed: true }
      : { url: atlasUrl(layout, s.sheet), keyed: false };

  // Load every image this room hit-tests against, so masks are ready by the first click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-preload only when the sprite set changes; `source` is rebuilt every render.
  useEffect(() => {
    for (const s of scene) {
      const url = source(s).url;
      if (url) preloadImage(url);
    }
  }, [scene]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);

  if (!roomLayout) return <section className="iso-room missing">No map for {roomLabel(room)}</section>;
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);

  /** What a sprite does when clicked, or null for scenery. */
  const interaction = (s: PlacedSprite) => {
    if (s.kind === "actor") {
      const o = byId.get(s.key.slice(2));
      return o ? { kind: "person" as const, person: o, title: o.name } : null;
    }
    if (s.door) return { kind: "door" as const, to: s.door.target, title: roomLabel(s.door.target) };
    const eq = equipmentByKey.get(s.key);
    return eq ? { kind: "equipment" as const, equipment: eq, title: eq.name } : null;
  };

  /**
   * The interactive sprite visibly under the pointer, if any. Scenery in front blocks what's behind it.
   * This room takes clicks before its neighbours, even where a neighbour's wall is drawn over it, so
   * its floor stays walkable. Any visible part of a neighbour counts as its door.
   */
  const pick = (e: MouseEvent<HTMLElement>) => {
    const rect = worldRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) + box.minX;
    const y = (e.clientY - rect.top) + box.minY;
    const opaque = (s: PlacedSprite, px: number, py: number) => {
      const { url, keyed } = source(s);
      return !url || opaqueAt(url, s.kind === "actor" ? { sx: 0, sy: 0, width: 32, height: 48 } : s, px, py, keyed);
    };
    const hit = hitTest(sprites, x, y, opaque);
    if (hit) {
      const action = interaction(hit);
      return action ? { sprite: hit, key: hit.key, ...action } : null;
    }
    const behind = hitTest(neighborSprites, x, y, opaque);
    if (!behind) return null;
    const to = behind.room as RoomId;
    return { sprite: behind, key: `n:${to}`, kind: "door" as const, to, title: roomLabel(to) };
  };

  /** Room-pixel point under the pointer, for walking. */
  const pointIn = (e: MouseEvent<HTMLElement>) => {
    const rect = worldRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left + box.minX, y: e.clientY - rect.top + box.minY };
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const hit = pick(e);
    if (hit?.kind === "person") onSelect({ kind: "player", id: hit.person.id });
    else if (hit?.kind === "equipment") {
      onSelect({ kind: "equipment", id: hit.equipment.id });
      // Step up to it too (cosmetic, like walking on bare floor).
      const cell = standSpot(layout, roomLayout, Number(hit.sprite.key.slice(1)), cells);
      if (cell) setWalk({ room, cell });
    }
    else if (hit?.kind === "door") onDoorTap(hit.to);
    else {
      // Bare floor (or scenery): clear the selection and walk there; the camera follows, revealing doors off-panel.
      onClear();
      const at = pointIn(e);
      const cell = cellAtPoint(cells, at.x, at.y);
      if (cell) setWalk({ room, cell });
    }
  };
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const hit = pick(e);
    if (hit?.kind === "door" && reachable.has(hit.to)) onMove(hit.to);
  };
  // Hover feedback only for real pointers; touch has no hover.
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const key = pick(e)?.key ?? null;
    if (key !== hoverKey) setHoverKey(key);
  };
  const hovered = sprites.find((s) => s.key === hoverKey);
  const hoveredNeighbor = neighbors.find((n) => `n:${n.id}` === hoverKey);
  const hoverTitle = hoveredNeighbor ? roomLabel(hoveredNeighbor.id) : hovered && interaction(hovered)?.title;
  const spriteStyle = (s: PlacedSprite) => ({
    ...place(s),
    backgroundImage: `url(${atlasUrl(layout, s.sheet)})`,
    backgroundPosition: `${-s.sx}px ${-s.sy}px`,
    transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
  });
  const place = (s: PlacedSprite) => ({ left: s.left - box.minX, top: s.top - box.minY, width: s.width, height: s.height });

  return (
    <section className="iso-room">
      <h2 className="room-title">{roomLabel(room)}</h2>
      {/* The scroller is separate so the title stays put when a wide room scrolls. */}
      <div className="iso-scroll">
        <div
          ref={viewportRef}
          className={`iso-viewport${hoverTitle ? " pointing" : ""}`}
          title={hoverTitle}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverKey(null)}
        >
          <div
            ref={worldRef}
            className={`iso-world${glide ? " glide" : ""}`}
            style={{ width: box.width, height: box.height, transform: `translate(${camX}px, ${camY}px)` }}
          >
            <div className="iso-layer">
              {scene.map((s) => {
                if (s.room !== room) {
                  const n = s.room as RoomId;
                  const state = `neighbor${reachable.has(n) ? " reachable" : ""}${n === selectedDoor ? " selected" : ""}${
                    `n:${n}` === hoverKey ? " hover" : ""
                  }`;
                  return s.kind === "actor" ? (
                    <div key={s.key} className={`iso-actor ${state}`} style={place(s)}>
                      <CrewSprite character={byId.get(s.key.slice(2))?.character} />
                    </div>
                  ) : (
                    <div key={s.key} className={`iso-sprite ${state}`} style={spriteStyle(s)} />
                  );
                }
                if (s.kind === "actor") {
                  const o = byId.get(s.key.slice(2))!;
                  return (
                    <div
                      key={s.key}
                      className={`iso-actor${o.you ? " you" : ""}${isSelected("player", o.id) ? " selected" : ""}${s.key === hoverKey ? " hover" : ""}`}
                      style={place(s)}
                    >
                      <CrewSprite character={o.character} />
                    </div>
                  );
                }
                const door = s.door;
                const canGo = door ? reachable.has(door.target) : false;
                const eq = equipmentByKey.get(s.key);
                const eqClass = eq ? ` equipment${isSelected("equipment", eq.id) ? " selected" : ""}` : "";
                const doorClass = door ? ` door${door.target === selectedDoor ? " selected" : ""}` : "";
                const hoverClass = s.key === hoverKey ? " hover" : "";
                return <div key={s.key} className={`iso-sprite${doorClass}${canGo ? " reachable" : ""}${eqClass}${hoverClass}`} style={spriteStyle(s)} />;
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
