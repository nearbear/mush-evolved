// Tips (#351): which of the view's tips (shared/src/tips.ts) to show, and the viewer's choices about them. A per-viewer
// preference kept in localStorage, like `fogDepth.ts`.
//
// Dismissing a tip hides it until its situation ends and comes back (eat, get hungry again, and it returns). A tip shown
// only once (`ONCE_TIPS`) and "Don't show this tip again" mute it for good. Tips can be turned off in the settings.

import { ONCE_TIPS, TIP_IDS, type Tip, type TipId } from "@mush2/shared";
import { useSyncExternalStore } from "react";

export interface TipPrefs {
  on: boolean;
  /** Never shown again (until Reset tips). */
  muted: readonly TipId[];
  /** Hidden while their situation lasts; dropped from here once it ends. */
  snoozed: readonly TipId[];
}

const KEY = "mush2.tips";
const DEFAULT: TipPrefs = { on: true, muted: [], snoozed: [] };
const listeners = new Set<() => void>();
let current: TipPrefs = load();

const isTipId = (v: unknown): v is TipId => (TIP_IDS as readonly unknown[]).includes(v);

export function parseTipPrefs(raw: string | null): TipPrefs {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<TipPrefs> | null;
    if (!v || typeof v !== "object") return DEFAULT;
    return {
      on: v.on !== false,
      muted: Array.isArray(v.muted) ? v.muted.filter(isTipId) : [],
      snoozed: Array.isArray(v.snoozed) ? v.snoozed.filter(isTipId) : [],
    };
  } catch {
    return DEFAULT;
  }
}

function load(): TipPrefs {
  try {
    return parseTipPrefs(localStorage.getItem(KEY));
  } catch {
    return DEFAULT; // storage blocked: the default
  }
}

function save(next: TipPrefs): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  for (const l of listeners) l();
}

/** The tip to show: the first that applies, isn't muted and isn't snoozed. None when tips are off. */
export function shownTip(tips: readonly Tip[], prefs: TipPrefs): Tip | undefined {
  if (!prefs.on) return undefined;
  return tips.find((t) => !prefs.muted.includes(t.id) && !prefs.snoozed.includes(t.id));
}

/** `prefs` with the snoozes of tips that no longer apply dropped, so they come back next time; the same object if none. */
export function forgetEnded(prefs: TipPrefs, applying: readonly TipId[]): TipPrefs {
  const snoozed = prefs.snoozed.filter((id) => applying.includes(id));
  return snoozed.length === prefs.snoozed.length ? prefs : { ...prefs, snoozed };
}

/** `prefs` after ✕ on `id`: snoozed, or muted for a tip shown only once. */
export function dismissed(prefs: TipPrefs, id: TipId): TipPrefs {
  return ONCE_TIPS.has(id) ? muted(prefs, id) : { ...prefs, snoozed: [...new Set([...prefs.snoozed, id])] };
}

export const muted = (prefs: TipPrefs, id: TipId): TipPrefs => ({ ...prefs, muted: [...new Set([...prefs.muted, id])] });

export const syncTips = (applying: readonly TipId[]): void => {
  const next = forgetEnded(current, applying);
  if (next !== current) save(next);
};
export const dismissTip = (id: TipId): void => save(dismissed(current, id));
export const muteTip = (id: TipId): void => save(muted(current, id));
export const setTipsOn = (on: boolean): void => save({ ...current, on });
/** Every tip can show again, including the muted ones. Leaves tips on or off as they are. */
export const resetTips = (): void => save({ ...DEFAULT, on: current.on });

export function useTipPrefs(): TipPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
