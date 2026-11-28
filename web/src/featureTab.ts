// The iTrackie's last open feature (Botany, Research, ...), remembered per device in localStorage like `pressMode.ts`,
// so it doesn't reset on a reload or a new game. Purely a client convenience.

import { FEATURE_CHANNELS, type FeatureChannel } from "@mush2/shared";

const KEY = "mush2.featureTab";
/** With nothing saved: the first feature in the drop-down, which lists `FEATURE_CHANNELS` in order. */
const FIRST: FeatureChannel = FEATURE_CHANNELS[0];

export function loadFeatureTab(): FeatureChannel {
  try {
    const saved = localStorage.getItem(KEY);
    return FEATURE_CHANNELS.find((f) => f === saved) ?? FIRST;
  } catch {
    return FIRST; // storage blocked: the default
  }
}

export function saveFeatureTab(feature: FeatureChannel): void {
  try {
    localStorage.setItem(KEY, feature);
  } catch {
    // storage blocked: remembered for this page only
  }
}
