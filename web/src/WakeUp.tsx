import { useEffect, useRef, useState } from "react";
import "./wakeUp.css";

/** Longest the overlay can stay up, in case animationend never fires (e.g. animations disabled). */
const FALLBACK_MS = 3000;

/**
 * Waking from cryo sleep, played over the game the first time you join a ship:
 * the eye blinks open while a cold blur clears. Purely visual; it never blocks input.
 */
export function WakeUp({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="wake"
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone();
      }}
    >
      <div className="wake-eye" />
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
