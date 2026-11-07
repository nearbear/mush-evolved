import { describe, expect, it } from "vitest";
import { apColumnHeight } from "../../src/hud/apGauge.ts";

describe("apColumnHeight", () => {
  it("keeps one column up to 14 and shares a larger cap out evenly over two", () => {
    // 12 base, 14 with the Noise Reducer, 24 with Lethargy, 26 with both.
    expect([12, 14, 24, 26].map(apColumnHeight)).toEqual([12, 14, 12, 13]);
  });
});
