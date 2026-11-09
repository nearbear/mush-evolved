import { describe, expect, it } from "vitest";
import { firstUnreadRow, rowAfterKey } from "../../src/hud/feedKeys.ts";

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

describe("firstUnreadRow", () => {
  it("lands on the first unread row on the page", () => {
    expect(firstUnreadRow([50, 51, 52, 53], 52)).toBe(2);
  });
  it("lands on the last row when the page is all read, or with no read state", () => {
    expect(firstUnreadRow([50, 51, 52], 60)).toBe(2);
    expect(firstUnreadRow([50, 51, 52], undefined)).toBe(2);
  });
});
