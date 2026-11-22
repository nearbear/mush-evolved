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
import { GameView } from "../../src/GameView.tsx";
import { IcarusPanel } from "../../src/hud/IcarusPanel.tsx";
import { ShipStatus } from "../../src/hud/ShipStatus.tsx";
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
    expect(current().textContent).toContain("Unknown");
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

  it("shows the active crew seats under the timeline with heart HP icons, no empty seats, and no timer in the action bar", () => {
    const crew = expeditionSamples.away;
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <IcarusPanel view={crew} expedition={crew.expedition} selected={{ kind: "player", id: crew.you.id }} onSelect={() => {}} onAction={() => {}} planet={null} />
      </I18nextProvider>,
    );
    const seats = screen.getByRole("list", { name: "Seats in the Icarus" });
    expect(seats.querySelectorAll("li")).toHaveLength(3);
    expect(seats.textContent).toContain("Chun");
    expect(seats.textContent).toContain("6 HP");
    expect(seats.textContent).toContain("Kuan Ti");
    expect(seats.textContent).toContain("9 HP");
    expect(seats.textContent).toContain(`${crew.you.hp} HP`);
    expect(seats.textContent).not.toContain("/");
    expect(seats.querySelectorAll(".icarus-hp img")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Exploring Sicyrus" })).toBeTruthy();
    // No return timer inside the Icarus action bar (it lives in the top bar).
    expect(container.querySelector(".icarus-bar")?.textContent).not.toMatch(/Back in/);
  });

  it("keeps a lost crew member's podium empty with their name and no HP during the expedition", () => {
    const base = expeditionSamples.away;
    const withLost: PlayerView = {
      ...base,
      players: base.players.map((p) => (p.character === "chun" ? { ...p, room: "LOST:p1" } : p)),
      lost: [{ name: "chun", planet: base.expedition!.planet }],
    };
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <IcarusPanel view={withLost} expedition={withLost.expedition} selected={{ kind: "player", id: withLost.you.id }} onSelect={() => {}} onAction={() => {}} planet={null} />
      </I18nextProvider>,
    );
    const seats = screen.getByRole("list", { name: "Seats in the Icarus" });
    expect(seats.querySelectorAll("li")).toHaveLength(3);
    const lostSeat = container.querySelector(".icarus-seat-lost")!;
    expect(lostSeat).toBeTruthy();
    expect(lostSeat.textContent).toContain("Chun");
    expect(lostSeat.querySelector(".pod-sprite")).toBeNull();
    expect(lostSeat.querySelector(".icarus-hp")).toBeNull();
  });

  it("shows the shared planet report in the top bar planet status popover while orbiting and while exploring", () => {
    const shared = expeditionSamples.away.sharedPlanets[0]!;
    // While in orbit (no expedition away).
    render(
      <I18nextProvider i18n={i18n}>
        <ShipStatus preselection={false} orbit="Sicyrus" expedition={null} shared={shared} sharedBy="Lai Kuan-Ti" />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Orbiting Sicyrus" }));
    expect(screen.getByText(/Shared by Lai Kuan-Ti/)).toBeTruthy();
    expect(screen.getByText(shared.text)).toBeTruthy();
    cleanup();
    // While exploring: planet icon + countdown clock (no "Exploring" text), same popover.
    render(
      <I18nextProvider i18n={i18n}>
        <ShipStatus preselection={false} orbit="Sicyrus" expedition={expeditionSamples.away.expedition} shared={shared} sharedBy="Lai Kuan-Ti" />
      </I18nextProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Expedition to Sicyrus/ });
    expect(trigger.querySelector("img")).toBeTruthy();
    expect(trigger.querySelector(".cycle-countdown")).toBeTruthy();
    expect(trigger.textContent).not.toContain("Exploring");
    fireEvent.click(trigger);
    expect(screen.getByText(/Shared by Lai Kuan-Ti/)).toBeTruthy();
    expect(screen.getByText(shared.text)).toBeTruthy();
  });

  it("hides the ID card while lost, and hides the mobile peek bar on expedition and lost screens", () => {
    const lostInPlace: PlayerView = {
      ...expeditionSamples.lost,
      you: { ...expeditionSamples.lost.you, room: `LOST:${expeditionSamples.lost.you.id}` },
    };
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <GameView view={lostInPlace} onLeave={() => {}} />
      </I18nextProvider>,
    );
    expect(container.querySelector(".self-hud")).toBeNull();
    expect(container.querySelector(".nameplate")).toBeNull();
    cleanup();
    // Mobile: no peek bar in Icarus or while lost.
    const origMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({ matches: query.includes("1023"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
    try {
      const awayMobile = render(
        <I18nextProvider i18n={i18n}>
          <GameView view={expeditionSamples.away} onLeave={() => {}} />
        </I18nextProvider>,
      );
      expect(awayMobile.container.querySelector(".peek-bar")).toBeNull();
      cleanup();
      const lostMobile = render(
        <I18nextProvider i18n={i18n}>
          <GameView view={lostInPlace} onLeave={() => {}} />
        </I18nextProvider>,
      );
      expect(lostMobile.container.querySelector(".peek-bar")).toBeNull();
      expect(lostMobile.container.querySelector(".nameplate")).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
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
