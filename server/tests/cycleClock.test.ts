import { describe, expect, it } from "vitest";
import { clockCycle, clockCycleStart, cycleMs, cycleOfDay } from "../src/cycleClock.ts";

const HOUR = 60 * 60 * 1000;

describe("cycle clock", () => {
  it("lasts 3 hours unless CYCLE_SECONDS is a positive number", () => {
    expect(cycleMs({})).toBe(3 * HOUR);
    for (const bad of ["", "0", "-5", "soon"]) expect(cycleMs({ CYCLE_SECONDS: bad })).toBe(3 * HOUR);
    expect(cycleMs({ CYCLE_SECONDS: "60" })).toBe(60_000);
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
