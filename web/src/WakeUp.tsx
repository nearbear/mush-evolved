import { useEffect, useRef, useState } from "react";
import "./wakeUp.css";

/** Longest the overlay can stay up, in case animationend never fires (e.g. animations disabled). */
const FALLBACK_MS = 3000;

/** `wake`: the full cryo wake-up, for boarding after picking a character. `fade`: a plain fade in from dark, for any other way in. */
export type Intro = "wake" | "fade";

/**
 * Played over the game on the way in. `wake` is waking from cryo sleep (the first time you join a ship):
 * the eye blinks open while a cold blur clears. `fade` just fades in from dark. Purely visual; it never blocks input.
 */
export function WakeUp({ kind = "wake", onDone }: { kind?: Intro; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={kind === "fade" ? "wake wake-fade-only" : "wake"}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone();
      }}
    >
      {kind === "wake" && <div className="wake-eye" />}
    </div>
  );
}

/**
 * Tells screen-reader users the game is ready once the (aria-hidden) wake-up intro ends.
 * The text is captured when the intro ends, so later cycle changes don't re-announce it.
 */
export function WakeUpAnnouncement({ waking, text }: { waking: boolean; text: string }) {
  const wasWaking = useRef(waking);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    if (wasWaking.current && !waking) setAnnounced(text);
    wasWaking.current = waking;
  }, [waking, text]);
  return (
    <p role="status" className="sr-only">
      {announced}
    </p>
  );
}
