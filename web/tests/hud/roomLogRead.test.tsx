// @vitest-environment jsdom
//
// The Room tab's unread state in the DOM (#513): its badge, the unread icon, marking one line read by hover, tap or
// focus, Mark all read, the "New messages" divider, and the phone bottom nav's badge. These render the real ITrackie
// inside a `LogReadProvider` with a real store on in-memory storage. The store's own logic is in logRead.test.ts.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogLine, PlayerView } from "@mush2/shared";

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
import { LogReadProvider, createLogReadStore, type LogReadStore } from "../../src/logRead.ts";
import { BottomNav } from "../../src/hud/BottomNav.tsx";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { HOVER_READ_MS } from "../../src/hud/RoomLog.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

/** p0's view with `n` lines in the room p0 stands in, plus one from another room at the front. */
function viewWith(n: number): PlayerView {
  const base = sampleView(sampleState());
  const here = base.you.room;
  const lines: LogLine[] = [
    { cycle: 1, key: "crewWokeUp", visibleTo: "all", room: "BRIDGE" as LogLine["room"] },
    ...Array.from({ length: n }, (_, i): LogLine => ({ cycle: 1, key: "crewWokeUp", params: { n: i }, visibleTo: "all", room: here })),
  ];
  return { ...base, log: lines, logSeen: 10 + lines.length };
}

let store: LogReadStore;

beforeEach(() => {
  // Its own storage each time: `undefined` would fall back to jsdom's shared localStorage.
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  store = createLogReadStore({ key: "test", send: () => {}, storage });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Renders the iTrackie with the server's point at `from` (positions 11.. are p0's room's lines). */
function renderRoom(view: PlayerView, from: number) {
  store.connected();
  store.onView(view);
  store.fromServer(from);
  const node = (v: PlayerView) => (
    <LogReadProvider value={store}>
      <ITrackie view={v} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />
    </LogReadProvider>
  );
  return render(node(view));
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>("ol.feed > [data-pos]"));
const icons = () => document.querySelectorAll(".entry-unread").length;

describe("Room tab unread (#513)", () => {
  it("badges the tab, puts an icon on each unread line and the divider before the first", () => {
    // 4 lines here at 11..14; the server's point at 13 leaves two unread.
    renderRoom(viewWith(4), 13);
    expect(screen.getByRole("tab", { name: /2 unread/ })).not.toBeNull();
    expect(icons()).toBe(2);
    expect(rows().filter((r) => r.classList.contains("unread")).map((r) => r.dataset.pos)).toEqual(["13", "14"]);
    expect(document.querySelector(".entry-unread")?.getAttribute("aria-hidden")).toBe("true");
    const divider = document.querySelector("ol.feed > li.unread-divider");
    expect(divider?.nextElementSibling?.getAttribute("data-pos")).toBe("13");
  });

  it("reads one line on tap or focus, never the lines before it, and the divider stays put", () => {
    renderRoom(viewWith(4), 12);
    expect(icons()).toBe(3);
    fireEvent.click(rows().find((r) => r.dataset.pos === "14") as HTMLElement);
    expect(icons()).toBe(2);
    act(() => rows().find((r) => r.dataset.pos === "12")?.focus());
    expect(icons()).toBe(1);
    expect(document.querySelector("ol.feed > li.unread-divider")?.nextElementSibling?.getAttribute("data-pos")).toBe("12");
  });

  it("reads a line only after the mouse rests on it", () => {
    vi.useFakeTimers();
    renderRoom(viewWith(3), 11);
    const row = rows().find((r) => r.dataset.pos === "12") as HTMLElement;
    fireEvent.pointerOver(row, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(HOVER_READ_MS - 1));
    expect(icons()).toBe(3);
    // Moving on before the rest is up reads nothing.
    fireEvent.pointerOver(rows().find((r) => r.dataset.pos === "13") as HTMLElement, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(HOVER_READ_MS - 1));
    expect(icons()).toBe(3);
    act(() => vi.advanceTimersByTime(1));
    expect(icons()).toBe(2);
    expect(rows().find((r) => r.dataset.pos === "13")?.classList.contains("unread")).toBe(false);
    // A touch passing over reads nothing (a tap does, by click).
    fireEvent.pointerOver(row, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(HOVER_READ_MS));
    expect(icons()).toBe(2);
  });

  it("Mark all read on the Room tab reads every line and drops the divider", () => {
    renderRoom(viewWith(3), 11);
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/i }));
    expect(icons()).toBe(0);
    expect(document.querySelector("li.unread-divider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark all read/i })).toBeNull();
  });

  it("the phone bottom nav adds the room log's unread to the iTrackie badge", () => {
    const view = viewWith(3);
    store.connected();
    store.onView(view);
    store.fromServer(12);
    render(
      <LogReadProvider value={store}>
        <BottomNav panel="room" onChange={() => {}} view={view} />
      </LogReadProvider>,
    );
    expect(document.querySelector(".bottom-nav-button .tab-badge")?.textContent).toBe("2");
  });
});
