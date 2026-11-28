import { describe, expect, it } from "vitest";
import { rowAfterKey } from "../../src/hud/feedKeys.ts";

describe("rowAfterKey", () => {
  it("moves between rows and stops at the ends", () => {
    expect(rowAfterKey("ArrowDown", 1, 4)).toBe(2);
    expect(rowAfterKey("ArrowDown", 3, 4)).toBe(3);
    expect(rowAfterKey("ArrowUp", 0, 4)).toBe(0);
    expect(rowAfterKey("Home", 2, 4)).toBe(0);
    expect(rowAfterKey("End", 0, 4)).toBe(3);
  });
  it("enters from the feed itself at the first or last row", () => {
    expect(rowAfterKey("ArrowDown", -1, 4)).toBe(0);
    expect(rowAfterKey("ArrowUp", -1, 4)).toBe(3);
  });
  it("ignores other keys and empty feeds", () => {
    expect(rowAfterKey("Enter", 1, 4)).toBeNull();
    expect(rowAfterKey("ArrowDown", -1, 0)).toBeNull();
  });
});
