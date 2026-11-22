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
import { BiosTerminal } from "../../src/hud/BiosTerminal.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makeBiosState() {
  const s = sampleState();
  const [room, eq] = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "NERON_BIOS_TERM"))!;
  const terminal = eq.find((e) => e.type === "NERON_BIOS_TERM")!;
  s.players[0]!.room = room;
  return { s, room, terminal: { id: terminal.id, type: terminal.type, broken: false, room } };
}

describe("BiosTerminal", () => {
  it("renders on/off options as toggle switches that toggle on a single click for the NERON Admin", () => {
    const { s, terminal } = makeBiosState();
    s.titles.neron_admin = "p0";
    s.bios.actopi = true;
    s.bios.death_announcements = false;
    s.bios.plasma_shield = true;
    const onAction = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <BiosTerminal terminal={terminal} view={viewFor(s, "p0")} onAction={onAction} />
      </I18nextProvider>,
    );

    const actopi = screen.getByRole("switch", { name: "ACTOPI" });
    const deaths = screen.getByRole("switch", { name: "Death announcements" });
    const shield = screen.getByRole("switch", { name: "Plasma shield" });
    expect(actopi.getAttribute("aria-checked")).toBe("true");
    expect(deaths.getAttribute("aria-checked")).toBe("false");
    expect(shield.getAttribute("aria-checked")).toBe("true");
    expect((actopi as HTMLButtonElement).disabled).toBe(false);

    // Free, reversible BIOS toggles fire on a single click.
    fireEvent.click(actopi);
    expect(onAction).toHaveBeenCalledWith({
      type: "set_bios",
      equipment: terminal.id,
      option: "actopi",
      value: false,
    });

    // Multi-choice options render as radio groups with "None" hidden from CPU priority.
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "None" })).toBeNull();
    const astro = screen.getByRole("radio", { name: "Astronavigation" });
    expect(astro.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(astro);
    expect(onAction).toHaveBeenCalledWith({
      type: "set_bios",
      equipment: terminal.id,
      option: "cpu_priority",
      value: "astronavigation",
    });

    // Descriptions live in title tooltips rather than inline in the rows.
    expect(screen.queryByText(/everyone knows who is in which room/i)).toBeNull();
    fireEvent.click(screen.getByText("ACTOPI"));
    expect(screen.getByText(/everyone knows who is in which room/i)).toBeTruthy();
  });

  it("renders disabled toggle switches and read-only radios reflecting current state for non-admins", () => {
    const { s, terminal } = makeBiosState();
    s.titles.neron_admin = "p1";
    s.bios.actopi = false;
    s.bios.death_announcements = true;
    s.bios.cpu_priority = "astronavigation";
    s.bios.crew_lock = "projects";
    render(
      <I18nextProvider i18n={i18n}>
        <BiosTerminal terminal={terminal} view={viewFor(s, "p0")} onAction={() => {}} />
      </I18nextProvider>,
    );

    const actopi = screen.getByRole("switch", { name: "ACTOPI" }) as HTMLButtonElement;
    const deaths = screen.getByRole("switch", { name: "Death announcements" }) as HTMLButtonElement;
    expect(actopi.getAttribute("aria-checked")).toBe("false");
    expect(deaths.getAttribute("aria-checked")).toBe("true");
    expect(actopi.disabled).toBe(true);
    expect(deaths.disabled).toBe(true);

    const astro = screen.getByRole("radio", { name: "Astronavigation" }) as HTMLButtonElement;
    const piloting = screen.getByRole("radio", { name: "Piloting" }) as HTMLButtonElement;
    expect(screen.queryByRole("radio", { name: "None" })).toBeNull();
    expect(astro.getAttribute("aria-checked")).toBe("true");
    expect(piloting.getAttribute("aria-checked")).toBe("false");
    expect(piloting.disabled).toBe(true);
  });
});
