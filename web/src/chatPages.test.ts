import { describe, expect, it } from "vitest";
import { pageItems } from "./chatPages.tsx";

describe("pageItems", () => {
  it("lists every page when there are few", () => {
    expect(pageItems(0, 2, 2)).toEqual([0, 1, 2]);
  });
  it("keeps the first, the last and the current page's neighbours, with gaps between", () => {
    expect(pageItems(0, 9, 9)).toEqual([0, "gap", 8, 9]);
    expect(pageItems(0, 9, 5)).toEqual([0, "gap", 4, 5, 6, "gap", 9]);
    expect(pageItems(0, 9, 0)).toEqual([0, 1, "gap", 9]);
  });
  it("never goes below the first page it can show", () => {
    expect(pageItems(5, 6, 6)).toEqual([5, 6]);
  });
});
