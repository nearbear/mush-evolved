import { describe, expect, it } from "vitest";
import { PACE_SPEED, shipPace } from "./scene.ts";

describe("shipPace", () => {
  it("is stopped in orbit, traveling on a jump and cruising otherwise", () => {
    expect(shipPace({ orbiting: true, traveling: false })).toBe("stopped");
    expect(shipPace({ orbiting: false, traveling: false })).toBe("cruising");
    expect(shipPace({ orbiting: false, traveling: true })).toBe("traveling");
  });

  it("streams faster the faster the pace", () => {
    expect(PACE_SPEED.stopped).toBe(0);
    expect(PACE_SPEED.cruising).toBeGreaterThan(PACE_SPEED.stopped);
    expect(PACE_SPEED.traveling).toBeGreaterThan(PACE_SPEED.cruising);
  });
});
