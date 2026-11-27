import { describe, expect, it } from "vitest";
import { isOutdated } from "./buildCheck.ts";

describe("isOutdated", () => {
  it("is true when the server runs another build", () => {
    expect(isOutdated("bbb", "aaa")).toBe(true);
  });
  it("is false for the same build", () => {
    expect(isOutdated("aaa", "aaa")).toBe(false);
  });
  it("ignores dev on either side", () => {
    expect(isOutdated("dev", "aaa")).toBe(false);
    expect(isOutdated("aaa", "dev")).toBe(false);
  });
});
