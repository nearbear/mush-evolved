// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { PROJECT_COMPLETE, PROJECT_IDS, type PlayerView } from "@mush2/shared";

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
import { ProjectTracker } from "../../src/hud/ProjectTracker.tsx";
import { ResearchTracker } from "../../src/hud/ResearchTracker.tsx";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return { ...sampleView(sampleState()), ...overrides };
}

describe("ProjectTracker", () => {
  it("lists completed projects first in colour and the rest greyed out", () => {
    const view = makeView({
      projects: { PLASMA_SHIELD: PROJECT_COMPLETE, OXY_MORE: PROJECT_COMPLETE },
      relay: { research: {}, projects: {}, pilgred: null },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectTracker view={view} />
      </I18nextProvider>,
    );
    const list = screen.getByRole("list", { name: "NERON projects tracker" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(PROJECT_IDS.length);
    expect(items[0]!.className).toBe("research-tracker-card");
    expect(items[0]!.getAttribute("aria-label")).toBe("Plasma shield: Complete");
    expect(items[1]!.className).toBe("research-tracker-card");
    expect(items[1]!.getAttribute("aria-label")).toBe("Oxygenated ducts: Complete");
    expect(items[2]!.className).toBe("research-tracker-card pending");
    expect(items[2]!.getAttribute("aria-label")).toContain(": Not complete");
  });

  it("shows progress for offered projects when at NERON's core and not complete for the rest", () => {
    const view = makeView({
      projects: { FIRE_SENSOR: 45 },
      relay: {
        research: {},
        projects: { FIRE_SENSOR: { waiting: 0, gain: [6, 9], tokens: [] } },
        pilgred: null,
      },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectTracker view={view} />
      </I18nextProvider>,
    );
    const list = screen.getByRole("list", { name: "NERON projects tracker" });
    const offered = within(list).getByRole("listitem", { name: "Fire detectors: 45% done" });
    expect(offered.className).toBe("research-tracker-card pending");
    const other = within(list).getByRole("listitem", { name: "Plasma shield: Not complete" });
    expect(other.className).toBe("research-tracker-card pending");
  });

  it("renders inside ITrackie for the NERON projects feature", () => {
    const view = makeView({ projects: { PLASMA_SHIELD: PROJECT_COMPLETE } });
    render(
      <I18nextProvider i18n={i18n}>
        <ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />
      </I18nextProvider>,
    );
    const list = screen.getByRole("list", { name: "NERON projects tracker", hidden: true });
    expect(within(list).getAllByRole("listitem", { hidden: true })).toHaveLength(PROJECT_IDS.length);
  });

  it("opens a tooltip with the project description when activated", () => {
    const view = makeView();
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectTracker view={view} />
      </I18nextProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Plasma shield" });
    fireEvent.click(trigger);
    expect(screen.getByText(i18n.t("projects.desc.PLASMA_SHIELD"))).toBeTruthy();
  });
});

describe("ResearchTracker tooltips", () => {
  it("opens a tooltip with the research description when activated", () => {
    const view = makeView();
    render(
      <I18nextProvider i18n={i18n}>
        <ResearchTracker view={view} />
      </I18nextProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Mycoscan creation" });
    fireEvent.click(trigger);
    expect(screen.getByText(i18n.t("research.desc.MYCOSCAN"))).toBeTruthy();
  });
});
