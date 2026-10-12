// DOM renderer for one room of the original isometric ship. Every sprite is
// an absolutely positioned div cropped from its atlas; DOM order is paint
// order. Presentational only: doors emit move intents and people emit a
// selection; legality comes from props.

import { useMemo } from "react";
import type { CharacterId, RoomId, ShipLayout } from "@mush2/shared";
import { CrewSprite } from "../scene/CrewSprite.tsx";
import { roomLabel } from "../scene/names.ts";
import { atlasUrl } from "./shipLayout.ts";
import { bounds, placeRoom, spreadActors, walkableCells } from "./placement.ts";

export interface Occupant {
  id: string;
  name: string;
  isBot: boolean;
  character: CharacterId | undefined;
  you: boolean;
}

/** Largest box the room is scaled to fit. Whole-number scales keep pixels crisp. */
const MAX_W = 880;
const MAX_H = 520;

export function IsoRoom({
  layout,
  room,
  occupants,
  reachable,
  selectedId,
  onMove,
  onSelect,
}: {
  layout: ShipLayout;
  room: RoomId;
  occupants: Occupant[];
  reachable: Set<RoomId>;
  selectedId: string | null;
  onMove: (to: RoomId) => void;
  onSelect: (playerId: string) => void;
}) {
  const roomLayout = layout.rooms.find((r) => r.id === room);
  const occupantKey = occupants.map((o) => o.id).join(",");

  const { sprites, box, scale } = useMemo(() => {
    if (!roomLayout) return { sprites: [], box: bounds([]), scale: 1 };
    const spots = spreadActors(walkableCells(layout, roomLayout), occupants.length);
    const actors = occupants.map((o, i) => ({ id: o.id, cell: spots[i] ?? { x: 0, y: 0 }, width: 32, height: 48 }));
    const sprites = placeRoom(layout, roomLayout, actors);
    const box = bounds(sprites);
    const fit = Math.min(MAX_W / box.width, MAX_H / box.height);
    return { sprites, box, scale: fit >= 1 ? Math.min(3, Math.floor(fit)) : fit };
    // occupantKey stands in for occupants: positions only change when who is here changes.
  }, [layout, roomLayout, occupantKey]);

  if (!roomLayout) return <section className="iso-room missing">No map for {roomLabel(room)}</section>;
  const byId = new Map(occupants.map((o) => [o.id, o]));

  return (
    <section className="iso-room">
      <h2 className="room-title">{roomLabel(room)}</h2>
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
                  className={`iso-actor${o.you ? " you" : ""}${o.id === selectedId ? " selected" : ""}`}
                  style={style}
                  role="button"
                  aria-label={`Inspect ${o.name}`}
                  onClick={() => onSelect(o.id)}
                >
                  <CrewSprite character={o.character} />
                </div>
              );
            }
            const door = s.door;
            const canGo = door ? reachable.has(door.target) : false;
            return (
              <div
                key={s.key}
                className={`iso-sprite${door ? " door" : ""}${canGo ? " reachable" : ""}`}
                style={{
                  ...style,
                  backgroundImage: `url(${atlasUrl(layout, s.sheet)})`,
                  backgroundPosition: `${-s.sx}px ${-s.sy}px`,
                  transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
                }}
                title={door ? `${roomLabel(door.target)}${canGo ? " (double-click to go)" : ""}` : undefined}
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
                className={`iso-tag${o.you ? " you" : ""}${o.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(o.id)}
                style={{ left: (s.left - box.minX + s.width / 2) * scale, top: (s.top - box.minY) * scale }}
                title={o.name}
              >
                {o.name}
                {o.isBot && <span className="tag">AI</span>}
              </div>
            );
          })}
      </div>
    </section>
  );
}
