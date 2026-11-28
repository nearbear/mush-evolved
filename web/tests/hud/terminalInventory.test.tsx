// @vitest-environment jsdom
//
// The inventory opened from a terminal (TerminalDialog): it opens where and as big as the room view's own would
// (measureBand), falls back to over the terminal's body when the room view isn't on screen, and a press elsewhere on
// the terminal shuts it while the terminal stays open. jsdom has no layout, so the room view's boxes are stubbed.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";

const layout = vi.hoisted(() => {
  const flags = { mobile: false };
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return flags.mobile;
      },
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return flags;
});

import i18n from "../../src/i18n/index.ts";
import { TerminalDialog } from "../../src/hud/TerminalDialog.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

const VIEWPORT = { width: 1200, height: 800 };

/** Gives `el` a laid-out box, as a browser would. */
function place(el: Element, left: number, top: number, right: number, bottom: number) {
  const rect = { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
  el.getBoundingClientRect = () => rect;
  el.getClientRects = () => [rect] as unknown as DOMRectList;
}

/** A room view with your ID card in its top-left and the sack in its bottom-right, as GameView lays it out. */
function addRoomView() {
  const room = document.createElement("div");
  room.className = "room-view";
  const card = document.createElement("div");
  card.className = "self-hud-top";
  const sack = document.createElement("button");
  sack.className = "inventory-toggle";
  room.append(card, sack);
  document.body.append(room);
  place(room, 300, 50, 900, 750);
  place(card, 300, 50, 500, 150);
  place(sack, 850, 700, 890, 736);
}

function renderTerminal() {
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <TerminalDialog
        terminal={{ id: "core", type: "NERON_CORE" }}
        view={sampleView(sampleState())}
        onAction={() => {}}
        onClose={onClose}
        selected={{ kind: "none" }}
        onSelect={() => {}}
      />
    </I18nextProvider>,
  );
  const dialog = screen.getByRole("dialog");
  const openInventory = () => fireEvent.click(within(dialog).getByRole("button", { name: /^Inventory/ }));
  const inventory = () => within(dialog).queryByRole("region", { name: "Inventory" }) ?? dialog.querySelector<HTMLElement>(".inventory-popup");
  return { dialog, onClose, openInventory, inventory };
}

beforeEach(() => {
  layout.mobile = false;
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: VIEWPORT.width });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: VIEWPORT.height });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("inventory opened from a terminal", () => {
  it("opens where and as big as the room view's inventory would", () => {
    addRoomView();
    const { openInventory, inventory } = renderTerminal();
    openInventory();
    const panel = inventory();
    expect(panel?.classList.contains("terminal-inventory")).toBe(true);
    // Under the ID card (bottom 150) and above the sack (top 700), each 8px clear; the room view's sides plus 0.5rem.
    expect(panel?.style.top).toBe("158px");
    expect(panel?.style.bottom).toBe(`${VIEWPORT.height - 700 + 8}px`);
    expect(panel?.style.left).toBe("calc(300px + 0.5rem)");
    expect(panel?.style.right).toBe("calc(300px + 0.5rem)");
    // Not squeezed into the terminal's body.
    expect(panel?.closest(".terminal-overlay")).toBeNull();
  });

  it("opens over the terminal's body when the room view isn't on screen", () => {
    layout.mobile = true; // a phone on another tab: the sack is on the terminal's title row
    const { openInventory, inventory } = renderTerminal();
    openInventory();
    const panel = inventory();
    expect(panel?.closest(".terminal-overlay")).not.toBeNull();
    expect(panel?.classList.contains("terminal-inventory")).toBe(false);
  });

  it("shuts on a press elsewhere on the terminal, which stays open", () => {
    addRoomView();
    const { dialog, onClose, openInventory, inventory } = renderTerminal();
    openInventory();
    const panel = inventory();
    if (!panel) throw new Error("inventory did not open");

    fireEvent.pointerDown(panel);
    expect(inventory()).not.toBeNull();

    fireEvent.pointerDown(within(dialog).getByRole("tablist"));
    expect(inventory()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("toggles from its sack without the press on the sack shutting it first", () => {
    addRoomView();
    const { dialog, openInventory, inventory } = renderTerminal();
    const sack = within(dialog).getByRole("button", { name: /^Inventory/ });
    fireEvent.pointerDown(sack);
    openInventory();
    expect(inventory()).not.toBeNull();
    fireEvent.pointerDown(sack);
    openInventory();
    expect(inventory()).toBeNull();
  });
});
