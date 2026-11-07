// A dev-build tripwire for slow renders: React's built-in <Profiler> around the game screen warns in the console when
// one update takes longer than SLOW_RENDER_MS, so a laggy component shows up the day it lands rather than once it is
// unbearable. It names no component; the React DevTools profiler does that. Production builds render the children
// alone (no Profiler, no cost).
//
// Update times also go to `window.__mush2Renders` (the last RENDER_HISTORY), for a script driving the page to read.

import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

/** An update slower than this warns. A dev budget (dev builds run several times slower than production), set above
 * the 56-97ms a move cost in a full game on 2026-11-06 so it only fires on a real regression; lower it as that improves. */
export const SLOW_RENDER_MS = 100;
const RENDER_HISTORY = 200;

declare global {
  interface Window {
    /** Dev builds only: recent updates of the game screen, oldest first. */
    __mush2Renders?: { at: number; ms: number }[];
  }
}

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, _base, startTime) => {
  // Mounting the whole screen is a one-off and is expected to be slow.
  if (phase === "mount") return;
  const renders = (window.__mush2Renders ??= []);
  renders.push({ at: startTime, ms: actualDuration });
  if (renders.length > RENDER_HISTORY) renders.splice(0, renders.length - RENDER_HISTORY);
  if (actualDuration > SLOW_RENDER_MS) {
    console.warn(
      `Slow render: ${id} took ${Math.round(actualDuration)}ms (budget ${SLOW_RENDER_MS}ms in dev). Record it with the React DevTools profiler to see which components; web/CLAUDE.md "Render cost" lists the usual causes.`, // i18n-ignore: dev console only
    );
  }
};

export function RenderWatch({ id, children }: { id: string; children: ReactNode }) {
  if (!import.meta.env.DEV) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
