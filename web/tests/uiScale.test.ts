import { describe, expect, it } from "vitest";
import { parseUiScale, UI_SCALES } from "../src/uiScale.ts";

describe("UI scale preference", () => {
  it("reads a stored scale, and falls back to auto for anything else", () => {
    for (const s of UI_SCALES) expect(parseUiScale(s)).toBe(s);
    expect(parseUiScale(null)).toBe("auto");
    expect(parseUiScale("200")).toBe("auto");
  });
});
