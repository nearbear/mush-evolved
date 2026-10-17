// How long ago something happened, as the short caption beside iTrackie
// entries: "<1min ago", "47min ago", "1h ago", "1d2h ago". Pure, so it is tested alone.

export type Recency =
  | { key: "lessThanMinute" }
  | { key: "minutes" | "hours"; count: number }
  | { key: "days"; days: number }
  | { key: "daysHours"; days: number; hours: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Rounds down, so "1h ago" covers 1h00 to 1h59. A clock that runs behind the server counts as just now. */
export function recency(at: number, now: number): Recency {
  const ms = Math.max(0, now - at);
  if (ms < MINUTE) return { key: "lessThanMinute" };
  if (ms < HOUR) return { key: "minutes", count: Math.floor(ms / MINUTE) };
  if (ms < DAY) return { key: "hours", count: Math.floor(ms / HOUR) };
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours === 0 ? { key: "days", days } : { key: "daysHours", days, hours };
}
