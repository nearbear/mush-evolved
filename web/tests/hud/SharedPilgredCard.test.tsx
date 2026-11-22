// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import type { EquipmentView, PlayerView } from "@mush2/shared";

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
import { SharedPilgredCard } from "../../src/hud/SharedPilgredCard.tsx";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { TerminalBody } from "../../src/hud/TerminalDialog.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return { ...sampleView(sampleState()), ...overrides };
}

describe("SharedPilgredCard", () => {
  it("renders a single progress bar with the shared percent, author, and optional note", () => {
    const view = makeView({
      sharedPilgred: { percent: 64, text: "Need 1 more Physicist", by: "p0", day: 2, cycleOfDay: 5 },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <SharedPilgredCard shared={view.sharedPilgred!} view={view} />
      </I18nextProvider>,
    );
    const card = screen.getByRole("region", { name: "Shared PILGRED progress" });
    const bar = within(card).getByRole("progressbar", { name: "PILGRED repair" });
    expect(bar.getAttribute("aria-valuenow")).toBe("64");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(within(card).getByText("64%")).toBeTruthy();
    expect(within(card).getByText("Need 1 more Physicist")).toBeTruthy();
  });

  it("renders inside ITrackie for the PILGRED feature when shared", () => {
    const view = makeView({
      sharedPilgred: { percent: 30, text: "", by: "p0", day: 1, cycleOfDay: 3 },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />
      </I18nextProvider>,
    );
    const card = screen.getByRole("region", { name: "Shared PILGRED progress", hidden: true });
    expect(within(card).getByText("30%")).toBeTruthy();
  });
});

describe("PILGRED terminal share form", () => {
  const terminal: EquipmentView = { id: "ENGINE_ROOM:PILGRED", type: "PILGRED", broken: false };

  it("prefills with real progress and submits edited percent and note", () => {
    const onShare = vi.fn();
    const view = makeView({ pilgred: 35, canSharePilgred: true });
    render(
      <I18nextProvider i18n={i18n}>
        <TerminalBody terminal={terminal} view={view} onAction={() => {}} onSharePilgred={onShare} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share status" }));
    const input = screen.getByLabelText("Progress (%)") as HTMLInputElement;
    expect(input.value).toBe("35");
    fireEvent.change(input, { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Almost done" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onShare).toHaveBeenCalledWith(80, "Almost done");
  });
});
