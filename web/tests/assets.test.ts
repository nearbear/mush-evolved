import { describe, expect, it } from "vitest";
import { EMPTY_SLOT_ICON, skillIcon } from "../src/art/assets.ts";

describe("skillIcon", () => {
  it("maps maintenance_agent to the former dreamer (oisif) icon", () => {
    const icon = skillIcon("maintenance_agent");
    expect(icon).not.toBe(EMPTY_SLOT_ICON);
    expect(icon).toContain("oisif");
  });

  it("returns EMPTY_SLOT_ICON for removed dreamer (oisif) skill", () => {
    expect(skillIcon("oisif")).toBe(EMPTY_SLOT_ICON);
  });

  it("maps designer to conceptor", () => {
    const icon = skillIcon("designer");
    expect(icon).not.toBe(EMPTY_SLOT_ICON);
    expect(icon).toContain("conceptor");
  });

  it("returns EMPTY_SLOT_ICON for an unknown skill", () => {
    expect(skillIcon("unknown_skill_id")).toBe(EMPTY_SLOT_ICON);
  });
});
