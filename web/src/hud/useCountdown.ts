import { useServerNow } from "./serverClock.ts";

/** Time left from `now` until `at` (both server ms) as h:mm:ss. */
export function countdownText(at: number, now: number): string {
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(left / 3600)}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`;
}

/** Time left until `at` (server ms) as h:mm:ss, ticking each second on the server's clock (frozen in a replay). */
export function useCountdown(at: number): string {
  return countdownText(at, useServerNow(1000));
}
