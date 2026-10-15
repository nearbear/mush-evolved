// DOM renderer for one room of the original isometric ship. Every sprite is
// an absolutely positioned div cropped from its atlas; DOM order is paint
// order. Presentational only: doors emit move intents, and people and
// equipment emit a selection; legality comes from props.
//
// Sprites don't take pointer events themselves: their boxes overlap a lot.
// The viewport hit-tests against the pixels actually drawn (hitTest + hitMask),
// so a click lands on whatever is visibly under the pointer.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { placedEquipment, type CharacterId, type EquipmentView, type RoomId, type ShipLayout, type Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { spriteStrip } from "../art/assets.ts";
import { CrewSprite } from "../scene/CrewSprite.tsx";
import { roomLabel } from "../scene/names.ts";
import { atlasUrl } from "./shipLayout.ts";
import { opaqueAt, preloadImage } from "./hitMask.ts";
import { bounds, cellAtPoint, hitTest, placeRoom, spreadActors, standSpot, walkableCells, type PlacedSprite } from "./placement.ts";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  // Where you've clicked to walk. Client-only and cosmetic: the server never hears of it,
  // and it resets when you change rooms.
  const [walk, setWalk] = useState<{ room: RoomId; cell: { x: number; y: number } } | null>(null);
  const myCell = walk?.room === room ? walk.cell : null;
  const cells = useMemo(() => (roomLayout ? walkableCells(layout, roomLayout) : []), [layout, roomLayout]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: occupantKey stands in for occupants (see comment below).
  const { sprites, box } = useMemo(() => {
    if (!roomLayout) return { sprites: [], box: bounds([]) };
    const spots = spreadActors(cells, occupants.length);
    const actors = occupants.map((o, i) => ({
      id: o.id,
      cell: (o.you && myCell) || spots[i] || { x: 0, y: 0 },
      width: 32,
      height: 48,
    }));
    const sprites = placeRoom(layout, roomLayout, actors);
    return { sprites, box: bounds(sprites) };
    // occupantKey stands in for occupants: positions only change when who is here changes.
  }, [layout, roomLayout, cells, myCell, occupantKey]);

  // Sprites draw at exactly one screen pixel per source pixel, so art stays crisp.
  // The camera always follows you: there is no manual panning (the scroller is overflow: hidden),
  // and the browser's scroll clamping stops it at the room's edges.
  const youSprite = sprites.find((s) => s.kind === "actor" && occupants.some((o) => o.you && o.id === s.key.slice(2)));
  const youX = youSprite ? youSprite.left - box.minX + youSprite.width / 2 : null;
  const youY = youSprite ? youSprite.top - box.minY + youSprite.height / 2 : null;
  const lastRoom = useRef<RoomId | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || youX === null || youY === null) return;
    const follow = (behavior: ScrollBehavior) => {
      const viewport = el.querySelector<HTMLElement>(".iso-viewport");
      el.scrollTo({
        left: (viewport?.offsetLeft ?? 0) + youX - el.clientWidth / 2,
        top: (viewport?.offsetTop ?? 0) + youY - el.clientHeight / 2,
        behavior,
      });
    };
    // Jump when entering a room; glide when walking inside it.
    follow(lastRoom.current === room ? "smooth" : "instant");
    lastRoom.current = room;
    const resize = new ResizeObserver(() => follow("instant"));
    resize.observe(el);
    return () => resize.disconnect();
  }, [room, youX, youY]);

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

  const byId = new Map(occupants.map((o) => [o.id, o]));
  /** The image a sprite's pixels come from, and whether its background is color-keyed. */
  const source = (s: PlacedSprite): { url: string | undefined; keyed: boolean } =>
    s.kind === "actor"
      ? { url: spriteStrip(byId.get(s.key.slice(2))?.character, "face"), keyed: true }
      : { url: atlasUrl(layout, s.sheet), keyed: false };

  // Load every image this room hit-tests against, so masks are ready by the first click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-preload only when the sprite set changes; `source` is rebuilt every render.
  useEffect(() => {
    for (const s of sprites) {
      const url = source(s).url;
      if (url) preloadImage(url);
    }
  }, [sprites]);

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

  /** The interactive sprite visibly under the pointer, if any. Scenery in front blocks what's behind it. */
  const pick = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) + box.minX;
    const y = (e.clientY - rect.top) + box.minY;
    const hit = hitTest(sprites, x, y, (s, px, py) => {
      const { url, keyed } = source(s);
      return !url || opaqueAt(url, s.kind === "actor" ? { sx: 0, sy: 0, width: 32, height: 48 } : s, px, py, keyed);
    });
    const action = hit && interaction(hit);
    return hit && action ? { sprite: hit, ...action } : null;
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
      const rect = e.currentTarget.getBoundingClientRect();
      const cell = cellAtPoint(cells, e.clientX - rect.left + box.minX, e.clientY - rect.top + box.minY);
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
    const key = pick(e)?.sprite.key ?? null;
    if (key !== hoverKey) setHoverKey(key);
  };
  const hovered = sprites.find((s) => s.key === hoverKey);
  const hoverTitle = hovered && interaction(hovered)?.title;

  return (
    <section className="iso-room">
      <h2 className="room-title">{roomLabel(room)}</h2>
      {/* The scroller is separate so the title stays put when a wide room scrolls. */}
      <div className="iso-scroll" ref={scrollRef}>
        <div
          className={`iso-viewport${hovered ? " pointing" : ""}`}
          style={{ width: box.width, height: box.height }}
          title={hoverTitle}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverKey(null)}
        >
          <div className="iso-layer">
            {sprites.map((s) => {
              const style = {
                left: s.left - box.minX,
                top: s.top - box.minY,
                width: s.width,
                height: s.height,
              };
              if (s.kind === "actor") {
                const o = byId.get(s.key.slice(2))!;
                return (
                  <div
                    key={s.key}
                    className={`iso-actor${o.you ? " you" : ""}${isSelected("player", o.id) ? " selected" : ""}${s.key === hoverKey ? " hover" : ""}`}
                    style={style}
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
              return (
                <div
                  key={s.key}
                  className={`iso-sprite${doorClass}${canGo ? " reachable" : ""}${eqClass}${hoverClass}`}
                  style={{
                    ...style,
                    backgroundImage: `url(${atlasUrl(layout, s.sheet)})`,
                    backgroundPosition: `${-s.sx}px ${-s.sy}px`,
                    transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
