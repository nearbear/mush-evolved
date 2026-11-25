// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { PROJECT_COMPLETE, type PlayerView } from "@mush2/shared";

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

import i18n from "../../src/i18n/index.ts";
import { TerminalBody } from "../../src/hud/TerminalDialog.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function renderCore(overrides: Partial<PlayerView>) {
  const view: PlayerView = { ...sampleView(sampleState()), ...overrides };
  render(
    <I18nextProvider i18n={i18n}>
      <TerminalBody terminal={{ id: "core", type: "NERON_CORE" }} view={view} onAction={() => {}} />
    </I18nextProvider>,
  );
}

describe("NERON core project list", () => {
  it("puts discarded projects in a Discarded tab and captions done and discarded ones with their description", () => {
    renderCore({ projects: { ARMOUR_CORRIDOR: PROJECT_COMPLETE }, discardedProjects: ["DISMANTLING"], relay: { research: {}, projects: {}, pilgred: null } });
    const tabs = screen.getByRole("tablist", { name: "NERON projects" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Active", "Done", "Discarded"]);

    fireEvent.click(within(tabs).getByRole("tab", { name: "Done" }));
    const done = screen.getByRole("list", { name: "Done" });
    expect(within(done).getByText(i18n.t("projects.desc.ARMOUR_CORRIDOR"))).toBeTruthy();
    expect(within(done).queryByText("Complete")).toBeNull();

    fireEvent.click(within(tabs).getByRole("tab", { name: "Discarded" }));
    const discarded = screen.getByRole("list", { name: "Discarded" });
    const row = within(discarded).getByRole("listitem");
    expect(row.className).toContain("research-item-discarded");
    expect(within(row).getByText(i18n.t("projects.desc.DISMANTLING"))).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
  });
});
