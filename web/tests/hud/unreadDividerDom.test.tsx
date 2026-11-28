// @vitest-environment jsdom
//
// The "New messages" divider and the unread bar (#400) in the DOM: `useUnreadDivider` in Thread.tsx, and Mark all read
// dropping it in ITrackie.tsx. Same harness as readMarking.test.tsx: a real store on in-memory storage, `getClientRects`
// stubbed to report a box unless something above is `hidden`. jsdom has no IntersectionObserver, so the divider always
// counts as on screen here: the bar's "scrolled above the feed" case and the scroll itself are untested.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelId, GameState, PlayerView } from "@mush2/shared";

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
import { ChatReadProvider, createChatReadStore, type ChatReadStore } from "../../src/chatRead.ts";
import { Thread } from "../../src/hud/Thread.tsx";
import { UnreadChip } from "../../src/hud/UnreadChip.tsx";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { sampleState, sampleView, say } from "../../src/designKit/sampleView.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** `n` more messages in global chat, from `from` (p1 by default; p0 is the reader). */
function sayMany(state: GameState, n: number, from = "p1"): GameState {
  let next = state;
  for (let i = 0; i < n; i++) next = say(next, "global", `message ${i}`, from);
  return next;
}

let store: ChatReadStore;
let focused: boolean;
let sent: string[];

beforeEach(() => {
  store = createChatReadStore({ key: "test", send: () => {}, storage: memoryStorage() });
  focused = true;
  sent = [];
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    const rects = this.closest("[hidden]") ? [] : [new DOMRect(0, 0, 100, 20)];
    return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup();
  store.dispose();
  vi.restoreAllMocks();
});

const withStore = (node: ReactNode) => <ChatReadProvider value={store}>{node}</ChatReadProvider>;

function renderThread(view: PlayerView, active = true) {
  const thread = (v: PlayerView, a: boolean) => withStore(<Thread view={v} channel="global" placeholder="Say something" onSend={(text) => sent.push(text)} onToggle={() => {}} active={a} />);
  const result = render(thread(view, active));
  return { ...result, update: (next: PlayerView, a = active) => result.rerender(thread(next, a)) };
}

const divider = () => document.querySelector<HTMLElement>("li.unread-divider");
/** The `seq` of the row right after the divider. */
const dividerBefore = () => (divider()?.nextElementSibling as HTMLElement | null)?.dataset.seq;
const bar = () => document.querySelector<HTMLElement>(".unread-bar");
const rows = () => Array.from(document.querySelectorAll<HTMLElement>("ol.feed > [data-seq]"));
const read = (channel: ChannelId = "global") => store.read(channel);

describe("placing the divider", () => {
  it("goes before the first message unread when the channel opens", () => {
    act(() => store.markAll({ global: 2 }));
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(divider()?.textContent).toBe("New messages");
    expect(dividerBefore()).toBe("2");
  });

  it("is absent when everything is read", () => {
    act(() => store.markAll({ global: 4 }));
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(divider()).toBeNull();
  });

  it("stays put however the reader reads: focus, clicks and arrow keys (#513)", () => {
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(dividerBefore()).toBe("0");
    act(() => rows()[3]?.focus());
    expect(store.local("global")).toEqual([3]);
    act(() => fireEvent.click(rows()[1] as HTMLElement));
    act(() => fireEvent.keyDown(rows()[1] as HTMLElement, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(rows()[2]);
    act(() => rows()[0]?.focus());
    expect(read()).toBe(4);
    expect(dividerBefore()).toBe("0");
  });

  it("goes before the first message not read one at a time when the channel opens", () => {
    act(() => store.markSeqs("global", [1, 2], 4));
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(dividerBefore()).toBe("0");
    cleanup();
    act(() => store.markSeqs("global", [0, 3], 5));
    renderThread(sampleView(sayMany(sampleState(), 5)));
    expect(dividerBefore()).toBe("4");
  });

  it("isn't placed while the channel isn't the one on screen, and is placed fresh each time it opens", () => {
    const view = sampleView(sayMany(sampleState(), 4));
    const { update } = renderThread(view, false);
    expect(divider()).toBeNull();
    act(() => store.markAll({ global: 1 }));
    update(view, true);
    expect(dividerBefore()).toBe("1");
    update(view, false);
    expect(divider()).toBeNull();
    act(() => store.markAll({ global: 3 }));
    update(view, true);
    expect(dividerBefore()).toBe("3");
  });

  it("appears for unread that arrives unmarked when there was none", () => {
    const state = sayMany(sampleState(), 2);
    act(() => store.markAll({ global: 2 }));
    const { update } = renderThread(sampleView(state));
    expect(divider()).toBeNull();
    focused = false;
    update(sampleView(sayMany(state, 1)));
    expect(dividerBefore()).toBe("2");
  });

  it("doesn't appear for messages that arrive while the reader watches", () => {
    const state = sayMany(sampleState(), 2);
    act(() => store.markAll({ global: 2 }));
    const { update } = renderThread(sampleView(state));
    update(sampleView(sayMany(state, 1)));
    expect(read()).toBe(3);
    expect(divider()).toBeNull();
  });

  it("doesn't appear above your own message before the server's count arrives", () => {
    const state = sayMany(sampleState(), 2);
    act(() => store.markAll({ global: 2 }));
    const { update } = renderThread(sampleView(state));
    focused = false;
    update(sampleView(sayMany(state, 1, "p0")));
    expect(divider()).toBeNull();
  });
});

describe("keeping and dropping the divider", () => {
  it("sending keeps it, and reads nothing else (#513)", async () => {
    const user = userEvent.setup();
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(divider()).not.toBeNull();
    await user.type(screen.getByRole("textbox"), "hi{Enter}");
    expect(sent).toEqual(["hi"]);
    expect(dividerBefore()).toBe("0");
    expect(read()).toBe(0);
  });

  it("Mark all read drops it", async () => {
    const user = userEvent.setup();
    render(withStore(<ITrackie view={sampleView(sayMany(sampleState(), 3))} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />));
    await user.click(screen.getByRole("tab", { name: /global/i }));
    expect(divider()).not.toBeNull();
    await user.click(document.querySelector("button.mark-read") as HTMLButtonElement);
    expect(divider()).toBeNull();
  });
});

describe("the unread bar", () => {
  it("offers a jump to an earlier page, and goes once there", () => {
    // 101 messages: pages 0, 1 and 2 (seq 100). The view holds pages 1 and 2, so no fetch is needed.
    act(() => store.markAll({ global: 60 }));
    renderThread(sampleView(sayMany(sampleState(), 101)));
    expect(divider()).toBeNull();
    expect(bar()?.textContent).toContain("41 new messages");
    fireEvent.click(screen.getByRole("button", { name: "Jump to the first new message" }));
    expect(dividerBefore()).toBe("60");
    expect(bar()).toBeNull();
  });

  it("isn't shown while the divider is on the page (and on screen)", () => {
    act(() => store.markAll({ global: 1 }));
    renderThread(sampleView(sayMany(sampleState(), 4)));
    expect(divider()).not.toBeNull();
    expect(bar()).toBeNull();
  });
});

describe("unread chips", () => {
  it("show a channel's unread, in the row's accessible name too, and go when it is read", () => {
    act(() => store.markAll({ botany: 1 }));
    render(
      withStore(
        <button type="button">
          Botany
          <UnreadChip channel="botany" total={4} />
        </button>,
      ),
    );
    expect(document.querySelector(".unread-chip")?.textContent).toBe("3");
    expect(screen.getByRole("button", { name: "Botany 3 unread" })).not.toBeNull();
    // A message read one at a time comes off it (#513).
    act(() => store.markSeqs("botany", [3], 4));
    expect(document.querySelector(".unread-chip")?.textContent).toBe("2");
    act(() => store.markAll({ botany: 4 }));
    expect(document.querySelector(".unread-chip")).toBeNull();
  });
});
