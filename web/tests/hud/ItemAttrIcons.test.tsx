// @vitest-environment jsdom
//
// Tests for item attribute icons overlaid on InspectPanel (.inspect-item) and InventoryPanel (.item-slot).

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUSTOMIZED_BLASTER_ITEM, viewFor, type ItemView } from "@mush2/shared";

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import "../../src/i18n/index.ts";
import { ItemAttrIcons } from "../../src/hud/ItemAttrIcons.tsx";
import { InspectPanel } from "../../src/hud/InspectPanel.tsx";
import { InventoryPanel } from "../../src/hud/InventoryPanel.tsx";
import { SAMPLE_SEAT, giveItems, sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

describe("ItemAttrIcons", () => {
  it("returns null for an item without attributes", () => {
    const { container } = render(<ItemAttrIcons item={{ type: "blaster" }} mpPenalty={1} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders heavy, customized, charges, plant states, spores, jelly, and shield in one status-icons list", () => {
    const item: Pick<ItemView, "type" | "charges" | "plant" | "spores" | "jelly" | "shield"> = {
      type: CUSTOMIZED_BLASTER_ITEM,
      charges: 3,
      plant: { species: "fruit01", age: 1, thirst: 2, sick: true },
      spores: 2,
      jelly: 3,
      shield: 4,
    };
    const { container } = render(<ItemAttrIcons item={item} mpPenalty={1} />);
    const lists = container.querySelectorAll("ul.status-icons");
    expect(lists).toHaveLength(1);
    const labels = [...lists[0]!.querySelectorAll("button.status-icon")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Customized",
      "3 charges left",
      "Young plant",
      "Dried",
      "Sick",
      "Contamination: 2",
      "Green jelly: breaks in 3 cycles",
      "Shielding: 4",
    ]);
  });

  it("places item attributes inside .inspect-item in InspectPanel without duplicating plant icons below", () => {
    const state = giveItems(sampleState({ role: "mush" }), ["hydropot"]);
    const pot = state.items[state.items.length - 1]!;
    pot.plant = { species: "fruit01", age: 1, thirst: 1 };
    pot.jelly = 2;
    pot.broken = true;
    const view = viewFor(state, SAMPLE_SEAT);
    const { container } = render(
      <InspectPanel view={view} target={{ kind: "item", id: pot.id }} onAction={() => {}} onDeselect={() => {}} />,
    );
    const inspectItem = container.querySelector(".inspect-item");
    expect(inspectItem).not.toBeNull();
    expect(inspectItem!.querySelectorAll("ul.status-icons")).toHaveLength(1);
    expect(inspectItem!.querySelectorAll("button.status-icon")).toHaveLength(3);
    // Only the .inspect-item overlay has status-icons; broken stays as text below.
    expect(container.querySelectorAll("ul.status-icons")).toHaveLength(1);
    expect(container.querySelector(".inspect-broken")).not.toBeNull();
  });

  it("places item attributes inside .item-slot as a sibling of .item-tile in InventoryPanel", () => {
    const state = giveItems(sampleState(), ["machine_gun"]);
    const mg = state.items[state.items.length - 1]!;
    const view = viewFor(state, SAMPLE_SEAT);
    const { container } = render(
      <InventoryPanel view={view} selected={{ kind: "item", id: mg.id }} onAction={() => {}} onSelect={() => {}} />,
    );
    const mgButton = container.querySelector("button.item-tile.selected");
    expect(mgButton).not.toBeNull();
    // Never nest a button (.status-icon) inside button.item-tile.
    expect(mgButton!.querySelector("button")).toBeNull();
    const slot = mgButton!.closest(".item-slot");
    expect(slot).not.toBeNull();
    expect(slot!.querySelector('ul.status-icons button.status-icon[aria-label="Heavy"]')).not.toBeNull();
  });

  it("shows the owner's head bust icon, custom name subtitle, and Rename button for owned items in InspectPanel", () => {
    const state = giveItems(sampleState(), ["support_drone"]);
    const drone = state.items[state.items.length - 1]!;
    drone.owner = SAMPLE_SEAT;
    drone.customName = "Sparky";
    const view = viewFor(state, SAMPLE_SEAT);
    const { container, getByRole } = render(
      <InspectPanel
        view={view}
        target={{ kind: "item", id: drone.id }}
        onAction={() => {}}
        onDeselect={() => {}}
        onRenameItem={() => {}}
      />,
    );
    const ownerBtn = container.querySelector('ul.status-icons button.status-icon[aria-label^="Owner:"]');
    expect(ownerBtn).not.toBeNull();
    expect(container.querySelector(".inspect-drone")?.textContent).toBe("Sparky");
    expect(getByRole("button", { name: "Rename" })).toBeTruthy();
  });
});
