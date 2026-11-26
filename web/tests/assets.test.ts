import { ALIEN_FRUIT_ITEMS, ITEM_TYPES, hybridParents, isItemTypeId } from "@mush2/shared";
import namesEn from "@mush2/shared/src/locales/names.en.json";
import { describe, expect, it } from "vitest";
import { EMPTY_SLOT_ICON, itemIcon, itemViewIcon, skillIcon } from "../src/art/assets.ts";

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

  it("maps infantryman to the former crazy_eye icon and removes crazy_eye", () => {
    const infantryman = skillIcon("infantryman");
    expect(infantryman).not.toBe(EMPTY_SLOT_ICON);
    expect(infantryman).toContain("crazy_eye");

    expect(skillIcon("crazy_eye")).toBe(EMPTY_SLOT_ICON);
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

  it("renders the regular blaster icon for customized_blaster", () => {
    expect(itemViewIcon({ type: "customized_blaster" })).toBe(itemViewIcon({ type: "blaster" }));
  });
});

// Every icon constant is a lookup into an import.meta.glob map, asserted with `!`.
// A name missing from the glob pattern (or misspelled) compiles fine and renders a
// blank <img>, so walk every exported constant and require each leaf to be a URL.
describe("exported asset constants", () => {
  it("resolve every lookup to a non-empty URL", async () => {
    const assets: Record<string, unknown> = await import("../src/art/assets.ts");
    const missing: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "function" || typeof value === "number") return;
      if (typeof value === "string") {
        if (value === "") missing.push(path);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      } else {
        missing.push(path);
      }
    };
    for (const [name, value] of Object.entries(assets)) walk(value, name);
    expect(missing).toEqual([]);
  });
});

describe("item type coverage", () => {
  // A graft hybrid (#438) is named and drawn from its parents, so only its parents need entries.
  const plain = Object.keys(ITEM_TYPES).filter(isItemTypeId).filter((id) => hybridParents(id) === null);

  it("every item type has an icon", () => {
    expect(plain.length).toBeGreaterThan(90);
    // A corpse is drawn in the room as its character lying down; it has no inventory icon yet.
    expect(plain.filter((id) => itemIcon(id) === undefined)).toEqual(["corpse"]);
  });

  it("every item type has an English name", () => {
    expect(plain.filter((id) => !(id in namesEn.items))).toEqual([]);
  });
});
