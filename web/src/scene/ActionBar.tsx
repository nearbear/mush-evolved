// A bar over a character's head that empties while their timed action is under way (queue.ts in shared). Whose
// bars you see is decided by the server's view. It drains in CSS, so the server sends nothing while it runs.

import { useState, type CSSProperties } from "react";

/** A bar in server time (ms), as the view sends it. */
export interface Bar {
  since: number;
  until: number;
}

/** `clockOffset` is the server's clock minus this browser's (from the view message's `now`). */
export function ActionBar({ bar, clockOffset, label }: { bar: Bar; clockOffset: number; label: string }) {
  return (
    <div className="action-bar" role="img" aria-label={label}>
      {/* Keyed by the bar's end, so a new action restarts the animation and a fresh view of the same one doesn't. */}
      <Fill key={bar.until} bar={bar} clockOffset={clockOffset} />
    </div>
  );
}

function Fill({ bar, clockOffset }: { bar: Bar; clockOffset: number }) {
  const duration = Math.max(1, bar.until - bar.since);
  // Read once, when the bar first shows: a negative delay starts the animation part-way, for a bar already running.
  const [elapsed] = useState(() => Math.min(duration, Math.max(0, Date.now() + clockOffset - bar.since)));
  return <div className="action-bar-fill" style={{ "--bar-ms": `${duration}ms`, "--bar-delay": `${-elapsed}ms` } as CSSProperties} />;
}
