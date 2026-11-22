// @vitest-environment jsdom
//
// Tests for InventoryPanel room-item stacking (identical-looking items stack in the room,
// while carried inventory items stay unstacked in their physical slots).

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewFor } from "@mush2/shared";

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
import { InventoryPanel } from "../../src/hud/InventoryPanel.tsx";
import { SAMPLE_SEAT, sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makeRationsState(role: "human" | "mush") {
  const state = sampleState({ role });
  const you = state.players.find((p) => p.id === SAMPLE_SEAT)!;
  state.items = [];
  for (let i = 1; i <= 31; i++) {
    state.items.push({ id: `r-${i}`, type: "uncooked_ration", at: { kind: "room", id: you.room } });
  }
  state.items.push({ id: "r-spiked", type: "uncooked_ration", at: { kind: "room", id: you.room }, spores: 1 });
  return state;
}

describe("InventoryPanel stacking", () => {
  it("stacks 31 normal rations and 1 spiked ration into one room slot of 32 for a human", () => {
    const view = viewFor(makeRationsState("human"), SAMPLE_SEAT);
    const { container } = render(
      <InventoryPanel view={view} selected={{ kind: "player", id: SAMPLE_SEAT }} onAction={() => {}} onSelect={() => {}} />,
    );
    const roomSlots = container.querySelectorAll('[data-zone="room"] li.item-slot');
    expect(roomSlots).toHaveLength(1);
    expect(roomSlots[0]!.querySelector(".item-count")?.textContent).toBe("32");
    expect(roomSlots[0]!.querySelector("button.item-tile")?.getAttribute("aria-label")).toContain("×32");
  });

  it("shows 31 normal rations and 1 spiked ration in two separate room slots for a Mush", () => {
    const view = viewFor(makeRationsState("mush"), SAMPLE_SEAT);
    const { container } = render(
      <InventoryPanel view={view} selected={{ kind: "player", id: SAMPLE_SEAT }} onAction={() => {}} onSelect={() => {}} />,
    );
    const roomSlots = [...container.querySelectorAll('[data-zone="room"] li.item-slot')];
    expect(roomSlots).toHaveLength(2);
    const counts = roomSlots.map((slot) => slot.querySelector(".item-count")?.textContent ?? null).sort();
    expect(counts).toEqual(["31", null]);
  });

  it("keeps carried inventory items unstacked so each occupies its own slot", () => {
    const state = sampleState({ role: "human" });
    state.items = [
      { id: "c-1", type: "uncooked_ration", at: { kind: "player", id: SAMPLE_SEAT } },
      { id: "c-2", type: "uncooked_ration", at: { kind: "player", id: SAMPLE_SEAT } },
      { id: "c-3", type: "uncooked_ration", at: { kind: "player", id: SAMPLE_SEAT } },
    ];
    const view = viewFor(state, SAMPLE_SEAT);
    const { container } = render(
      <InventoryPanel view={view} selected={{ kind: "player", id: SAMPLE_SEAT }} onAction={() => {}} onSelect={() => {}} />,
    );
    const invSlots = container.querySelectorAll('[data-zone="inventory"] li.item-slot');
    expect(invSlots).toHaveLength(3);
    expect(container.querySelectorAll('[data-zone="inventory"] .item-count')).toHaveLength(0);
  });
});
