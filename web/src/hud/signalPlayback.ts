// The cosmetic pacing of a signal's replies (SignalConversation.tsx; owner, 2026-11-16): presentation only, the server
// has already recorded them. Pure, so it is tested without timers.

/** The client's delay before the other side answers. */
export const REPLY_DELAY_MS = 3000;
/** How long each character of a reply takes to type out. */
export const TYPE_MS_PER_CHAR = 35;

/**
 * Where the playback is. `shown`: how many feed entries are shown whole. `waiting`: the entry after them is a reply
 * whose delay is running ("incoming…"); `typing`: it is typing out, `chars` characters so far.
 */
export interface Playback {
  shown: number;
  phase: "idle" | "waiting" | "typing";
  chars: number;
}

/**
 * The playback's next state and how long to wait for it, or null when everything is shown. Officer and system lines
 * show at once; the other side's lines wait `REPLY_DELAY_MS`, then type out one character per `TYPE_MS_PER_CHAR`.
 */
export function nextPlayback(p: Playback, feed: readonly { from: string }[], texts: readonly string[]): { next: Playback; after: number } | null {
  if (p.shown >= feed.length) return null;
  const done = { next: { shown: p.shown + 1, phase: "idle", chars: 0 } as Playback, after: 0 };
  switch (p.phase) {
    case "idle":
      return feed[p.shown]!.from === "signal" ? { next: { shown: p.shown, phase: "waiting", chars: 0 }, after: 0 } : done;
    case "waiting":
      return { next: { shown: p.shown, phase: "typing", chars: 0 }, after: REPLY_DELAY_MS };
    case "typing":
      return p.chars >= Array.from(texts[p.shown] ?? "").length ? done : { next: { ...p, chars: p.chars + 1 }, after: TYPE_MS_PER_CHAR };
  }
}

/** The playback after the officer taps the feed: a reply typing out is shown whole. The wait can't be skipped. */
export const skipPlayback = (p: Playback): Playback => (p.phase === "typing" ? { shown: p.shown + 1, phase: "idle", chars: 0 } : p);
