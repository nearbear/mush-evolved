// A bar over a character's head that fills while their timed action is under way (queue.ts in shared). Whose
// bars you see is decided by the server's view. It fills in CSS, so the server sends nothing while it runs.

import { useState, type CSSProperties } from "react";
import { type ReplayStep, useServerClock, useServerNow } from "../hud/serverClock.ts";

/** A bar in server time (ms), as the view sends it. */
export interface Bar {
  since: number;
  until: number;
}

/** Times come from the server clock (`ServerClockContext`): live it runs; in a replay it is frozen at the step, or fills across the step while playing. */
export function ActionBar({ bar, label }: { bar: Bar; label: string }) {
  const clock = useServerClock();
  if ("frozen" in clock) {
    const { frozen, step } = clock;
    const key = step ? `${bar.until}@${frozen}->${step.to}@${step.durationMs}` : `${bar.until}@${frozen}`;
    return <Frozen key={key} bar={bar} at={frozen} step={step} label={label} />;
  }
  // Keyed by the bar's end, so a new action restarts the animation and a fresh view of the same one doesn't.
  return <Live key={bar.until} bar={bar} label={label} />;
}

function Live({ bar, label }: { bar: Bar; label: string }) {
  const duration = Math.max(1, bar.until - bar.since);
  const now = useServerNow();
  // Read once, when the bar first shows: a negative delay starts the animation part-way, for a bar already running.
  const [elapsed] = useState(() => Math.min(duration, Math.max(0, now - bar.since)));
  const style = { "--bar-ms": `${duration}ms`, "--bar-delay": `${-elapsed}ms` } as CSSProperties;
  return <div className="kit-progress counter action-bar" role="img" aria-label={label} style={style} />;
}

function Frozen({ bar, at, step, label }: { bar: Bar; at: number; step: ReplayStep | undefined; label: string }) {
  const duration = Math.max(1, bar.until - bar.since);
  const elapsed = Math.min(duration, Math.max(0, at - bar.since));
  const from = elapsed / duration;
  const to = step ? Math.min(1, Math.max(from, (step.to - bar.since) / duration)) : from;
  if (step && to > from) {
    // Map [from, to] over step.durationMs onto the 0 -> 1 keyframe so the keyframe stays plain literals (interpolable).
    const animMs = Math.max(1, step.durationMs) / (to - from);
    const style = { "--bar-ms": `${Math.round(animMs)}ms`, "--bar-delay": `${Math.round(-from * animMs)}ms` } as CSSProperties;
    return <div className="kit-progress counter action-bar" role="img" aria-label={label} style={style} />;
  }
  const style = { "--bar-ms": `${duration}ms`, "--bar-delay": `${-elapsed}ms`, animationPlayState: "paused" } as CSSProperties;
  return <div className="kit-progress counter action-bar" role="img" aria-label={label} style={style} />;
}
