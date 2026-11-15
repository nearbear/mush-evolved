// The Com center's link with Sol drawn as a live spectrum plot, in the style of sigplot's. The carrier's peak is the
// ship's chance of reaching Sol in dB (`solDb`): 0 dB means a sure link. Everything else (noise, drift, fading,
// sidebands) is decoration with client-side randomness; it carries no game information.

import { memo, useEffect, useRef } from "react";
import "./spectrogram.css";

/** Frequency bins across the plot. */
export const BINS = 200;
/** Spectrum updates per second. */
const FRAME_RATE = 16;
export const FLOOR_DB = -100;

/** The ship's chance (percent) as the carrier's peak: 100% is 0 dB, each point below is 1 dB lower. */
export const solDb = (chance: number) => Math.max(FLOOR_DB, Math.min(0, Math.round(chance - 100)));

/** A plain word for players who don't read dB. */
export function signalStrength(db: number): "faint" | "weak" | "fair" | "strong" {
  return db <= -75 ? "faint" : db <= -50 ? "weak" : db <= -25 ? "fair" : "strong";
}

const power = (db: number) => 10 ** (db / 10);

/** The modulated band's flat top and its filter roll-off, as fractions of the plot's width. */
const BAND_TOP = 0.2;
const BAND_EDGE = 0.04;
/** The sideband harmonics either side of the band: offset from the centre and flat top (fractions of the width), level (dB below the peak). */
const HARMONICS = [
  { offset: 0.27, top: 0.08, db: -18 },
  { offset: 0.41, top: 0.05, db: -30 },
];
/** The skirt (spectral regrowth) under the filter roll-off, dB below the peak at the band's edge. */
const SKIRT_DB = -26;

/**
 * A band's power (linear, 1 at the top) `off` bins outside its flat top: a raised-cosine filter roll-off to nothing
 * over `edge` bins, over a skirt that starts `SKIRT_DB` down and keeps falling, as filtered modulation does.
 */
function bandShape(off: number, edge: number): number {
  if (off <= 0) return 1;
  const rollOff = off >= edge ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * off) / edge);
  return rollOff + power(SKIRT_DB) / (1 + (off / edge) ** 4);
}

/**
 * One frame of the spectrum at time `t` (seconds), in dB: a noise floor around -97 dB plus a modulated band centred on
 * the plot peaking at `peakDb`, with weaker sideband harmonics either side. The signal ripples by up to 2 dB from bin
 * to bin like data on the carrier. Unlinked, it also fades by up to 3 dB; linked, it holds its level. The centre
 * never moves.
 */
export function signalRow(out: Float32Array, t: number, peakDb: number, linked: boolean, random: () => number = Math.random): void {
  const n = out.length;
  const centre = (n - 1) / 2;
  const edge = BAND_EDGE * n;
  const fade = linked ? 0 : 1.5 + 1.5 * Math.sin(2 * Math.PI * 0.23 * t);
  for (let k = 0; k < n; k++) {
    const noise = power(FLOOR_DB + 3 * random() + 3 * random() * random());
    const dk = k - centre;
    let shape = bandShape(Math.abs(dk) - (BAND_TOP * n) / 2, edge);
    for (const h of HARMONICS) {
      const level = power(h.db);
      for (const side of [-1, 1]) shape += level * bandShape(Math.abs(dk - side * h.offset * n) - (h.top * n) / 2, edge / 2);
    }
    const signal = Math.min(1, shape) * power(peakDb - fade - 2 * random());
    out[k] = Math.max(FLOOR_DB, Math.min(0, 10 * Math.log10(noise + signal)));
  }
}

const GRID_DB = [-25, -50, -75];
/** Plot colors, like sigplot's: a yellow trace on black with a dim grid. */
const PLOT = { background: "#000", grid: "#2e2e2e", trace: "#ffeb3b", fill: "rgba(255, 235, 59, 0.15)" };

interface Props {
  /** The carrier's peak, from `solDb`. */
  db: number;
  linked: boolean;
  /** The link's status, shown centred at the top of the plot. */
  status: string;
  /** Signal reading shown in parentheses beside the status. */
  signal?: string;
}

export const Spectrogram = memo(function Spectrogram({ db, linked, status, signal: signalText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads the latest props through a ref, so a new view doesn't restart it.
  const signal = useRef({ db, linked });
  useEffect(() => {
    signal.current = { db, linked };
  }, [db, linked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const row = new Float32Array(BINS);
    let t = 0;
    let width = 0;
    let height = 0;

    // Drawn at the canvas's real size in device pixels, so the line stays sharp at any width.
    const draw = () => {
      if (width === 0 || height === 0) return;
      const y = (value: number) => (value / FLOOR_DB) * (height - 1) + 0.5;
      const x = (k: number) => (k / (BINS - 1)) * width;
      ctx.fillStyle = PLOT.background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = PLOT.grid;
      for (const g of GRID_DB) ctx.fillRect(0, Math.round(y(g)), width, 1);
      for (let i = 1; i < 8; i++) ctx.fillRect(Math.round((i / 8) * width), 0, 1, height);
      ctx.beginPath();
      row.forEach((value, k) => {
        ctx.lineTo(x(k), y(value));
      });
      ctx.lineWidth = Math.max(1, Math.round(window.devicePixelRatio || 1));
      ctx.strokeStyle = PLOT.trace;
      ctx.stroke();
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fillStyle = PLOT.fill;
      ctx.fill();
    };
    const step = () => {
      signalRow(row, t, signal.current.db, signal.current.linked);
      t += 1 / FRAME_RATE;
    };
    const resize = () => {
      const scale = window.devicePixelRatio || 1;
      width = Math.round(canvas.clientWidth * scale);
      height = Math.round(canvas.clientHeight * scale);
      canvas.width = width;
      canvas.height = height;
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    step();
    resize();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => observer.disconnect();

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 1000 / FRAME_RATE) {
        last = now;
        step();
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="spectrogram">
      <div className="spectrogram-axis" aria-hidden="true">
        <span>0</span>
        <span>-25</span>
        <span>-50</span>
        <span>-75</span>
        <span>-100</span>
      </div>
      <div className="spectrogram-plot">
        <canvas ref={canvasRef} aria-hidden="true" />
        <strong className="spectrogram-status">{signalText ? `${status} ${signalText}` : status}</strong>
      </div>
    </div>
  );
});
