// The whole ship as a small deck plan in the corner of the room view. Your
// room is drawn in color; every other room is fogged to a grey silhouette,
// with the people in it as faded dots (everyone's location is public). Doors
// are marked in the walls. Each person is a small character bust. Without ACTOPI you
// only know who is in your own room; everyone else is a mush.png icon.
//
// Collapsed by default. A mouse expands it on hover, and hovering a room
// names it and the people in it; leaving the map collapses it. Touch has no
// hover, so a tap expands it (with a close button) and tapping a room names it
// the same way. Keyboard focus on a room names it too. Presentational only.

import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import planJson from "@mush2/assets/derived/ship-plan.json";
import type { OtherPlayerView, RoomId, ShipPlan } from "@mush2/shared";
import { FIRE_ICON, MUSH_ICON, bustIcon } from "../art/assets.ts";
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
  burningRooms = [],
}: {
  /** The room you are in. */
  here: RoomId;
  youId: string;
  /** Everyone you can place, including you. */
  people: Person[];
  /** Rooms of people you can't identify (ACTOPI off), one entry each. */
  unidentified: RoomId[];
  reachable: Set<RoomId>;
  /** Rooms on fire revealed ship-wide by Fire Detectors. */
  burningRooms?: readonly RoomId[];
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [hovering, setHovering] = useState(false);
  const [opened, setOpened] = useState(false);
  const [pointed, setPointed] = useState<RoomId | null>(null);
  const expanded = hovering || opened;

  // Arriving somewhere new closes the map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new closes the map.
  useEffect(() => {
    setOpened(false);
    setPointed(null);
  }, [here]);

  const close = () => {
    setOpened(false);
    setPointed(null);
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

  // Only real pointers hover; touch taps instead.
  const touch = (e: PointerEvent) => e.pointerType === "touch";

  const occupants = pointed ? people.filter((p) => p.room === pointed && p.id !== youId) : [];
  const strangers = pointed ? unidentified.filter((r) => r === pointed).length : 0;
  const who = [
    ...occupants.map((p) => names.character(p.character)),
    ...(strangers ? [t("minimap.unidentifiedCount", { count: strangers })] : []),
  ].join(", ");

  return (
    <section
      className={`minimap${expanded ? " expanded" : ""}`}
      style={{ "--cols": plan.width } as CSSProperties}
      aria-label={t("minimap.title")}
      onPointerEnter={(e) => !touch(e) && setHovering(true)}
      onPointerLeave={(e) => {
        if (touch(e)) return;
        setHovering(false);
        setPointed(null);
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: the section is labelled and each room is labelled; expanding the map by keyboard is not built yet. */}
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
        onPointerUp={(e) => touch(e) && !expanded && setOpened(true)}
      >
        <path className="minimap-walls" d={wallsPath} />
        {shapes.map((r) => {
          const burning = burningRooms.includes(r.id);
          const roomLabel = burning ? `${names.room(r.id)} (${t("minimap.onFire")})` : names.room(r.id);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: expanded, the shape is a role="button" Tab stop (spread below); collapsed, it is aria-hidden and pointer-only.
            <path
              key={r.id}
              className={[
                "minimap-room",
                r.id === here && "here",
                reachable.has(r.id) && "reachable",
                r.id === pointed && "pointed",
                burning && "burning",
              ]
                .filter(Boolean)
                .join(" ")}
              d={r.d}
              {...(expanded
                ? { role: "button", "aria-label": roomLabel, tabIndex: 0 }
                : { "aria-hidden": true })}
              onPointerEnter={(e) => !touch(e) && setPointed(r.id)}
              onPointerUp={(e) => touch(e) && expanded && setPointed(r.id)}
              onFocus={() => setPointed(r.id)}
            >
              {expanded && <title>{roomLabel}</title>}
            </path>
          );
        })}
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
          {pointed ? (
            <div className="minimap-name">
              <strong>
                {names.room(pointed)}
                {burningRooms.includes(pointed) && (
                  <span className="minimap-fire">
                    <img src={FIRE_ICON} alt={t("minimap.onFire")} />
                  </span>
                )}
              </strong>
              <div className="sub">
                {[
                  ...(pointed === here ? [t("minimap.youAreHere")] : []),
                  ...(who ? [who] : pointed === here ? [] : [t("minimap.nobodyHere")]),
                  ...(burningRooms.includes(pointed) ? [t("minimap.onFire")] : []),
                ].join(" · ")}
              </div>
            </div>
          ) : (
            <span className="sub minimap-name">{t("minimap.selectRoom")}</span>
          )}
          {opened && (
            <button type="button" className="close" onClick={close} aria-label={t("minimap.close")}>
              ×
            </button>
          )}
        </div>
      )}
    </section>
  );
}
