// The query and the report for `npm run ships` (ships.ts, #431). Pure, so it is tested without D1.

/**
 * Running ships (server/migrations/0005_ships.sql) with how many signed-in players are aboard each: open
 * `account_ships` rows (0001_accounts.sql). Fixed and read-only. Selects no account ID and no name.
 */
export const SHIPS_QUERY = `SELECT s.room_id AS roomId, s.language AS language, s.single_player AS singlePlayer, s.seats AS seats,
  s.launched_at AS launchedAt,
  (SELECT COUNT(*) FROM account_ships a WHERE a.room_id = s.room_id AND a.ended_at IS NULL) AS aboard
FROM ships s ORDER BY s.language, s.single_player, s.launched_at`;

export interface ShipLine {
  roomId: string;
  language: string | null;
  singlePlayer: number;
  seats: number;
  launchedAt: number;
  aboard: number;
}

/** "3d 4h", "2h 05m", "12m": how long ago `then` was. */
export function age(then: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/**
 * The report: a heading per language and mode with its ship count, then one line per ship. Single player never
 * boards (no `account_ships` row), so its players aboard aren't known and show as "-".
 */
export function formatShips(ships: readonly ShipLine[], now: number): string {
  if (ships.length === 0) return "No running ships.";
  const groups = new Map<string, ShipLine[]>();
  for (const ship of ships) {
    const key = `${ship.language ?? "(no language)"} ${ship.singlePlayer === 1 ? "single player" : "multiplayer"}`;
    groups.set(key, [...(groups.get(key) ?? []), ship]);
  }
  const lines = [`${ships.length} running ship${ships.length === 1 ? "" : "s"}`];
  for (const [key, group] of groups) {
    lines.push("", `${key}: ${group.length}`);
    for (const ship of group) {
      const aboard = ship.singlePlayer === 1 ? "-" : String(ship.aboard);
      const launched = new Date(ship.launchedAt).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`  ${ship.roomId}  ${aboard.padStart(2)}/${String(ship.seats).padEnd(2)} aboard  launched ${launched} UTC (${age(ship.launchedAt, now)} ago)`);
    }
  }
  return lines.join("\n");
}
