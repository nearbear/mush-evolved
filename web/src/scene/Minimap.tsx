// The whole ship as a small deck plan in the corner of the room view. Your
// room is drawn in color; every other room is fogged to a grey silhouette,
// with the people in it as faded dots (everyone's location is public). Doors
// are marked in the walls. Each person is a small character bust. Without ACTOPI you
// only know who is in your own room; everyone else is a mush.png icon.
//
// Collapsed by default. A mouse expands it on hover; touch expands it with a
// tap. Hovering a room names it; clicking or tapping selects it, and the
// caption then offers Go when the server says you can move there. Double-click
// is a shortcut for Go, like doors in the room view. Presentational only.

import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import planJson from "@mush2/assets/derived/ship-plan.json";
import type { OtherPlayerView, RoomId, ShipPlan } from "@mush2/shared";
import { MUSH_ICON, bustIcon } from "../art/assets.ts";
import { cellsPath, iconSpots, runsPath } from "./plan.ts";

const plan = planJson as ShipPlan;
const shapes = plan.rooms.map((r) => ({ id: r.id, runs: r.runs, d: runsPath(r.runs) }));
const wallsPath = runsPath(plan.walls);

/** Biggest a person's icon gets, in map cells. It shrinks in rooms too narrow for it, so it never crosses a wall. */
const ICON = 3.2;

type Person = Pick<OtherPlayerView, "id" | "isBot" | "character" | "room">;

export function Minimap({
  here,
  youId,
  people,
  unidentified,
  reachable,
  onMove,
}: {
  /** The room you are in. */
  here: RoomId;
  youId: string;
  /** Everyone you can place, including you. */
  people: Person[];
  /** Rooms of people you can't identify (ACTOPI off), one entry each. */
  unidentified: RoomId[];
  reachable: Set<RoomId>;
  onMove: (room: RoomId) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
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
        const inside: (Person | undefined)[] = people
          .filter((p) => p.room === room.id)
          .sort((a, b) => a.id.localeCompare(b.id));
        for (const r of unidentified) if (r === room.id) inside.push(undefined);
        const { size, spots } = iconSpots(room.runs, inside.length, ICON);
        return spots.map((at, i) => ({ ...at, size, key: `${room.id}:${i}`, person: inside[i] }));
      }),
    [people, unidentified],
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
  const strangers = selected ? unidentified.filter((r) => r === selected).length : 0;

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
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noSvgWithoutTitle: the section is labelled and each room is a labelled button; expanding the map by keyboard is not built yet. */}
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
            aria-label={names.room(r.id)}
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
            <title>{names.room(r.id)}</title>
          </path>
        ))}
        {plan.doors.map((d) => (
          <path
            key={`${d.rooms.join()}:${d.cells[0]!.join()}`}
            className={`minimap-door${d.rooms.includes(here) ? " here" : ""}`}
            d={cellsPath(d.cells)}
          />
        ))}
        {dots.map(({ x, y, size, key, person }) => (
          <image
            key={key}
            className={`minimap-person${person?.id === youId ? " you" : ""}${person && person.room === here ? " near" : ""}`}
            href={person ? bustIcon(person.character) : MUSH_ICON}
            x={x - size / 2}
            y={y - size / 2}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
          >
            <title>{person ? names.character(person.character) : t("minimap.unidentified")}</title>
          </image>
        ))}
      </svg>
      {expanded && (
        <div className="minimap-caption">
          {shown ? (
            <div className="minimap-name">
              <strong>{names.room(shown)}</strong>
              {selected && (
                <div className="sub">
                  {selected === here
                    ? "You are here"
                    : occupants.length || strangers
                      ? [
                          ...occupants.map((p) => names.character(p.character)),
                          ...(strangers ? [t("minimap.unidentifiedCount", { count: strangers })] : []),
                        ].join(", ")
                      : "Nobody here"}
                </div>
              )}
            </div>
          ) : (
            <span className="sub minimap-name">Select a room</span>
          )}
          {selected && reachable.has(selected) && <button type="button" onClick={() => onMove(selected)}>Go</button>}
          {(selected || opened) && (
            <button type="button" className="close" onClick={close} aria-label="Close map">
              ×
            </button>
          )}
        </div>
      )}
    </section>
  );
}
