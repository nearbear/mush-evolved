import { describe, expect, it } from "vitest";
import { ALIEN_FRUIT_ITEMS, DRUG_ITEMS, HYBRID_FRUIT_ITEMS, PLAIN_ITEM_IDS } from "../src/itemIds.ts";
import { ITEM_TYPES, isItemTypeId } from "../src/itemTypes.ts";

describe("item ids", () => {
  it("ITEM_TYPES has exactly the listed ids", () => {
    const listed = [...PLAIN_ITEM_IDS, ...DRUG_ITEMS, ...ALIEN_FRUIT_ITEMS, ...HYBRID_FRUIT_ITEMS];
    expect(new Set(listed).size).toBe(listed.length);
    expect(Object.keys(ITEM_TYPES).sort()).toEqual([...listed].sort());
  });

  it("isItemTypeId accepts table ids and rejects others, including a hybrid in the wrong order", () => {
    expect(isItemTypeId("wrench")).toBe(true);
    expect(isItemTypeId("graft_fruit01_fruit05")).toBe(true);
    expect(isItemTypeId("graft_fruit05_fruit01")).toBe(false);
    expect(isItemTypeId("oxy_capsul")).toBe(false);
    expect(isItemTypeId("toString")).toBe(false);
  });

  it("each family entry is its own object", () => {
    expect(ITEM_TYPES.drug_0).not.toBe(ITEM_TYPES.drug_1);
  });
});
