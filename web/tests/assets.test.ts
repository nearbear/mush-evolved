import { ALIEN_FRUIT_ITEMS } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { EMPTY_SLOT_ICON, itemViewIcon, skillIcon } from "../src/art/assets.ts";

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

  it("moves Independent's brick wall icon to Bodyguard and Daunting's icon to Independent", () => {
    const bodyguard = skillIcon("bodyguard");
    expect(bodyguard).not.toBe(EMPTY_SLOT_ICON);
    expect(bodyguard).toContain("unconcerned");

    const independent = skillIcon("unconcerned");
    expect(independent).not.toBe(EMPTY_SLOT_ICON);
    expect(independent).toContain("daunting");

    expect(skillIcon("daunting")).toBe(EMPTY_SLOT_ICON);
  });

  it("returns EMPTY_SLOT_ICON for an unknown skill", () => {
    expect(skillIcon("unknown_skill_id")).toBe(EMPTY_SLOT_ICON);
  });
});

describe("itemViewIcon", () => {
  it("renders fruit_tree01..fruit_tree12 for planted alien fruit hydropots", () => {
    for (const species of ALIEN_FRUIT_ITEMS) {
      const icon = itemViewIcon({
        type: "tree_pot",
        plant: { species, age: 0, thirst: 0 },
      });
      expect(icon).toBeDefined();
      expect(icon).toContain(`fruit_tree${species.slice("fruit".length)}`);
    }
  });

  it("renders tree_banana for planted banana pots and tree_pot when empty", () => {
    expect(itemViewIcon({ type: "tree_pot", plant: { species: "fruit_banana", age: null, thirst: 0 } })).toContain("tree_banana");
    expect(itemViewIcon({ type: "tree_pot" })).toContain("tree_pot");
  });
});
