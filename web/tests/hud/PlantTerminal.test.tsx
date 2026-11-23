// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
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
import i18n from "../../src/i18n/index.ts";
import { COLLAPSE_ICON, EXPAND_ICON } from "../../src/art/assets.ts";
import { PlantTerminal } from "../../src/hud/PlantTerminal.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makePlantTerminalState() {
  const s = sampleState();
  const [room, eq] = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "PLANT_CONTROLLER"))!;
  const terminal = eq.find((e) => e.type === "PLANT_CONTROLLER")!;
  s.players[0]!.room = room;
  return { s, terminal: { id: terminal.id, type: terminal.type, broken: false, room } };
}

describe("PlantTerminal", () => {
  it("shows a collapsible botany basics caption at the top using more.png/less.png", () => {
    const { s, terminal } = makePlantTerminalState();
    render(
      <I18nextProvider i18n={i18n}>
        <PlantTerminal terminal={terminal} view={viewFor(s, "p0")} />
      </I18nextProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Botany basics" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const icon = trigger.querySelector("img")!;
    expect(icon.getAttribute("src")).toBe(EXPAND_ICON);
    expect(screen.queryByText(/Plant a fruit in an empty hydropot/i)).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(icon.getAttribute("src")).toBe(COLLAPSE_ICON);
    expect(screen.getByText(/Plant a fruit in an empty hydropot/i)).toBeTruthy();
    expect(screen.getByText(/graft an alien fruit/i)).toBeTruthy();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(icon.getAttribute("src")).toBe(EXPAND_ICON);
  });
});
