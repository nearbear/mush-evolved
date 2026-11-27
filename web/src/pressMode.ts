// The "single press for actions" option, and the tip that teaches new players the double press.
// A per-device preference kept in localStorage, like `fogDepth.ts`. With it on, `useDoublePress` (hud/DoublePress.tsx)
// fires on the first press, so every action button behaves like `SINGLE_PRESS_ACTIONS`.
//
// The tip (`doublePress`, one of the shared `CLIENT_TIPS`, drawn by hud/TipCard.tsx like the others): until a player has
// done more than `HINT_UNTIL_DONE` actions with a double press (counted on this device), `HINT_AFTER_LAPSES` presses in
// a row that armed a button but never fired it make the tip apply. Any action that fires ends that run, and the tip.

import { useSyncExternalStore } from "react";

const KEY = "mush2.singlePress";
const DONE_KEY = "mush2.doublePressesDone";
/** Players who have done more than this many double-press actions are taken to know how. */
export const HINT_UNTIL_DONE = 5;
/** Lone presses in a row (armed, then left to lapse) before the tip applies. */
export const HINT_AFTER_LAPSES = 3;

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let single: boolean = load();
let done: number = loadDone();
let lapses = 0;
let tipDue = false;

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: the default
  }
}

function loadDone(): number {
  try {
    const n = Number(localStorage.getItem(DONE_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Recomputes whether the tip applies, telling subscribers only when that changes. */
function refresh(): void {
  const due = !single && done <= HINT_UNTIL_DONE && lapses >= HINT_AFTER_LAPSES;
  if (due !== tipDue) {
    tipDue = due;
    notify();
  }
}

export function setSinglePress(on: boolean): void {
  single = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  notify();
  refresh();
}

export function useSinglePress(): boolean {
  return useSyncExternalStore(subscribe, () => single);
}

/** Whether the `doublePress` tip applies now. */
export function useDoublePressTip(): boolean {
  return useSyncExternalStore(subscribe, () => tipDue);
}

/** An action button fired; `double` when it took the second press. Ends the run of lone presses. */
export function noteFired(double: boolean): void {
  lapses = 0;
  if (double && done <= HINT_UNTIL_DONE) {
    done += 1;
    try {
      localStorage.setItem(DONE_KEY, String(done));
    } catch {
      // storage blocked: counted for this page load only
    }
    notify();
  }
  refresh();
}

/** A press armed a button and lapsed without a second one. */
export function noteLapse(): void {
  lapses += 1;
  refresh();
}

/** Whether the tip applies, outside React (tests). */
export const doublePressTipDue = (): boolean => tipDue;

/** Double-press actions counted so far (capped just past `HINT_UNTIL_DONE`), so "Show all tips again" knows it has something to reset. */
export function useDoublePressesDone(): number {
  return useSyncExternalStore(subscribe, () => done);
}

/** Forgets the actions done and lone presses, so the tip can teach again (the settings' "Show all tips again"). */
export function resetDoublePressCount(): void {
  done = 0;
  lapses = 0;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    // storage blocked: nothing stored
  }
  notify();
  refresh();
}
