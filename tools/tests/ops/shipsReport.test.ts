import { describe, expect, it } from "vitest";
import { age, formatShips, SHIPS_QUERY, type ShipLine } from "../../src/ops/shipsReport.ts";

const NOW = Date.UTC(2026, 10, 14, 12);
const HOUR = 3_600_000;
const ship = (roomId: string, over: Partial<ShipLine> = {}): ShipLine => ({
  roomId,
  language: "en",
  singlePlayer: 0,
  seats: 16,
  launchedAt: NOW - 2 * HOUR,
  aboard: 5,
  ...over,
});

describe("npm run ships report (#431)", () => {
  it("groups ships by language and mode, with players aboard against seats and launch time", () => {
    const report = formatShips(
      [ship("a1"), ship("a2", { launchedAt: NOW - 50 * HOUR, aboard: 16 }), ship("s1", { singlePlayer: 1, seats: 9, aboard: 0 }), ship("f1", { language: "fr" })],
      NOW,
    );
    expect(report).toBe(
      [
        "4 running ships",
        "",
        "en multiplayer: 2",
        "  a1   5/16 aboard  launched 2026-11-14 10:00 UTC (2h 00m ago)",
        "  a2  16/16 aboard  launched 2026-11-12 10:00 UTC (2d 2h ago)",
        "",
        "en single player: 1",
        "  s1   -/9  aboard  launched 2026-11-14 10:00 UTC (2h 00m ago)",
        "",
        "fr multiplayer: 1",
        "  f1   5/16 aboard  launched 2026-11-14 10:00 UTC (2h 00m ago)",
      ].join("\n"),
    );
  });

  it("says so when nothing runs", () => {
    expect(formatShips([], NOW)).toBe("No running ships.");
  });

  it("formats ages", () => {
    expect(age(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(age(NOW + 1000, NOW)).toBe("0m");
  });

  it("selects no account ID or name, and only reads", () => {
    expect(SHIPS_QUERY).not.toMatch(/account_id\s*(AS|,)|name/i);
    expect(SHIPS_QUERY.trim()).toMatch(/^SELECT/);
    expect(SHIPS_QUERY).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  });
});
