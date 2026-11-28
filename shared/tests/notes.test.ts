// Private notes (#503, notes.ts): up to 16 tabs of at most 4,000 characters, which only grow.
import { describe, expect, it } from "vitest";
import { applyNoteEdit, cleanNotes, MAX_NOTE_LENGTH, MAX_NOTE_TABS, toggleNoteTask, type Note } from "../src/notes.ts";

const tabs = (n: number): Note[] => Array.from({ length: n }, (_, i) => ({ text: `tab ${i}` }));

describe("applyNoteEdit", () => {
  it("sets a tab, and adds one when writing one past the last", () => {
    expect(applyNoteEdit([], 0, "hello")).toEqual([{ text: "hello" }]);
    expect(applyNoteEdit(tabs(2), 1, "x")).toEqual([{ text: "tab 0" }, { text: "x" }]);
    expect(applyNoteEdit(tabs(2), 2, "")).toEqual([...tabs(2), { text: "" }]);
  });

  it("leaves the list it was given alone", () => {
    const notes = tabs(1);
    applyNoteEdit(notes, 0, "changed");
    expect(notes).toEqual(tabs(1));
  });

  it("refuses a gap, a negative or fractional tab, a 17th tab and text over the limit", () => {
    expect(applyNoteEdit(tabs(1), 2, "x")).toBeNull();
    expect(applyNoteEdit(tabs(1), -1, "x")).toBeNull();
    expect(applyNoteEdit(tabs(1), 0.5, "x")).toBeNull();
    expect(applyNoteEdit(tabs(MAX_NOTE_TABS), MAX_NOTE_TABS, "x")).toBeNull();
    expect(applyNoteEdit(tabs(MAX_NOTE_TABS), MAX_NOTE_TABS - 1, "x")).toHaveLength(MAX_NOTE_TABS);
    expect(applyNoteEdit([], 0, "a".repeat(MAX_NOTE_LENGTH))).toEqual([{ text: "a".repeat(MAX_NOTE_LENGTH) }]);
    expect(applyNoteEdit([], 0, "a".repeat(MAX_NOTE_LENGTH + 1))).toBeNull();
  });
});

describe("toggleNoteTask", () => {
  it("ticks and unticks one box in the text, leaving the others and other lines alone", () => {
    const text = "# Plan\n- [ ] fix the hull\n- [x] feed the cat\n* not a task";
    expect(toggleNoteTask(text, 1)).toBe("# Plan\n- [x] fix the hull\n- [x] feed the cat\n* not a task");
    expect(toggleNoteTask(text, 2)).toBe("# Plan\n- [ ] fix the hull\n- [ ] feed the cat\n* not a task");
    expect(toggleNoteTask(text, 0)).toBe(text);
    expect(toggleNoteTask(text, 9)).toBe(text);
  });

  it("ignores a box inside a code block", () => {
    const text = "```\n- [ ] code\n```";
    expect(toggleNoteTask(text, 1)).toBe(text);
  });
});

describe("cleanNotes", () => {
  it("keeps a valid list and repairs or drops the rest", () => {
    expect(cleanNotes(tabs(2))).toEqual(tabs(2));
    expect(cleanNotes(undefined)).toEqual([]);
    expect(cleanNotes({ text: "x" })).toEqual([]);
    expect(cleanNotes([null, { text: 3 }, { text: "ok" }])).toEqual([{ text: "" }, { text: "" }, { text: "ok" }]);
    expect(cleanNotes(tabs(MAX_NOTE_TABS + 3))).toHaveLength(MAX_NOTE_TABS);
    expect(cleanNotes([{ text: "a".repeat(MAX_NOTE_LENGTH + 5) }])[0]!.text).toHaveLength(MAX_NOTE_LENGTH);
  });
});
