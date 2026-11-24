// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { DELOGGED_KEY, SOMEONE, type LogLine } from "@mush2/shared";

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
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function renderLog(log: LogLine[]) {
  const base = sampleView(sampleState());
  const view = { ...base, log };
  return render(
    <I18nextProvider i18n={i18n}>
      <ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />
    </I18nextProvider>,
  );
}

describe("ITrackie all-seeing ninja and defacer log reveals (#486)", () => {
  it("shows Someone in live/seat view and Someone (Chao) when maskedActor is present", () => {
    const room = sampleView(sampleState()).you.room;
    renderLog([
      { cycle: 1, key: "leftRoom", params: { name: SOMEONE }, room, visibleTo: "all" },
      { cycle: 1, key: "leftRoom", params: { name: SOMEONE }, room, visibleTo: "all", maskedActor: "chao" },
    ]);
    expect(screen.getByText("Someone left the room.")).toBeTruthy();
    expect(screen.getByText("Someone (Chao) left the room.")).toBeTruthy();
  });

  it("reveals who cleared the logs on delogged when maskedActor is present", () => {
    const room = sampleView(sampleState()).you.room;
    renderLog([
      { cycle: 1, key: DELOGGED_KEY, room, visibleTo: "all" },
      { cycle: 1, key: DELOGGED_KEY, room, visibleTo: "all", maskedActor: "chao" },
    ]);
    expect(screen.getByText("The logs are all scrambled... Who has been messing with the sensors again!?")).toBeTruthy();
    expect(screen.getByText("The logs are all scrambled... (Chao cleared the logs.)")).toBeTruthy();
  });

  it("renders a Defaced badge and muted row style on swallowed lines", () => {
    const room = sampleView(sampleState()).you.room;
    const { container } = renderLog([
      { cycle: 1, key: "leftRoom", params: { name: "paola" }, room, visibleTo: [], defaced: true },
    ]);
    const badge = screen.getByRole("button", { name: "Defaced" });
    expect(badge.className).toBe("defaced-badge");
    expect(container.querySelector(".entry.private")).toBeTruthy();
    expect(screen.getByText(/Paola left the room\./)).toBeTruthy();
  });
});
