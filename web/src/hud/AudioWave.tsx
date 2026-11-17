// A signal's audio wave (docs/plans/signals.md): a row of bars drawn in CSS, no image asset. Flat at rest; while the
// other side is speaking the bars fluctuate. No audio plays. Under prefers-reduced-motion the bars stay still and only
// change height when the speaker changes (settings.css).

import type { CSSProperties } from "react";

const BARS = 32;

/** Each bar's peak height (0..1) and animation timing, fixed once: a rough envelope, louder in the middle. */
const SHAPE = Array.from({ length: BARS }, (_, i) => {
  const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS);
  const jitter = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.399));
  return {
    "--peak": (0.2 + 0.8 * envelope * jitter).toFixed(2),
    "--period": `${(0.35 + ((i * 7) % 5) * 0.08).toFixed(2)}s`,
    "--delay": `${(-((i * 13) % 9) * 0.07).toFixed(2)}s`,
  } as CSSProperties;
});

export function AudioWave({ speaking }: { speaking: boolean }) {
  return (
    <div className="audio-wave" data-speaking={speaking || undefined} aria-hidden="true">
      {SHAPE.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  );
}
