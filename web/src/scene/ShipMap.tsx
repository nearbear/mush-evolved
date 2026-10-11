import type { OtherPlayerView, PlayerState, RoomId } from "@mush2/shared";
import { portrait, roomImage } from "../art/assets.ts";
import { roomLabel } from "./names.ts";

type Person = Pick<OtherPlayerView, "id" | "name" | "character" | "room">;

/**
 * Every room as a thumbnail with who is in it. Rooms you can move to right now
 * (per the server's legal actions) are clickable.
 */
export function ShipMap({
  rooms,
  you,
  people,
  reachable,
  onMove,
}: {
  rooms: RoomId[];
  you: PlayerState;
  people: Person[];
  reachable: Set<RoomId>;
  onMove: (room: RoomId) => void;
}) {
  return (
    <section className="ship-map">
      {rooms.map((room) => {
        const here = room === you.room;
        const canGo = reachable.has(room);
        const art = roomImage(room);
        return (
          <button
            key={room}
            className={`map-room${here ? " here" : ""}${canGo ? " reachable" : ""}`}
            style={{ backgroundImage: art ? `url(${art})` : undefined }}
            disabled={!canGo}
            onClick={() => onMove(room)}
            title={canGo ? `Move to ${roomLabel(room)}` : roomLabel(room)}
          >
            <span className="map-label">{roomLabel(room)}</span>
            <span className="map-people">
              {people
                .filter((p) => p.room === room)
                .map((p) => (
                  <img key={p.id} src={portrait(p.character)} alt={p.name} title={p.name} />
                ))}
            </span>
          </button>
        );
      })}
    </section>
  );
}
