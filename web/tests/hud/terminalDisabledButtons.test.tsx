// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
import { CommsCenter } from "../../src/hud/CommsCenter.tsx";
import { ShipNavigation } from "../../src/hud/ShipNavigation.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makeBridgeState() {
  const s = sampleState();
  const [bridgeRoom, bridgeEq] = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "PILOT_MODULE"))!;
  const [comRoom, comEq] = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "COM_CENTER"))!;
  const terminal = bridgeEq.find((e) => e.type === "PILOT_MODULE")!;
  const comTerminal = comEq.find((e) => e.type === "COM_CENTER")!;
  return { s, bridgeRoom, comRoom, terminal, comTerminal };
}

describe("Command terminal and Comms center disabled buttons", () => {
  it("disables ShipNavigation buttons when not commander, hiding Leave orbit in open space and Travel in orbit", () => {
    const { s, bridgeRoom, terminal } = makeBridgeState();
    s.players[0]!.room = bridgeRoom;
    s.titles.commander = "p1";
    const openSpaceView = viewFor(s, "p0");
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ShipNavigation terminal={{ id: terminal.id, type: terminal.type, broken: false, room: bridgeRoom }} view={openSpaceView} onAction={() => {}} />
      </I18nextProvider>,
    );
    for (const label of ["Turn left", "Turn right", "Travel"]) {
      const button = screen.getByRole("button", { name: new RegExp(label) });
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.queryByRole("button", { name: /Leave orbit/ })).toBeNull();

    s.navigation.orbit = "planet-1";
    const orbitView = viewFor(s, "p0");
    rerender(
      <I18nextProvider i18n={i18n}>
        <ShipNavigation terminal={{ id: terminal.id, type: terminal.type, broken: false, room: bridgeRoom }} view={orbitView} onAction={() => {}} />
      </I18nextProvider>,
    );
    for (const label of ["Turn left", "Turn right", "Leave orbit"]) {
      const button = screen.getByRole("button", { name: new RegExp(label) });
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.queryByRole("button", { name: /Travel/ })).toBeNull();
  });

  it("hides Leave orbit in open space and Travel in orbit for the Commander", () => {
    const { s, bridgeRoom, terminal } = makeBridgeState();
    s.players[0]!.room = bridgeRoom;
    s.titles.commander = "p0";
    const openSpaceView = viewFor(s, "p0");
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ShipNavigation terminal={{ id: terminal.id, type: terminal.type, broken: false, room: bridgeRoom }} view={openSpaceView} onAction={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: /Travel/ }).getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: /Leave orbit/ })).toBeNull();

    s.navigation.orbit = "planet-1";
    const orbitView = viewFor(s, "p0");
    rerender(
      <I18nextProvider i18n={i18n}>
        <ShipNavigation terminal={{ id: terminal.id, type: terminal.type, broken: false, room: bridgeRoom }} view={orbitView} onAction={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("button", { name: /Travel/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Leave orbit/ }).getAttribute("aria-disabled")).toBeNull();
  });

  it("never hides the Connect to Sol button in CommsCenter when already linked", () => {
    const { s, comRoom, comTerminal } = makeBridgeState();
    s.players[0]!.room = comRoom;
    s.comms.linked = true;
    const view = viewFor(s, "p0");
    render(
      <I18nextProvider i18n={i18n}>
        <CommsCenter terminal={{ id: comTerminal.id, type: comTerminal.type, broken: false, room: comRoom }} view={view} onAction={() => {}} />
      </I18nextProvider>,
    );
    const button = screen.getByRole("button", { name: /Establish link with Sol/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });
});
