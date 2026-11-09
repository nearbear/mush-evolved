import { describe, expect, it } from "vitest";
import { resourceAvailable } from "../src/resources.ts";

describe("resourceAvailable", () => {
  it("hides a resource with none held and no granting skill", () => {
    expect(resourceAvailable("core", 0, [])).toBe(false);
    expect(resourceAvailable("core", 0, ["computer"])).toBe(false);
  });

  it("shows a resource the player's skill grants, even at zero", () => {
    expect(resourceAvailable("core", 0, ["designer"])).toBe(true);
    expect(resourceAvailable("garden", 0, ["botanic"])).toBe(true);
    expect(resourceAvailable("eng", 0, ["engineer"])).toBe(true);
  });

  it("counts the book skill", () => {
    expect(resourceAvailable("pilgred", 0, [], "physicist")).toBe(true);
  });

  it("shows a resource that is held, whatever the skills", () => {
    expect(resourceAvailable("shoot", 1, [])).toBe(true);
  });

  it("hides resources nothing grants yet", () => {
    expect(resourceAvailable("exp", 0, ["engineer", "designer"])).toBe(false);
  });
});
