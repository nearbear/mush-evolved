// The notes store (#503, web/src/notes.ts): debounced saves that wait for the server's copy after (re)connecting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_NOTE_LENGTH, MAX_NOTE_TABS, type GameClientMessage } from "@mush2/shared";
import { createNotesStore, SAVE_AFTER_MS } from "../src/notes.ts";

describe("notes store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const sent: GameClientMessage[] = [];
    const store = createNotesStore((m) => sent.push(m));
    return { store, sent };
  };

  it("shows one empty tab until the server's copy, then the server's tabs", () => {
    const { store } = setup();
    expect(store.snapshot()).toEqual({ notes: [{ text: "" }], loaded: false });
    store.fromServer([]);
    expect(store.snapshot()).toEqual({ notes: [{ text: "" }], loaded: true });
    store.fromServer([{ text: "a" }, { text: "b" }]);
    expect(store.snapshot().notes).toEqual([{ text: "a" }, { text: "b" }]);
  });

  it("saves a second after the last edit, once", () => {
    const { store, sent } = setup();
    store.fromServer([]);
    store.edit(0, "h");
    vi.advanceTimersByTime(SAVE_AFTER_MS - 1);
    store.edit(0, "hi");
    vi.advanceTimersByTime(SAVE_AFTER_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([{ type: "note", tab: 0, text: "hi" }]);
  });

  it("sends the empty first tab before a new second one, so the server sees no gap", () => {
    const { store, sent } = setup();
    store.fromServer([]);
    store.edit(1, "");
    store.flush();
    expect(sent).toEqual([
      { type: "note", tab: 0, text: "" },
      { type: "note", tab: 1, text: "" },
    ]);
    store.edit(2, "c");
    store.flush();
    expect(sent.at(-1)).toEqual({ type: "note", tab: 2, text: "c" });
    expect(sent).toHaveLength(3);
  });

  it("adds no tab past the 16th or with a gap, and clamps long text", () => {
    const { store } = setup();
    store.fromServer(Array.from({ length: MAX_NOTE_TABS }, () => ({ text: "" })));
    store.edit(MAX_NOTE_TABS, "x");
    expect(store.snapshot().notes).toHaveLength(MAX_NOTE_TABS);
    store.edit(0, "a".repeat(MAX_NOTE_LENGTH + 10));
    expect(store.snapshot().notes[0]!.text).toHaveLength(MAX_NOTE_LENGTH);
    const other = setup().store;
    other.fromServer([]);
    other.edit(3, "gap");
    expect(other.snapshot().notes).toHaveLength(1);
  });

  it("holds edits while disconnected, keeps them over the server's older copy, and sends them then", () => {
    const { store, sent } = setup();
    store.fromServer([{ text: "old" }, { text: "other" }]);
    store.disconnected();
    store.edit(0, "new");
    vi.advanceTimersByTime(SAVE_AFTER_MS);
    store.flush();
    expect(sent).toEqual([]);
    store.fromServer([{ text: "old" }, { text: "changed elsewhere" }]);
    expect(store.snapshot().notes).toEqual([{ text: "new" }, { text: "changed elsewhere" }]);
    expect(sent).toEqual([{ type: "note", tab: 0, text: "new" }]);
  });

  it("takes another device's save for tabs not edited here", () => {
    const { store } = setup();
    store.fromServer([{ text: "a" }]);
    store.edit(0, "mine");
    store.flush();
    store.fromServer([{ text: "theirs" }, { text: "added" }]);
    expect(store.snapshot().notes).toEqual([{ text: "theirs" }, { text: "added" }]);
  });

  it("tells subscribers of a change, and keeps the snapshot's identity otherwise", () => {
    const { store } = setup();
    store.fromServer([]);
    const fn = vi.fn();
    store.subscribe(fn);
    const before = store.snapshot();
    store.edit(0, "");
    expect(store.snapshot()).toBe(before);
    store.edit(0, "x");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
