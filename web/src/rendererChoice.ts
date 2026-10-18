// Which renderer draws the isometric room: the DOM one, or PixiJS while it is on trial (#194).
// A per-viewer preference kept in localStorage; subscribers (the settings dialog and the room) share it.

import { useSyncExternalStore } from "react";

export type RendererChoice = "dom" | "pixi";

const KEY = "mush2.renderer";
const listeners = new Set<() => void>();
let current: RendererChoice = load();

export function parseRendererChoice(v: string | null): RendererChoice {
  return v === "pixi" ? "pixi" : "dom";
}

function load(): RendererChoice {
  try {
    return parseRendererChoice(localStorage.getItem(KEY));
  } catch {
    return "dom"; // storage blocked: the default
  }
}

export function setRendererChoice(choice: RendererChoice): void {
  current = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  for (const l of listeners) l();
}

export function useRendererChoice(): RendererChoice {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
