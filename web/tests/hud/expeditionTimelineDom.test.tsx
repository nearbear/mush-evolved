// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";

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
import { expeditionSamples } from "../../src/designKit/samples.ts";
import { ExpeditionTimeline } from "../../src/hud/ExpeditionTimeline.tsx";
import { IcarusPanel } from "../../src/hud/IcarusPanel.tsx";
import type { PlayerView } from "@mush2/shared";

afterEach(cleanup);

const renderTimeline = (view: PlayerView) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ExpeditionTimeline expedition={view.expedition} report={view.expeditions.at(-1)} />
    </I18nextProvider>,
  );

const current = () => screen.getByRole("group", { name: /^Step \d+ of \d+$/ });

describe("ExpeditionTimeline", () => {
  it("opens on the latest step and moves with the arrows and keys", () => {
    void i18n.changeLanguage("en");
    renderTimeline(expeditionSamples.away);
    // 4 steps, the next, 2 later, Return.
    expect(current().getAttribute("aria-label")).toBe("Step 4 of 8");
    expect(current().textContent).toContain("Alien zombies");
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(current().getAttribute("aria-label")).toBe("Step 5 of 8");
    expect(current().textContent).toContain("Unknown sector");
    fireEvent.keyDown(current(), { key: "ArrowLeft" });
    fireEvent.keyDown(current(), { key: "ArrowLeft" });
    expect(current().textContent).toContain("Again");
  });

  it("follows a new step from the latest one, and marks it while you look back", () => {
    const view = expeditionSamples.away;
    const withStep = (v: PlayerView): PlayerView => {
      const report = v.expeditions.at(-1)!;
      return { ...v, expeditions: [{ ...report, events: [...report.events, { sector: "OCEAN", kind: "nothing" }] }] };
    };
    const tree = (v: PlayerView) => (
      <I18nextProvider i18n={i18n}>
        <ExpeditionTimeline expedition={v.expedition} report={v.expeditions.at(-1)} />
      </I18nextProvider>
    );
    const { rerender } = render(tree(view));
    rerender(tree(withStep(view)));
    expect(current().getAttribute("aria-label")).toBe("Step 5 of 9");
    expect(screen.queryByRole("button", { name: /new steps/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    rerender(tree(withStep(withStep(view))));
    expect(current().getAttribute("aria-label")).toBe("Step 4 of 10");
    fireEvent.click(screen.getByRole("button", { name: "Next step (new steps)" }));
    fireEvent.click(screen.getByRole("button", { name: "Next step (new steps)" }));
    expect(screen.getByRole("button", { name: "Next step" })).toBeTruthy();
  });

  it("shows the seats under the timeline, with each member's (stubbed) HP and no max", () => {
    const crew = expeditionSamples.away;
    render(
      <I18nextProvider i18n={i18n}>
        <IcarusPanel view={crew} expedition={crew.expedition} selected={{ kind: "player", id: crew.you.id }} onSelect={() => {}} onAction={() => {}} />
      </I18nextProvider>,
    );
    const seats = screen.getByRole("list", { name: "Seats in the Icarus" });
    expect(seats.textContent).toContain("Chun6 HP");
    expect(seats.textContent).toContain(`Kuan Ti9 HP`);
    expect(seats.textContent).toContain(`${crew.you.hp} HP`);
    expect(seats.textContent).not.toContain("/");
    expect(screen.getByRole("heading", { name: "Exploring Sicyrus" })).toBeTruthy();
  });

  it("names the next sector to a U-turn holder only", () => {
    renderTimeline(expeditionSamples.uTurn);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(current().textContent).toContain("Ocean");
    cleanup();
    renderTimeline(expeditionSamples.away);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(current().textContent).not.toContain("Ocean");
  });

  it("stops a lost member's timeline where they got lost", () => {
    renderTimeline(expeditionSamples.lost);
    expect(current().getAttribute("aria-label")).toBe("Step 3 of 3");
    expect(screen.getByRole("button", { name: "Next step" })).toHaveProperty("disabled", true);
  });
});
