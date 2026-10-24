// A drag handle between two of the editor's panes: drag it, or focus it and use the arrow keys. The size
// it sets is remembered in this browser (useStoredSize), as a game engine keeps its window layout.

import { type PointerEvent, useRef, useState } from "react";

/** A pane size in pixels, remembered under `key` in this browser (if it can store anything). */
export function useStoredSize(key: string, initial: number): [number, (n: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const n = Number(localStorage.getItem(`editor.${key}`));
      return n > 0 ? n : initial;
    } catch {
      return initial;
    }
  });
  const set = (n: number) => {
    setSize(n);
    try {
      localStorage.setItem(`editor.${key}`, String(n));
    } catch {
      // Not stored: the size just resets next time.
    }
  };
  return [size, set];
}

/** The arrow keys' step, in pixels. */
const STEP = 16;

export function Splitter({
  axis,
  size,
  onSize,
  min,
  max,
  invert = false,
  label,
}: {
  /** "x" sits between side-by-side panes and drags left and right; "y" sits between stacked ones. */
  axis: "x" | "y";
  size: number;
  onSize: (n: number) => void;
  min: number;
  max: number;
  /** The pane it sizes is after the handle (right of it, or below), so dragging towards it shrinks it. */
  invert?: boolean;
  label: string;
}) {
  const drag = useRef<{ at: number; from: number } | null>(null);
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)));
  const pos = (e: PointerEvent) => (axis === "x" ? e.clientX : e.clientY);
  const sign = invert ? -1 : 1;
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      className={`editor-splitter ${axis}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { at: pos(e), from: size };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) onSize(clamp(d.from + sign * (pos(e) - d.at)));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
        const on = axis === "x" ? "ArrowRight" : "ArrowDown";
        if (e.key !== back && e.key !== on) return;
        e.preventDefault();
        onSize(clamp(size + sign * (e.key === on ? STEP : -STEP)));
      }}
    />
  );
}
