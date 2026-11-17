// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { addSignal, type GameState, viewFor } from "@mush2/shared";

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
import { nextPlayback, REPLY_DELAY_MS, skipPlayback, TYPE_MS_PER_CHAR } from "../../src/hud/signalPlayback.ts";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("signal playback", () => {
  const feed = [{ from: "officer" }, { from: "signal" }];
  const texts = ["Hello.", "Hi"];

  it("shows officer lines at once, then waits the reply delay, then types the reply out one character at a time", () => {
    let p = { shown: 0, phase: "idle" as const, chars: 0 };
    const steps: [string, number][] = [];
    for (let step = nextPlayback(p, feed, texts); step; step = nextPlayback(p, feed, texts)) {
      steps.push([`${step.next.shown}:${step.next.phase}:${step.next.chars}`, step.after]);
      p = step.next as typeof p;
    }
    expect(steps).toEqual([
      ["1:idle:0", 0],
      ["1:waiting:0", 0],
      ["1:typing:0", REPLY_DELAY_MS],
      ["1:typing:1", TYPE_MS_PER_CHAR],
      ["1:typing:2", TYPE_MS_PER_CHAR],
      ["2:idle:0", 0],
    ]);
  });

  it("skips the typing but not the wait", () => {
    expect(skipPlayback({ shown: 1, phase: "typing", chars: 1 })).toEqual({ shown: 2, phase: "idle", chars: 0 });
    const waiting = { shown: 1, phase: "waiting" as const, chars: 0 };
    expect(skipPlayback(waiting)).toBe(waiting);
  });
});

function comms(officer: boolean) {
  const s = sampleState();
  const [room, list] = Object.entries(s.equipment).find(([, l]) => l.some((e) => e.type === "COM_CENTER"))!;
  const terminal = list.find((e) => e.type === "COM_CENTER")!;
  s.players[0]!.room = room as GameState["players"][number]["room"];
  s.titles.comms_officer = officer ? s.players[0]!.id : null;
  const signal = addSignal(s, "merchant", s.cycle + 4, {
    merchant: { kind: "transport", event: "HUMAN_VS_FUEL", deals: [
      { give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "ration", count: 2 }] },
      { give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "ration", count: 3 }], skill: "diplomacy" },
    ] },
  });
  const ui = (state: GameState) => (
    <I18nextProvider i18n={i18n}>
      <CommsCenter terminal={{ id: terminal.id, type: terminal.type, broken: false, room }} view={viewFor(state, s.players[0]!.id)} onAction={() => {}} />
    </I18nextProvider>
  );
  return { s, signal, ui };
}

describe("Signals tab", () => {
  it("shows a non-officer one line and no count", () => {
    const { s, ui } = comms(false);
    render(ui(s));
    fireEvent.click(screen.getByRole("tab", { name: "Signals" }));
    expect(screen.getByText("Comms Officer access only.")).toBeTruthy();
    expect(screen.queryByText("Transport")).toBeNull();
  });

  it("lists a hailing merchant, opens its conversation, and paces the reply after Contact", () => {
    vi.useFakeTimers();
    const { s, signal, ui } = comms(true);
    const { rerender } = render(ui(s));
    fireEvent.click(screen.getByRole("tab", { name: "Signals (1)" }));
    expect(screen.getByText("Hailing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the conversation with Transport" }));
    expect(screen.getByRole("button", { name: /Contact/ })).toBeTruthy();

    // The server answers at once (what contact_signal records); the client waits, then types.
    signal.feed.push({ from: "signal", at: s.cycle, key: "signals.merchant.transport.hail.HUMAN_VS_FUEL" });
    signal.step = "offers";
    rerender(ui(s));
    const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    tick(0); // the reply's wait begins
    expect(screen.getByText("Incoming transmission…")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Replies" })).toBeNull();

    tick(REPLY_DELAY_MS);
    tick(TYPE_MS_PER_CHAR);
    expect(screen.queryByText("Incoming transmission…")).toBeNull();
    expect(screen.queryByRole("group", { name: "Replies" })).toBeNull();
    fireEvent.click(screen.getByRole("log", { name: "Conversation" }));
    expect(screen.getByText(/surplus of antifreeze/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Replies" })).toBeTruthy();
    // One small Deal! per deal on its row; a skill deal shows the skill's icon, dimmed and saying so (nobody has it here).
    expect(screen.getAllByRole("button", { name: /Deal!/ })).toHaveLength(2);
    expect(screen.getByAltText(/Nobody in the Comms Officer's room has the/).hasAttribute("data-met")).toBe(false);
    expect(screen.getByRole("button", { name: /No deal!/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Open the conversation with Transport" })).toBeTruthy();
  });

  it("shows history whole when the conversation opens", () => {
    const { s, signal, ui } = comms(true);
    signal.feed.push({ from: "signal", at: s.cycle, key: "signals.merchant.transport.hail.HUMAN_VS_FUEL" });
    signal.status = "lost";
    signal.feed.push({ from: "system", at: s.cycle, key: "signals.lost", closes: true });
    render(ui(s));
    fireEvent.click(screen.getByRole("tab", { name: "Signals" }));
    expect(screen.getByText("Inactive")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the conversation with Transport" }));
    expect(screen.getByText(/surplus of antifreeze/)).toBeTruthy();
    expect(screen.getByText("This conversation is over.")).toBeTruthy();
  });
});
