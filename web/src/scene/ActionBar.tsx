// A bar over a character's head that fills while their timed action is under way (queue.ts in shared). Whose
// bars you see is decided by the server's view. It fills in CSS, so the server sends nothing while it runs.

import { useState, type CSSProperties } from "react";
import { useServerClock, useServerNow } from "../hud/serverClock.ts";

/** A bar in server time (ms), as the view sends it. */
export interface Bar {
  since: number;
  until: number;
}

/** Times come from the server clock (`ServerClockContext`): live it runs; in a replay it is frozen at the step. */
export function ActionBar({ bar, label }: { bar: Bar; label: string }) {
  const clock = useServerClock();
  const frozen = "frozen" in clock ? clock.frozen : null;
  // Keyed by the bar's end, so a new action restarts the animation and a fresh view of the same one doesn't.
  // Frozen, also by the frozen time, so each replay step redraws the bar at its own point.
  return <Timed key={frozen === null ? bar.until : `${bar.until}@${frozen}`} bar={bar} paused={frozen !== null} label={label} />;
}

function Timed({ bar, paused, label }: { bar: Bar; paused: boolean; label: string }) {
  const duration = Math.max(1, bar.until - bar.since);
  const now = useServerNow();
  // Read once, when the bar first shows: a negative delay starts the animation part-way, for a bar already running.
  const [elapsed] = useState(() => Math.min(duration, Math.max(0, now - bar.since)));
  const style = { "--bar-ms": `${duration}ms`, "--bar-delay": `${-elapsed}ms`, ...(paused && { animationPlayState: "paused" }) } as CSSProperties;
  return <div className="kit-progress counter action-bar" role="img" aria-label={label} style={style} />;
}
