import { CYCLE_HOURS, cyclesPerDayFor } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { clockCycle, clockCycleStart, cycleMs, cycleOfDay } from "../src/cycleClock.ts";

const HOUR = 60 * 60 * 1000;

describe("cycle clock", () => {
  it("lasts the game's cycle length unless CYCLE_SECONDS is a positive number", () => {
    for (const h of CYCLE_HOURS) expect(cycleMs({}, h)).toBe(h * HOUR);
    for (const bad of ["", "0", "-5", "soon"]) expect(cycleMs({ CYCLE_SECONDS: bad }, 3)).toBe(3 * HOUR);
    for (const h of CYCLE_HOURS) expect(cycleMs({ CYCLE_SECONDS: "60" }, h)).toBe(60_000);
  });

  it("for each cycle length, puts 14:10 GMT on the right cycle, the next change on a multiple of it, and a day end at midnight", () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 9, 19, h, m);
    for (const h of CYCLE_HOURS) {
      const length = cycleMs({}, h);
      const perDay = cyclesPerDayFor(h);
      const n = clockCycle(at(14, 10), length);
      expect(cycleOfDay(n, perDay), `${h} h`).toBe(Math.floor(14 / h) + 1);
      expect(clockCycleStart(n + 1, length), `${h} h`).toBe(at(Math.floor(14 / h) * h + h));
      expect(cycleOfDay(clockCycle(at(23, 59), length), perDay), `${h} h`).toBe(perDay);
      expect(cycleOfDay(clockCycle(Date.UTC(2026, 9, 20), length), perDay), `${h} h`).toBe(1);
    }
  });

  it("changes cycles at 00:00, 03:00, … 21:00 GMT, cycle 1 starting at midnight", () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 9, 19, h, m);
    expect(cycleOfDay(clockCycle(at(0), 3 * HOUR), 8)).toBe(1);
    expect(cycleOfDay(clockCycle(at(2, 59), 3 * HOUR), 8)).toBe(1);
    expect(cycleOfDay(clockCycle(at(14, 10), 3 * HOUR), 8)).toBe(5);
    expect(cycleOfDay(clockCycle(at(23, 59), 3 * HOUR), 8)).toBe(8);
    expect(clockCycleStart(clockCycle(at(14, 10), 3 * HOUR) + 1, 3 * HOUR)).toBe(at(15));
  });
});
