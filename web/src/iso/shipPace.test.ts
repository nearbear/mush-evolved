import { describe, expect, it } from "vitest";
import { PACE_SPEED, shipPace } from "./scene.ts";

describe("shipPace", () => {
  it("is stopped in orbit and cruising otherwise", () => {
    expect(shipPace({ orbiting: true })).toBe("stopped");
    expect(shipPace({ orbiting: false })).toBe("cruising");
  });

  it("streams faster the faster the pace", () => {
    expect(PACE_SPEED.stopped).toBe(0);
    expect(PACE_SPEED.cruising).toBeGreaterThan(PACE_SPEED.stopped);
    expect(PACE_SPEED.traveling).toBeGreaterThan(PACE_SPEED.cruising);
  });
});
