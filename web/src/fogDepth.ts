// The "fog of war" depth option: how many rooms out from yours the isometric view draws.
// A per-viewer preference kept in localStorage; subscribers (the settings dialog and the room) share it.

import { useSyncExternalStore } from "react";

export type FogDepth = 1 | 2 | "all";

const KEY = "mush2.fogDepth";
const listeners = new Set<() => void>();
let current: FogDepth = load();

export function parseFogDepth(v: string | null): FogDepth {
  return v === "2" ? 2 : v === "all" ? "all" : 1;
}

function load(): FogDepth {
  try {
    return parseFogDepth(localStorage.getItem(KEY));
  } catch {
    return 1; // storage blocked: the default
  }
}

export function setFogDepth(depth: FogDepth): void {
  current = depth;
  try {
    localStorage.setItem(KEY, String(depth));
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  for (const l of listeners) l();
}

export function useFogDepth(): FogDepth {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
