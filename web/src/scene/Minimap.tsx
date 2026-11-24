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

import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { DoorId, RoomId } from "@mush2/shared";
import { RoomCaption, SHIP_PLAN, ShipPlanSvg, type MinimapPerson } from "./ShipPlanMap.tsx";

export function Minimap({
  here,
  youId,
  people,
  unidentified,
  reachable,
  burningRooms = [],
  brokenDoors = [],
}: {
  /** The room you are in. */
  here: RoomId;
  youId: string;
  /** Everyone you can place, including you. */
  people: MinimapPerson[];
  /** Rooms of people you can't identify (ACTOPI off), one entry each. */
  unidentified: RoomId[];
  reachable: Set<RoomId>;
  /** Rooms on fire revealed ship-wide by Fire Detectors. */
  burningRooms?: readonly RoomId[];
  /** Broken doors revealed ship-wide by Defective piston sensors. */
  brokenDoors?: readonly DoorId[];
}) {
  const { t } = useTranslation();
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

  // Only real pointers hover; touch taps instead.
  const touch = (e: PointerEvent) => e.pointerType === "touch";

  return (
    <section
      className={`minimap${expanded ? " expanded" : ""}`}
      style={{ "--cols": SHIP_PLAN.width } as CSSProperties}
      aria-label={t("minimap.title")}
      onPointerEnter={(e) => !touch(e) && setHovering(true)}
      onPointerLeave={(e) => {
        if (touch(e)) return;
        setHovering(false);
        setPointed(null);
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <ShipPlanSvg
        here={here}
        youId={youId}
        people={people}
        unidentified={unidentified}
        reachable={reachable}
        burningRooms={burningRooms}
        brokenDoors={brokenDoors}
        pointed={pointed}
        interactive={expanded}
        onPoint={setPointed}
        onPointerUpSvg={(e) => touch(e) && !expanded && setOpened(true)}
        onPointerUpRoom={(room, e) => touch(e) && expanded && setPointed(room)}
      />
      {expanded && (
        <RoomCaption
          pointed={pointed}
          here={here}
          youId={youId}
          people={people}
          unidentified={unidentified}
          burningRooms={burningRooms}
          emptyText={t("minimap.selectRoom")}
          onClose={opened ? close : undefined}
          closeLabel={t("minimap.close")}
        />
      )}
    </section>
  );
}
