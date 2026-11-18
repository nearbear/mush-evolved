// Shared SVG deck plan (Mush/derived/ship-plan.json) and room caption, used by the corner Minimap and the
// Superkube's Travel tab. Presentational only.

import { useMemo, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import planJson from "@mush2/assets/derived/ship-plan.json";
import { doorId, type DoorId, type OtherPlayerView, type RoomId, type ShipPlan } from "@mush2/shared";
import { FIRE_ICON, MUSH_ICON, bustIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { cellsPath, iconSpots, runsPath } from "./plan.ts";

export const SHIP_PLAN = planJson as ShipPlan;
const shapes = SHIP_PLAN.rooms.map((r) => ({ id: r.id, runs: r.runs, d: runsPath(r.runs) }));
const wallsPath = runsPath(SHIP_PLAN.walls);

/** Biggest a person's icon gets, in map cells. It shrinks in rooms too narrow for it, so it never crosses a wall. */
const ICON = 3.2;

/**
 * `iconSpots` for a room holding `count` icons. The plan never changes, so each answer is computed once: the map
 * re-renders on every view, and scanning all 27 rooms each time was most of its cost.
 */
const spotCache = new Map<string, ReturnType<typeof iconSpots>>();
function spotsFor(room: (typeof shapes)[number], count: number): ReturnType<typeof iconSpots> {
  const key = `${room.id}:${count}`;
  let found = spotCache.get(key);
  if (!found) {
    found = iconSpots(room.runs, count, ICON);
    spotCache.set(key, found);
  }
  return found;
}

export type MinimapPerson = Pick<OtherPlayerView, "id" | "isBot" | "character" | "room">;

const isTouch = (e: PointerEvent) => e.pointerType === "touch";

export function ShipPlanSvg({
  here,
  youId,
  people,
  unidentified,
  reachable,
  burningRooms = [],
  brokenDoors = [],
  pointed,
  interactive,
  onPoint,
  onSelectRoom,
  onPointerUpSvg,
  onPointerUpRoom,
}: {
  here?: RoomId;
  youId: string;
  people: MinimapPerson[];
  unidentified: RoomId[];
  reachable?: Set<RoomId>;
  burningRooms?: readonly RoomId[];
  brokenDoors?: readonly DoorId[];
  pointed: RoomId | null;
  interactive: boolean;
  onPoint: (room: RoomId | null) => void;
  onSelectRoom?: (room: RoomId) => void;
  onPointerUpSvg?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUpRoom?: (room: RoomId, e: PointerEvent<SVGPathElement>) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();

  const dots = useMemo(
    () =>
      shapes.flatMap((room) => {
        const inside: (MinimapPerson | undefined)[] = people
          .filter((p) => p.room === room.id)
          .sort((a, b) => a.id.localeCompare(b.id));
        for (const r of unidentified) if (r === room.id) inside.push(undefined);
        const { size, spots } = spotsFor(room, inside.length);
        return spots.map((at, i) => ({ ...at, size, key: `${room.id}:${i}`, person: inside[i] }));
      }),
    [people, unidentified],
  );

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: the enclosing section is labelled and each interactive room is labelled.
    <svg
      viewBox={`0 0 ${SHIP_PLAN.width} ${SHIP_PLAN.height}`}
      style={{ aspectRatio: `${SHIP_PLAN.width} / ${SHIP_PLAN.height}` }}
      onPointerUp={onPointerUpSvg}
    >
      <path className="minimap-walls" d={wallsPath} />
      {shapes.map((r) => {
        const burning = burningRooms.includes(r.id);
        const roomLabel = burning ? `${names.room(r.id)} (${t("minimap.onFire")})` : names.room(r.id);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: interactive, the shape is a role="button" Tab stop (spread below); collapsed, it is aria-hidden and pointer-only.
          <path
            key={r.id}
            className={[
              "minimap-room",
              r.id === here && "here",
              reachable?.has(r.id) && "reachable",
              r.id === pointed && "pointed",
              burning && "burning",
            ]
              .filter(Boolean)
              .join(" ")}
            d={r.d}
            {...(interactive
              ? { role: "button", "aria-label": roomLabel, tabIndex: 0 }
              : { "aria-hidden": true })}
            onPointerEnter={(e) => !isTouch(e) && onPoint(r.id)}
            onPointerUp={onPointerUpRoom ? (e) => onPointerUpRoom(r.id, e) : undefined}
            onFocus={() => onPoint(r.id)}
            onClick={interactive && onSelectRoom ? () => onSelectRoom(r.id) : undefined}
            onKeyDown={
              interactive && onSelectRoom
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRoom(r.id);
                    }
                  }
                : undefined
            }
          >
            {interactive && <title>{roomLabel}</title>}
          </path>
        );
      })}
      {SHIP_PLAN.doors.map((d) => {
        const broken = brokenDoors.includes(doorId(d.rooms[0], d.rooms[1]));
        return (
          <path
            key={`${d.rooms.join()}:${d.cells[0]!.join()}`}
            className={`minimap-door${here && d.rooms.includes(here) ? " here" : ""}${broken ? " broken" : ""}`}
            d={cellsPath(d.cells)}
          />
        );
      })}
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
  );
}

export function RoomCaption({
  pointed,
  here,
  youId,
  people,
  unidentified,
  burningRooms = [],
  emptyText,
  onClose,
  closeLabel,
}: {
  pointed: RoomId | null;
  here?: RoomId;
  youId: string;
  people: MinimapPerson[];
  unidentified: RoomId[];
  burningRooms?: readonly RoomId[];
  emptyText: string;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const occupants = pointed ? people.filter((p) => p.room === pointed && p.id !== youId) : [];
  const strangers = pointed ? unidentified.filter((r) => r === pointed).length : 0;
  const who = [
    ...occupants.map((p) => names.characterGiven(p.character)),
    ...(strangers ? [t("minimap.unidentifiedCount", { count: strangers })] : []),
  ].join(", ");

  return (
    <div className="minimap-caption">
      {pointed ? (
        <div className="minimap-name">
          <strong>
            {burningRooms.includes(pointed) && (
              <span className="minimap-fire">
                <img src={FIRE_ICON} alt={t("minimap.onFire")} />
              </span>
            )}
            {names.room(pointed)}
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
        <span className="sub minimap-name">{emptyText}</span>
      )}
      {onClose && closeLabel && (
        <button type="button" className="close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
      )}
    </div>
  );
}
