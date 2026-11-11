// Leaving a room, you first walk to its door. The move has already happened (the view says you're
// in the new room), so this is display only: the room view keeps showing the room you left, as you
// last saw it, until you reach the door to where you went, then switches. Nothing waits for it.
// With the instant actions cheat (`teleport`), or `snap` (a replay's jump), it switches at once.

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import type { RoomId } from "@mush2/shared";
import { IsoRoom } from "./IsoRoom.tsx";

type Props = ComponentProps<typeof IsoRoom>;
/** The part of the props that describes the room itself, frozen while walking out of it. */
type Scene = Pick<Props, "room" | "occupants" | "nearby" | "corpses" | "equipment" | "onFire">;

const NOTHING_REACHABLE = new Set<RoomId>();

export function LeavingIsoRoom(props: Omit<Props, "leavingTo" | "onLeft">) {
  const live: Scene = { room: props.room, occupants: props.occupants, nearby: props.nearby, corpses: props.corpses, equipment: props.equipment, onFire: props.onFire };
  // The room as last drawn live, and the one being walked out of, if any.
  const last = useRef(live);
  const [leaving, setLeaving] = useState<Scene | null>(null);
  // With the instant actions cheat you teleport, so there's no walk out to show; nor when snapping (a replay's jump).
  if (!leaving && !props.teleport && !props.snap && live.room !== last.current.room) setLeaving(last.current);
  // Back in the room being left before reaching its door, or snapping mid-walk: just stay.
  if (leaving && (leaving.room === live.room || props.snap)) setLeaving(null);
  useLayoutEffect(() => {
    if (!leaving) last.current = live;
  });
  /** At the door: show where you are now. */
  const arrived = () => {
    last.current = live;
    setLeaving(null);
  };

  if (!leaving || leaving.room === live.room) return <IsoRoom {...props} leavingTo={null} onLeft={arrived} />;
  // Walking out: the old room, with nothing to select or go through.
  return (
    <IsoRoom
      {...props}
      {...leaving}
      reachable={NOTHING_REACHABLE}
      selected={null}
      selectedDoor={null}
      leavingTo={props.room}
      onLeft={arrived}
    />
  );
}
