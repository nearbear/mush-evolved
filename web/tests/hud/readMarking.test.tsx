// @vitest-environment jsdom
//
// Chat read marking in the DOM (#403): `useReadMarking` in Thread.tsx (#400), and Mark all read in ITrackie.tsx. These
// render the real components in jsdom, inside a `ChatReadProvider` with a real store on in-memory storage, and check
// `store.read(channel)`. The pure parts (feedKeys.ts, `readAllOn`) have their own node tests.
//
// What jsdom can't check, so these don't:
// - Real layout. jsdom has none: `getClientRects` is stubbed here to report a box unless an ancestor has the `hidden`
//   attribute. The real app hides tabs, features, private channels and the phone panel with CSS (`display: none`),
//   which this stub doesn't see, so whether those feeds really have no boxes is untested.
// - Safari not focusing a button on click (why the feed marks on click too): jsdom's clicks never focus anything.
// - Real `:focus-visible`: jsdom matches it on any focused element, mouse or keyboard, so "a click on the feed's blank
//   space doesn't jump to a row" isn't checked.
// - The window being focused and visible: `document.hasFocus` and `visibilityState` are stubbed.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelId, PlayerView } from "@mush2/shared";

// useMobile.ts reads matchMedia when it loads, and Base UI's scroll area needs ResizeObserver and getAnimations: stub
// them before the components are imported (vi.hoisted runs ahead of the imports).
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
  // Base UI waits for an element's animations before it settles; jsdom has no Web Animations.
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import "../../src/i18n/index.ts";
import { ChatReadProvider, createChatReadStore, type ChatReadStore } from "../../src/chatRead.ts";
import { BottomNav } from "../../src/hud/BottomNav.tsx";
import { MessageEntry, Thread } from "../../src/hud/Thread.tsx";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { ended, sampleState, sampleView, say } from "../../src/designKit/sampleView.ts";

/** An in-memory localStorage. */
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

/** p0's view with `n` messages in global chat, alternating p1's and p0's own (seq 0..n-1). */
function viewWith(n: number): PlayerView {
  let state = sampleState();
  for (let i = 0; i < n; i++) state = say(state, "global", `message ${i}`, i % 2 === 0 ? "p1" : "p0");
  return sampleView(state);
}

// Built once: each is a real 16-seat game through the rules.
const VIEWS = [0, 1, 2, 3, 4].map(viewWith);

let store: ChatReadStore;
let focused: boolean;

beforeEach(() => {
  store = createChatReadStore({ key: "test", send: () => {}, storage: memoryStorage() });
  focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  // A box unless something above is `hidden` (the only way these tests hide a feed).
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

const withStore = (node: ReactNode, withProvider = true) => (withProvider ? <ChatReadProvider value={store}>{node}</ChatReadProvider> : node);

function renderThread(view: PlayerView, { provider = true, hidden = false, head }: { provider?: boolean; hidden?: boolean; head?: ReactNode } = {}) {
  const thread = (v: PlayerView) =>
    withStore(
      <div hidden={hidden}>
        <Thread view={v} channel="global" placeholder="Say something" onSend={() => {}} onToggle={() => {}} head={head} headKey={head ? 1 : undefined} />
      </div>,
      provider,
    );
  const result = render(thread(view));
  return { ...result, update: (next: PlayerView) => result.rerender(thread(next)) };
}

const feed = () => document.querySelector<HTMLOListElement>("ol.feed") as HTMLOListElement;
const rows = () => Array.from(feed().querySelectorAll<HTMLElement>(":scope > [data-seq]"));
const read = (channel: ChannelId = "global") => store.read(channel);

describe("focus and click", () => {
  it("focusing a row marks it and everything before it, and counts never go down", () => {
    renderThread(VIEWS[4]);
    act(() => rows()[2]?.focus());
    expect(read()).toBe(3);
    act(() => rows()[0]?.focus());
    expect(read()).toBe(3);
    act(() => rows()[3]?.focus());
    expect(read()).toBe(4);
  });

  it("clicking a row, or a button inside one, marks it", () => {
    renderThread(VIEWS[4]);
    fireEvent.click(rows()[1] as HTMLElement);
    expect(read()).toBe(2);
    // p1's message at seq 2 has a "⋯" menu (report).
    const menu = rows()[2]?.querySelector("button.message-menu-button") as HTMLElement;
    expect(menu).not.toBeNull();
    fireEvent.click(menu);
    expect(read()).toBe(3);
  });

  it("a click inside the portalled menu marks nothing else", async () => {
    const user = userEvent.setup();
    renderThread(VIEWS[4]);
    const trigger = rows()[0]?.querySelector("button.message-menu-button") as HTMLElement;
    await user.click(trigger);
    expect(read()).toBe(1);
    const item = await screen.findByRole("menuitem", { name: /report/i });
    expect(feed().contains(item)).toBe(false);
    await user.click(item);
    expect(read()).toBe(1);
  });

  it("a thread's starter message (no data-seq) marks nothing", () => {
    const view = VIEWS[2];
    const starter = view.chat[0];
    if (!starter) throw new Error("no message");
    renderThread(VIEWS[0], { head: <MessageEntry character="jinsu" mine={false} message={starter} className="thread-head" /> });
    const head = feed().querySelector(".thread-head") as HTMLElement;
    fireEvent.click(head);
    fireEvent.focus(head);
    expect(read()).toBe(0);
  });
});

describe("keyboard", () => {
  it("arrows, Home and End move focus between rows and mark the row they land on", async () => {
    const user = userEvent.setup();
    renderThread(VIEWS[4]);
    act(() => rows()[0]?.focus());
    expect(read()).toBe(1);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows()[1]);
    expect(read()).toBe(2);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(rows()[3]);
    expect(read()).toBe(4);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(rows()[0]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(rows()[0]);
    expect(read()).toBe(4);
  });

  it("ignores keys aimed at a row's own controls", () => {
    renderThread(VIEWS[4]);
    const trigger = rows()[0]?.querySelector("button.message-menu-button") as HTMLElement;
    act(() => trigger.focus());
    expect(read()).toBe(1);
    fireEvent.keyDown(trigger, { key: "End" });
    expect(document.activeElement).toBe(trigger);
    expect(read()).toBe(1);
  });

  it("tabbing into the feed lands on the first unread row", async () => {
    const user = userEvent.setup();
    renderThread(VIEWS[4]);
    act(() => store.mark("global", 2));
    // The page bar is absent (one page), so the feed is the first tab stop.
    await user.tab();
    expect(document.activeElement).toBe(rows()[2]);
    expect(read()).toBe(3);
  });

  it("tabbing into a fully read feed lands on the last row", async () => {
    const user = userEvent.setup();
    renderThread(VIEWS[4]);
    act(() => store.mark("global", 4));
    await user.tab();
    expect(document.activeElement).toBe(rows()[3]);
  });
});

describe("arriving in view", () => {
  it("a new message marks the channel up to its count while the feed is watched", () => {
    const { update } = renderThread(VIEWS[2]);
    expect(read()).toBe(0);
    update(VIEWS[3]);
    expect(read()).toBe(3);
  });

  it("marks nothing on mount", () => {
    renderThread(VIEWS[3]);
    expect(read()).toBe(0);
  });

  it("marks nothing when the window isn't focused", () => {
    const { update } = renderThread(VIEWS[2]);
    focused = false;
    update(VIEWS[3]);
    expect(read()).toBe(0);
  });

  it("marks nothing when the window is hidden", () => {
    const { update } = renderThread(VIEWS[2]);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    update(VIEWS[3]);
    expect(read()).toBe(0);
  });

  it("marks nothing when the feed is hidden", () => {
    const { update } = renderThread(VIEWS[2], { hidden: true });
    update(VIEWS[3]);
    expect(read()).toBe(0);
  });

  it("marks nothing when a channel's history first becomes readable", () => {
    const unreadable = { ...VIEWS[3], readChannels: VIEWS[3].readChannels.filter((c) => c !== "global") } as PlayerView;
    const { update } = renderThread(unreadable);
    update(VIEWS[3]);
    expect(read()).toBe(0);
    // Once readable, the next message does count.
    update(VIEWS[4]);
    expect(read()).toBe(4);
  });

  it("marks nothing while the reader is on an older page", () => {
    // Two pages: page 0 (seq 0..49), page 1 (seq 50..). The view holds both, so ‹ needs no fetch.
    let state = sampleState();
    for (let i = 0; i < 51; i++) state = say(state, "global", `m${i}`, "p1");
    const before = sampleView(state);
    const after = sampleView(say(state, "global", "new", "p1"));
    const { update } = renderThread(before);
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    update(after);
    expect(read()).toBe(0);
  });
});

describe("no provider", () => {
  it("focus and click don't throw", async () => {
    const user = userEvent.setup();
    renderThread(VIEWS[4], { provider: false });
    act(() => rows()[1]?.focus());
    fireEvent.click(rows()[2] as HTMLElement);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(rows()[3]);
  });
});

describe("Mark all read", () => {
  const renderITrackie = (view: PlayerView, provider = true) =>
    render(withStore(<ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />, provider));
  const markRead = () => document.querySelector<HTMLButtonElement>("button.mark-read");

  it("shows only while the active tab has unread, and raises every channel on that tab", async () => {
    const user = userEvent.setup();
    let state = sampleState();
    state = say(say(state, "global", "hello", "p1"), "botany", "seeds", "p1");
    state = say(state, "research", "notes", "p1");
    const view = sampleView(state);
    renderITrackie(view);
    // The Room tab has no chat.
    expect(markRead()).toBeNull();
    await user.click(screen.getByRole("tab", { name: /features/i }));
    const button = markRead();
    expect(button).not.toBeNull();
    await user.click(button as HTMLButtonElement);
    expect(read("botany")).toBe(1);
    expect(read("research")).toBe(1);
    expect(read("global")).toBe(0);
    expect(markRead()).toBeNull();
  });

  it("doesn't show without a store", async () => {
    const user = userEvent.setup();
    renderITrackie(sampleView(say(sampleState(), "global", "hello", "p1")), false);
    await user.click(screen.getByRole("tab", { name: /global/i }));
    expect(markRead()).toBeNull();
  });
});

describe("no unread badges in a replay or an ended game (#400)", () => {
  const badges = () => document.querySelectorAll(".tab-badge, .unread-chip");
  const unreadView = () => {
    let state = sampleState();
    state = say(say(state, "global", "hello", "p1"), "botany", "seeds", "p1");
    return state;
  };
  const renderITrackie = (view: PlayerView, provider: boolean) =>
    render(withStore(<ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />, provider));

  it("shows badges for unread in a running game (the control)", () => {
    renderITrackie(sampleView(unreadView()), true);
    expect(badges().length).toBeGreaterThan(0);
  });

  it("shows none in a replay (no read store)", () => {
    renderITrackie(sampleView(unreadView()), false);
    expect(badges()).toHaveLength(0);
  });

  it("shows none once the game has ended, with nothing read", () => {
    renderITrackie(sampleView(ended(unreadView(), "humans", "eden")), true);
    expect(badges()).toHaveLength(0);
    expect(document.querySelector("button.mark-read")).toBeNull();
  });
});

describe("BottomNav unread badge", () => {
  const unreadView = () => {
    let state = sampleState();
    state = say(say(state, "global", "hello", "p1"), "botany", "seeds", "p1");
    return state;
  };
  const renderNav = (view: PlayerView, provider = true) =>
    render(withStore(<BottomNav panel="room" onChange={() => {}} view={view} />, provider));

  it("shows the total unread badge and accessible name, and clears when marked read", () => {
    renderNav(sampleView(unreadView()));
    expect(document.querySelector(".bottom-nav-button .tab-badge")?.textContent).toBe("2");
    expect(screen.getByRole("button", { name: "iTrackie, 2 unread" })).not.toBeNull();
    act(() => store.markAll({ global: 1, botany: 1 }));
    expect(document.querySelector(".bottom-nav-button .tab-badge")).toBeNull();
    expect(screen.getByRole("button", { name: "iTrackie" })).not.toBeNull();
  });

  it("caps the displayed badge at 99+ while keeping the exact count in the accessible name", () => {
    const view = { readChannels: ["global"], chatCounts: { global: 105 } } as unknown as PlayerView;
    renderNav(view);
    expect(document.querySelector(".bottom-nav-button .tab-badge")?.textContent).toBe("99+");
    expect(screen.getByRole("button", { name: "iTrackie, 105 unread" })).not.toBeNull();
  });

  it("shows none in a replay (no read store) or an ended game", () => {
    const live = sampleView(unreadView());
    renderNav(live, false);
    expect(document.querySelector(".bottom-nav-button .tab-badge")).toBeNull();
    cleanup();
    renderNav(sampleView(ended(unreadView(), "humans", "eden")), true);
    expect(document.querySelector(".bottom-nav-button .tab-badge")).toBeNull();
  });
});
