// The "UI scale" option (#485): how big the HUD, panels, dialogs and text are, by scaling the root font size
// (almost every size in the stylesheets is in rem). Pixel art drawn in px, and the room itself, keep their size.
// A per-device preference kept in localStorage, like `fogDepth.ts`; it sets `data-ui-scale` on <html>, which
// base.css turns into a font size (the CSP allows no inline styles). "auto" leaves the attribute off, so base.css's
// media query decides: 125% on viewports of at least 2200x1100 CSS pixels, 100% elsewhere.

import { useSyncExternalStore } from "react";

export type UiScale = "auto" | "100" | "125" | "150";

export const UI_SCALES: readonly UiScale[] = ["auto", "100", "125", "150"];

const KEY = "mush2.uiScale";
const listeners = new Set<() => void>();
let current: UiScale = load();
apply(current);

export function parseUiScale(v: string | null): UiScale {
  return UI_SCALES.find((s) => s === v) ?? "auto";
}

function load(): UiScale {
  try {
    return parseUiScale(localStorage.getItem(KEY));
  } catch {
    return "auto"; // storage blocked: the default
  }
}

function apply(scale: UiScale): void {
  if (typeof document === "undefined") return;
  if (scale === "auto") document.documentElement.removeAttribute("data-ui-scale");
  else document.documentElement.setAttribute("data-ui-scale", scale);
}

export function setUiScale(scale: UiScale): void {
  current = scale;
  apply(scale);
  try {
    localStorage.setItem(KEY, scale);
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  for (const l of listeners) l();
}

export function useUiScale(): UiScale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
