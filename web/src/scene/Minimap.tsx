// The whole ship as a small deck plan in the corner of the room view. Your
// room is drawn in color; every other room is fogged to a grey silhouette,
// with the people in it as faded dots (everyone's location is public). Doors
// are marked in the walls.
//
// Collapsed by default. A mouse expands it on hover; touch expands it with a
// tap. Hovering a room names it; clicking or tapping selects it, and the
// caption then offers Go when the server says you can move there. Double-click
// is a shortcut for Go, like doors in the room view. Presentational only.

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import planJson from "@mush2/assets/derived/ship-plan.json";
import type { OtherPlayerView, RoomId, ShipPlan } from "@mush2/shared";
import { roomLabel } from "./names.ts";
import { cellsPath, runsPath, spots } from "./plan.ts";

const plan = planJson as ShipPlan;
const shapes = plan.rooms.map((r) => ({ id: r.id, runs: r.runs, d: runsPath(r.runs) }));
const wallsPath = runsPath(plan.walls);

type Person = Pick<OtherPlayerView, "id" | "name" | "isBot" | "room">;

export function Minimap({
  here,
  youId,
  people,
  reachable,
  onMove,
}: {
  /** The room you are in. */
  here: RoomId;
  youId: string;
  /** Everyone, including you. */
  people: Person[];
  reachable: Set<RoomId>;
  onMove: (room: RoomId) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<RoomId | null>(null);
  const [pointed, setPointed] = useState<RoomId | null>(null);
  const expanded = hovering || opened || selected !== null;

  // Arriving somewhere new closes the map, and the old selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new closes the map.
  useEffect(() => {
    setOpened(false);
    setSelected(null);
  }, [here]);

  const close = () => {
    setOpened(false);
    setSelected(null);
  };

  const dots = useMemo(
    () =>
      shapes.flatMap((room) => {
        const inside = people.filter((p) => p.room === room.id).sort((a, b) => a.id.localeCompare(b.id));
        return spots(room.runs, inside.length).map((at, i) => ({ ...at, person: inside[i]! }));
      }),
    [people],
  );

  // Only real pointers hover; a tap shouldn't both expand and select.
  const mouse = (e: PointerEvent) => e.pointerType !== "touch";
  const select = (room: RoomId) => {
    if (!expanded) setOpened(true);
    else setSelected(room === selected ? null : room);
  };
  const onKey = (e: KeyboardEvent, room?: RoomId) => {
    if (e.key === "Escape") close();
    else if (room && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select(room);
    }
  };

  const shown = selected ?? pointed;
  const occupants = selected ? people.filter((p) => p.room === selected) : [];

  return (
    <section
      className={`minimap${expanded ? " expanded" : ""}`}
      style={{ "--cols": plan.width } as CSSProperties}
      aria-label="Ship map"
      onPointerEnter={(e) => mouse(e) && setHovering(true)}
      onPointerLeave={(e) => {
        if (!mouse(e)) return;
        setHovering(false);
        setPointed(null);
      }}
      onKeyDown={(e) => onKey(e)}
    >
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
        onClick={() => !expanded && setOpened(true)}
      >
        <path className="minimap-walls" d={wallsPath} />
        {shapes.map((r) => (
          <path
            key={r.id}
            className={[
              "minimap-room",
              r.id === here && "here",
              reachable.has(r.id) && "reachable",
              r.id === selected && "selected",
              r.id === pointed && "pointed",
            ]
              .filter(Boolean)
              .join(" ")}
            d={r.d}
            role="button"
            aria-label={roomLabel(r.id)}
            aria-pressed={r.id === selected}
            tabIndex={expanded ? 0 : -1}
            onPointerEnter={(e) => mouse(e) && setPointed(r.id)}
            onClick={(e) => {
              e.stopPropagation();
              select(r.id);
            }}
            onDoubleClick={() => reachable.has(r.id) && onMove(r.id)}
            onKeyDown={(e) => onKey(e, r.id)}
          >
            <title>{roomLabel(r.id)}</title>
          </path>
        ))}
        {plan.doors.map((d) => (
          <path
            key={`${d.rooms.join()}:${d.cells[0]!.join()}`}
            className={`minimap-door${d.rooms.includes(here) ? " here" : ""}`}
            d={cellsPath(d.cells)}
          />
        ))}
        {dots.map(({ x, y, person }) => (
          <circle
            key={person.id}
            className={`minimap-person${person.id === youId ? " you" : ""}${person.room === here ? " near" : ""}`}
            cx={x}
            cy={y}
            r={0.8}
          >
            <title>{person.isBot ? `${person.name} (AI)` : person.name}</title>
          </circle>
        ))}
      </svg>
      {expanded && (
        <div className="minimap-caption">
          {shown ? (
            <div className="minimap-name">
              <strong>{roomLabel(shown)}</strong>
              {selected && (
                <div className="sub">
                  {selected === here
                    ? "You are here"
                    : occupants.length
                      ? occupants.map((p) => (p.isBot ? `${p.name} (AI)` : p.name)).join(", ")
                      : "Nobody here"}
                </div>
              )}
            </div>
          ) : (
            <span className="sub minimap-name">Select a room</span>
          )}
          {selected && reachable.has(selected) && <button onClick={() => onMove(selected)}>Go</button>}
          {(selected || opened) && (
            <button className="close" onClick={close} aria-label="Close map">
              ×
            </button>
          )}
        </div>
      )}
    </section>
  );
}
