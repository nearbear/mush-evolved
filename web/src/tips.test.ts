import { afterEach, describe, expect, it, vi } from "vitest";

type Tips = typeof import("./tips.ts");

/** Two tabs: separate copies of the module sharing one localStorage, with storage events between them. */
async function twoTabs(): Promise<[Tips, Tips, (key: string) => void]> {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  const handlers: ((e: { key: string | null }) => void)[] = [];
  vi.stubGlobal("window", { addEventListener: (_: string, h: (e: { key: string | null }) => void) => handlers.push(h) });
  vi.resetModules();
  const a = await import("./tips.ts");
  vi.resetModules();
  const b = await import("./tips.ts");
  // The browser fires `storage` in the other tabs, not the writer: fire it in the tab given.
  const fireIn = (tab: Tips) => (key: string) => handlers[tab === a ? 0 : 1]!({ key });
  return [a, b, fireIn(a)];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tip prefs across tabs", () => {
  it("a tip muted in one tab stays muted when another tab with an older copy saves", async () => {
    const [a, b] = await twoTabs();
    a.dismissTip("eat"); // tab A snoozes eat
    b.muteTip("hurt"); // tab B mutes hurt
    a.syncTips([]); // eat's situation ended in tab A: it writes, and must keep B's mute
    expect(a.parseTipPrefs(localStorage.getItem("mush2.tips"))).toEqual({ on: true, muted: ["hurt"], snoozed: [] });
  });

  it("a tab picks up a mute made in another tab when the storage event arrives", async () => {
    const [a, b, fireInA] = await twoTabs();
    b.muteTip("welcome");
    expect(a.shownTip([{ id: "welcome" }], a.tipPrefs())).toEqual({ id: "welcome" });
    fireInA("mush2.tips");
    expect(a.shownTip([{ id: "welcome" }], a.tipPrefs())).toBeUndefined();
  });
});
