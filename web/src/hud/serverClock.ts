// The server's clock, as the HUD sees it. Live play knows the server's clock minus this browser's (from the view
// message's `now`), so countdowns and action bars run in server time. A replay freezes it at the shown step's time:
// nothing ticks, and every bar and countdown shows that moment.

import { createContext, useContext, useEffect, useState } from "react";

/** Live: the server's clock minus ours (ms). Frozen: a fixed server time (ms), for a replay. */
export type ServerClock = { offset: number } | { frozen: number };

export const ServerClockContext = createContext<ServerClock>({ offset: 0 });

export function useServerClock(): ServerClock {
  return useContext(ServerClockContext);
}

/** The server's time for a clock and a local `Date.now()`. */
export function serverTime(clock: ServerClock, localNow: number): number {
  return "frozen" in clock ? clock.frozen : localNow + clock.offset;
}

/**
 * The server's time now. With `tickMs`, it re-renders every `tickMs` (live only; a frozen clock never ticks);
 * without, it is read at render time.
 */
export function useServerNow(tickMs?: number): number {
  const clock = useServerClock();
  const frozen = "frozen" in clock;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs === undefined || frozen) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs, frozen]);
  return serverTime(clock, tickMs === undefined ? Date.now() : now);
}
