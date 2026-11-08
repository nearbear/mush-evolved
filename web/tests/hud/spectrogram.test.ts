import { describe, expect, it } from "vitest";
import { BINS, FLOOR_DB, signalRow, signalStrength, solDb } from "../../src/hud/Spectrogram.tsx";

describe("solDb", () => {
  it("maps the ship's chance to dB: 4% is -96, 100% or more is 0", () => {
    expect(solDb(4)).toBe(-96);
    expect(solDb(60)).toBe(-40);
    expect(solDb(100)).toBe(0);
    expect(solDb(140)).toBe(0);
    expect(solDb(-5)).toBe(FLOOR_DB);
  });

  it("names the strength in plain words", () => {
    expect(signalStrength(-96)).toBe("faint");
    expect(signalStrength(-60)).toBe("weak");
    expect(signalStrength(-40)).toBe("fair");
    expect(signalStrength(0)).toBe("strong");
  });
});

describe("signalRow", () => {
  const peak = (db: number, linked: boolean, t = 0) => {
    const row = new Float32Array(BINS);
    signalRow(row, t, db, linked, () => 0);
    return { max: Math.max(...row), min: Math.min(...row), row };
  };

  it("peaks at the carrier's dB when linked, and stays within -100..0", () => {
    const { max, min } = peak(-30, true);
    expect(max).toBeCloseTo(-30, 0);
    expect(min).toBeGreaterThanOrEqual(FLOOR_DB);
    expect(peak(0, true).max).toBeLessThanOrEqual(0);
  });

  it("spreads over a wide band whose centre stays put", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const { row } = peak(-30, false, t);
      const inBand = row.filter((db) => db > -60).length;
      expect(inBand).toBeGreaterThanOrEqual(BINS * 0.2);
      expect(row[BINS / 2]).toBeGreaterThan(-60);
      expect(row[0]).toBeLessThan(-90);
    }
  });

  it("has a sideband harmonic either side, well below the band", () => {
    const { row } = peak(-10, true);
    const at = (fraction: number) => row[Math.round((BINS - 1) / 2 + fraction * BINS)] ?? FLOOR_DB;
    for (const side of [-1, 1]) {
      expect(at(side * 0.27)).toBeCloseTo(-28, 0);
      expect(at(side * 0.41)).toBeCloseTo(-40, 0);
      expect(at(side * 0.34)).toBeLessThan(-45);
    }
  });

  it("fades by at most 3 dB when unlinked", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const { max } = peak(-30, false, t);
      expect(max).toBeLessThanOrEqual(-29.9);
      expect(max).toBeGreaterThanOrEqual(-33.5);
    }
  });
});
