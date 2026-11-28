// ---- Private notes (#503) ---------------------------------------------------
// Each player's notepad: up to MAX_NOTE_TABS tabs of free text. Not game state: the server keeps a seat's notes in its
// own storage (like chat read state, chatRead.ts), outside the snapshot, the input log, replays and every view, and
// sends them to that seat only. Keyed by seat (the mind), they follow a Transfer and the swap-character cheat. Bots
// keep none. Tabs only grow: there is no delete (#503's open question, default no).

import { markedText, taskLines } from "./chat.ts";

/** One tab. An object, not a bare string, so a per-tab icon can be added later. */
export interface Note {
  text: string;
}

/** The most tabs a player may have. */
export const MAX_NOTE_TABS = 16;
/** The most characters (UTF-16 code units, as `String.length` and a textarea's `maxLength` count) in one tab. */
export const MAX_NOTE_LENGTH = 4000;

/**
 * `notes` with tab `tab` set to `text`. Writing `tab === notes.length` adds a tab. Null for a tab out of range (more
 * than one past the end, or past MAX_NOTE_TABS) or text longer than MAX_NOTE_LENGTH.
 */
export function applyNoteEdit(notes: readonly Note[], tab: number, text: string): Note[] | null {
  if (!Number.isSafeInteger(tab) || tab < 0 || tab > notes.length || tab >= MAX_NOTE_TABS || text.length > MAX_NOTE_LENGTH) return null;
  const next = notes.map((n) => ({ ...n }));
  next[tab] = { ...next[tab], text };
  return next;
}

/** Stored notes from storage of unknown age or shape: a list of at most MAX_NOTE_TABS tabs, each text clamped. */
export function cleanNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_NOTE_TABS).map((n: unknown) => ({ text: typeof (n as Note | null)?.text === "string" ? (n as Note).text.slice(0, MAX_NOTE_LENGTH) : "" }));
}

/**
 * `text` with the markdown checkbox on 0-based line `line` ticked or unticked (the preview's clickable boxes). Unlike
 * a chat message's ticks (`chatMarks`), a note keeps them in its text. The text as it was when that line has no box.
 */
export function toggleNoteTask(text: string, line: number): string {
  const tasks = taskLines(text);
  if (!tasks.some((t) => t.line === line)) return text;
  const checked = tasks.filter((t) => (t.line === line ? !t.ticked : t.ticked)).map((t) => t.line);
  return markedText(text, { tasks: tasks.map((t) => t.line), checked });
}
