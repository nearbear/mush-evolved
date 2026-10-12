// DOM renderer for one room of the original isometric ship. Every sprite is
// an absolutely positioned div cropped from its atlas; DOM order is paint
// order. Presentational only: doors emit move intents, and people and
// equipment emit a selection; legality comes from props.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { placedEquipment, type CharacterId, type EquipmentView, type RoomId, type ShipLayout, type Target } from "@mush2/shared";
import { sameTarget } from "../hud/targets.ts";
import { CrewSprite } from "../scene/CrewSprite.tsx";
import { roomLabel } from "../scene/names.ts";
import { atlasUrl } from "./shipLayout.ts";
import { bounds, fitScale, placeRoom, spreadActors, walkableCells } from "./placement.ts";

export interface Occupant {
  id: string;
  name: string;
  isBot: boolean;
  character: CharacterId | undefined;
  you: boolean;
}

/** Largest box the room is scaled to fit on desktop. Whole-number scales keep pixels crisp. */
const MAX_W = 880;
const MAX_H = 520;

export function IsoRoom({
  layout,
  room,
  occupants,
  equipment,
  reachable,
  selected,
  selectedDoor,
  fillPanel,
  onMove,
  onSelect,
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
  /**
   * Phone layout: fit the panel's measured height too, and never shrink below
   * 1x (pixel art breaks and doors get too small to tap); wide rooms scroll.
   */
  fillPanel: boolean;
  onMove: (to: RoomId) => void;
  onSelect: (target: Target) => void;
  /** A single click or tap on any door, reachable or not. */
  onDoorTap: (to: RoomId) => void;
}) {
  const roomLayout = layout.rooms.find((r) => r.id === room);
  const occupantKey = occupants.map((o) => o.id).join(",");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: MAX_W, height: MAX_H });

  // Measure the space the room can use. A hidden panel measures 0; keep the last size then.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width > 0 && height > 0) setSpace({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [roomLayout]);

  const { sprites, box } = useMemo(() => {
    if (!roomLayout) return { sprites: [], box: bounds([]) };
    const spots = spreadActors(walkableCells(layout, roomLayout), occupants.length);
    const actors = occupants.map((o, i) => ({ id: o.id, cell: spots[i] ?? { x: 0, y: 0 }, width: 32, height: 48 }));
    const sprites = placeRoom(layout, roomLayout, actors);
    return { sprites, box: bounds(sprites) };
    // occupantKey stands in for occupants: positions only change when who is here changes.
  }, [layout, roomLayout, occupantKey]);

  // On desktop the section is sized by its content, so only its width is a real limit.
  const scale =
    (fillPanel
      ? fitScale(box, space.width, space.height, { minScale: 1 })
      : fitScale(box, Math.min(MAX_W, space.width), MAX_H)) ?? 1;

  // A room wider than the panel scrolls; start centred on yourself.
  const youSprite = sprites.find((s) => s.kind === "actor" && occupants.some((o) => o.you && o.id === s.key.slice(2)));
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !youSprite) return;
    const viewport = el.querySelector<HTMLElement>(".iso-viewport");
    const x = (viewport?.offsetLeft ?? 0) + (youSprite.left - box.minX + youSprite.width / 2) * scale;
    const y = (viewport?.offsetTop ?? 0) + (youSprite.top - box.minY + youSprite.height / 2) * scale;
    el.scrollLeft = x - el.clientWidth / 2;
    el.scrollTop = y - el.clientHeight / 2;
    // Only when the room or scale changes, not when someone walks in.
  }, [room, scale]);

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

  if (!roomLayout) return <section className="iso-room missing">No map for {roomLabel(room)}</section>;
  const byId = new Map(occupants.map((o) => [o.id, o]));
  const isSelected = (kind: Target["kind"], id: string) => sameTarget(selected, { kind, id } as Target);

  return (
    <section className="iso-room">
      <h2 className="room-title">{roomLabel(room)}</h2>
      {/* The scroller is separate so the title stays put when a wide room scrolls. */}
      <div className="iso-scroll" ref={scrollRef}>
        <div className="iso-viewport" style={{ width: box.width * scale, height: box.height * scale }}>
          <div className="iso-layer" style={{ transform: `scale(${scale})` }}>
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
                    className={`iso-actor${o.you ? " you" : ""}${isSelected("player", o.id) ? " selected" : ""}`}
                    style={style}
                    role="button"
                    aria-label={`Inspect ${o.name}`}
                    onClick={() => onSelect({ kind: "player", id: o.id })}
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
              return (
                <div
                  key={s.key}
                  className={`iso-sprite${doorClass}${canGo ? " reachable" : ""}${eqClass}`}
                  style={{
                    ...style,
                    backgroundImage: `url(${atlasUrl(layout, s.sheet)})`,
                    backgroundPosition: `${-s.sx}px ${-s.sy}px`,
                    transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
                  }}
                  title={door ? `${roomLabel(door.target)}${canGo ? " (double-click to go)" : ""}` : eq?.name}
                  {...(eq && { role: "button", "aria-label": `Inspect ${eq.name}` })}
                  {...(door && { role: "button", "aria-label": `Door to ${roomLabel(door.target)}` })}
                  onClick={door ? () => onDoorTap(door.target) : eq ? () => onSelect({ kind: "equipment", id: eq.id }) : undefined}
                  onDoubleClick={door && canGo ? () => onMove(door.target) : undefined}
                />
              );
            })}
          </div>
          {/* Name tags sit outside the scaled layer so text stays sharp. */}
          {sprites
            .filter((s) => s.kind === "actor")
            .map((s) => {
              const o = byId.get(s.key.slice(2))!;
              return (
                <div
                  key={`tag:${s.key}`}
                  className={`iso-tag${o.you ? " you" : ""}${isSelected("player", o.id) ? " selected" : ""}`}
                  onClick={() => onSelect({ kind: "player", id: o.id })}
                  style={{ left: (s.left - box.minX + s.width / 2) * scale, top: (s.top - box.minY) * scale }}
                  title={o.name}
                >
                  {o.name}
                  {o.isBot && <span className="tag">AI</span>}
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}
