// A signal's audio wave (docs/plans/signals.md): a row of bars drawn in CSS, no image asset. Flat at rest; while the
// other side is speaking, each character in the message shapes the frequency bands (lows for vowels, highs for
// sibilants and garbled static, dips on spaces and punctuation). No audio plays. Under prefers-reduced-motion the bars
// stay still and only change height when the speaker changes (settings.css).

import type { CSSProperties } from "react";

const BARS = 32;
const REST_LEVEL = 0.08;

/** Fixed fallback shape used when no text is provided or under prefers-reduced-motion. */
const FALLBACK_PEAKS = Array.from({ length: BARS }, (_, i) => {
  const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS);
  const jitter = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.399));
  return Number((0.2 + 0.8 * envelope * jitter).toFixed(2));
});

function gaussian(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-0.5 * d * d);
}

/** Deterministic pseudo-random number in [0, 1). */
function noise01(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h / 4294967296;
}

const GARBLE_NOISE = new Set(["—", "…", "●"]);
const BACK_VOWELS = new Set(["a", "o", "u"]);
const FRONT_VOWELS = new Set(["e", "i", "y"]);
const VOICED_CONSONANTS = new Set(["b", "d", "g", "j", "l", "m", "n", "r", "v", "w", "z"]);
const UNVOICED_CONSONANTS = new Set(["c", "f", "h", "k", "p", "q", "s", "t", "x"]);
const PAUSE_PUNCT = new Set([".", ",", ";", ":", "'", '"', "-", "(", ")"]);

function charSpectrum(ch: string, pos: number, bar: number): number {
  const x = bar / (BARS - 1);
  const code = ch.codePointAt(0) ?? 0;

  if (/\s/.test(ch)) return 0.04;
  if (GARBLE_NOISE.has(ch)) {
    const band = 0.25 + 0.75 * gaussian(x, 0.65, 0.32);
    return 0.75 * band * (0.3 + 0.7 * noise01(pos * 31 + bar, code));
  }
  if (PAUSE_PUNCT.has(ch)) return 0.08 + 0.06 * noise01(pos + bar, code);
  if (ch === "!" || ch === "?") return 0.3 * (0.4 + 0.6 * gaussian(x, 0.58, 0.22));

  const base = ch
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  let amp = 0.55;
  let shape = gaussian(x, 0.42, 0.22);

  if (BACK_VOWELS.has(base)) {
    amp = 0.94;
    shape = 0.9 * gaussian(x, 0.16, 0.11) + 0.65 * gaussian(x, 0.36, 0.13) + 0.22 * gaussian(x, 0.58, 0.14);
  } else if (FRONT_VOWELS.has(base)) {
    amp = 0.88;
    shape = 0.75 * gaussian(x, 0.14, 0.1) + 0.8 * gaussian(x, 0.52, 0.14) + 0.25 * gaussian(x, 0.72, 0.12);
  } else if (VOICED_CONSONANTS.has(base)) {
    amp = 0.64;
    shape = 0.85 * gaussian(x, 0.24, 0.15) + 0.38 * gaussian(x, 0.48, 0.14);
  } else if (UNVOICED_CONSONANTS.has(base)) {
    amp = 0.7;
    shape = 0.3 * gaussian(x, 0.46, 0.13) + 0.95 * gaussian(x, 0.74, 0.16);
  }

  const shimmer = 0.76 + 0.42 * noise01(pos * 19 + bar * 7, code);
  return amp * shape * shimmer;
}

/**
 * Computes 32 normalized bar levels in [0.08, 1] for `text` at character `cursor`, blending recent characters for
 * smooth syllable transitions while keeping pauses and high-frequency consonants/static distinct.
 */
export function spectrumForText(text: string, cursor: number): number[] {
  const chars = Array.from(text);
  if (chars.length === 0) return FALLBACK_PEAKS;
  const pos = Math.max(0, Math.min(cursor, chars.length - 1));
  const current = chars[pos]!;
  const isPause = /\s/.test(current);

  const weights: [number, number][] = isPause
    ? [
        [pos, 0.55],
        [pos - 1, 0.3],
        [pos - 2, 0.15],
      ]
    : [
        [pos, 0.65],
        [pos - 1, 0.25],
        [pos - 2, 0.1],
      ];

  return Array.from({ length: BARS }, (_, bar) => {
    let sum = 0;
    let totalW = 0;
    for (const [idx, w] of weights) {
      if (idx < 0) continue;
      sum += w * charSpectrum(chars[idx]!, idx, bar);
      totalW += w;
    }
    const level = totalW > 0 ? sum / totalW : REST_LEVEL;
    return Number(Math.max(REST_LEVEL, Math.min(1, level)).toFixed(3));
  });
}

export function AudioWave({ speaking, text, cursor = 0 }: { speaking: boolean; text?: string; cursor?: number }) {
  const levels = speaking ? (text ? spectrumForText(text, cursor) : FALLBACK_PEAKS) : null;

  return (
    <div className="audio-wave" data-speaking={speaking || undefined} aria-hidden="true">
      {FALLBACK_PEAKS.map((fallback, i) => {
        const level = levels ? levels[i]! : REST_LEVEL;
        const style = { "--level": level, "--peak": fallback } as CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}
