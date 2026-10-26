// Keeps keyboard focus inside a panel when the button that had it disappears. Acting changes the view, so the
// button you pressed is often replaced; the browser would drop focus to the page, and a screen reader would
// lose its place. After a render, if focus was inside the panel last time and is now nowhere, it moves to the
// panel itself (give it tabIndex -1). A pointer press elsewhere forgets it, so clicking away is never undone.

import { type RefObject, useEffect, useRef } from "react";

export function useKeepFocus(ref: RefObject<HTMLElement | null>) {
  const had = useRef(false);
  useEffect(() => {
    const forget = (e: PointerEvent) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) had.current = false;
    };
    document.addEventListener("pointerdown", forget);
    return () => document.removeEventListener("pointerdown", forget);
  }, [ref]);
  // No deps: the view changes under the panel without any prop of ours changing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement;
    if (had.current && (!active || active === document.body) && !el.contains(active)) el.focus({ preventScroll: true });
    had.current = el.contains(document.activeElement);
  });
}
