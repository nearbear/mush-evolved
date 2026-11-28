// Private notes on the client (#503, shared/src/notes.ts): the seat's tabs of free text, kept on the server and sent to
// this seat only. Edits apply here at once and go to the server about a second after typing stops (`SAVE_AFTER_MS`),
// and at once on `flush` (switching tabs, closing the popover, hiding the page).
//
// Until the server's copy arrives on (re)connect, edits wait: the server's `notes` comes first on every connect, so an
// edit sent before it would be overwritten by that older copy. When it comes, tabs edited here and not yet sent win
// over it and are sent; the rest take the server's text (last write wins across a seat's devices).

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { MAX_NOTE_LENGTH, MAX_NOTE_TABS, type GameClientMessage, type Note } from "@mush2/shared";

/** How long after the last keystroke a tab is saved. */
export const SAVE_AFTER_MS = 1_000;

export interface NotesState {
  /** The tabs, at least one (an empty first tab until the player writes in it). */
  notes: readonly Note[];
  /** Whether the server's copy has arrived since this store was made. Editing waits for it. */
  loaded: boolean;
}

export interface NotesStore {
  /** The current state, one object that keeps its identity until something changes. */
  snapshot: () => NotesState;
  subscribe: (fn: () => void) => () => void;
  /** Sets tab `tab`'s text (clamped to MAX_NOTE_LENGTH). `tab` one past the last adds a tab, up to MAX_NOTE_TABS. */
  edit: (tab: number, text: string) => void;
  /** The server's copy: on connect, and when another device of this seat saves. */
  fromServer: (notes: readonly Note[]) => void;
  /** The socket closed: hold edits until the server's copy arrives again. */
  disconnected: () => void;
  /** Sends unsent edits now, if connected. */
  flush: () => void;
  /** Sends what is pending; the store stays usable. */
  dispose: () => void;
}

const EMPTY: readonly Note[] = [{ text: "" }];

/** At least one tab, so there is always one to write in. */
const atLeastOne = (notes: readonly Note[]): readonly Note[] => (notes.length > 0 ? notes : EMPTY);

export function createNotesStore(send: (msg: GameClientMessage) => void): NotesStore {
  let state: NotesState = { notes: EMPTY, loaded: false };
  /** Tabs edited here and not yet sent. */
  const dirty = new Set<number>();
  let connected = false;
  /** How many tabs the server is known to have, so a new tab's earlier ones are sent with it (it refuses a gap). */
  let serverLength = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const set = (next: NotesState) => {
    state = next;
    for (const fn of listeners) fn();
  };
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!connected || dirty.size === 0) return;
    // In order, so a new tab's earlier tabs reach the server first (it refuses a gap).
    for (const tab of [...dirty].sort((a, b) => a - b)) {
      send({ type: "note", tab, text: state.notes[tab]?.text ?? "" });
      serverLength = Math.max(serverLength, tab + 1);
    }
    dirty.clear();
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_AFTER_MS);
  };

  return {
    snapshot: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    edit: (tab, text) => {
      if (!Number.isSafeInteger(tab) || tab < 0 || tab >= MAX_NOTE_TABS || tab > state.notes.length) return;
      const clamped = text.slice(0, MAX_NOTE_LENGTH);
      if (state.notes[tab]?.text === clamped) return;
      const notes = state.notes.map((n, i) => (i === tab ? { ...n, text: clamped } : n));
      if (tab === notes.length) notes.push({ text: clamped });
      // The server may not have the tabs before it yet (the first tab is shown before anything is written in it).
      for (let i = Math.min(serverLength, tab); i <= tab; i++) dirty.add(i);
      set({ ...state, notes });
      schedule();
    },
    fromServer: (server) => {
      connected = true;
      serverLength = server.length;
      if (!state.loaded) {
        // Nothing could be edited before the first copy (the editor waits for it).
        dirty.clear();
        set({ notes: atLeastOne(server), loaded: true });
        return;
      }
      // Tabs edited here and not sent win; a tab here past the server's last is sent too, so there is no gap.
      const length = Math.max(server.length, ...[...dirty].map((t) => t + 1));
      const notes: Note[] = [];
      for (let i = 0; i < length; i++) {
        if (i >= server.length) dirty.add(i);
        notes.push(dirty.has(i) ? (state.notes[i] ?? { text: "" }) : server[i]!);
      }
      set({ notes: atLeastOne(notes), loaded: true });
      flush();
    },
    disconnected: () => {
      connected = false;
    },
    flush,
    // Only flushes: React's StrictMode runs effect cleanups and then the effects again on the same store.
    dispose: flush,
  };
}

// ---- React -------------------------------------------------------------------

const NotesContext = createContext<NotesStore | null>(null);

/** Provides the store to the notes popover. GameScreen owns it (it owns the socket); a replay or the design kit has none. */
export const NotesProvider = NotesContext.Provider;

/** The store, or null in a view with no socket (a replay, the design kit): no notes there. */
export const useNotesStore = (): NotesStore | null => useContext(NotesContext);

const noop = () => () => {};
const NONE: NotesState = { notes: EMPTY, loaded: false };

/** The notes, redrawing when they change. */
export function useNotes(store: NotesStore | null): NotesState {
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe(fn) : noop()), [store]);
  return useSyncExternalStore(subscribe, () => (store ? store.snapshot() : NONE));
}
