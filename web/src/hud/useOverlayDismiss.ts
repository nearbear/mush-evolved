import { type RefObject, useEffect } from "react";

/**
 * Makes a room view overlay a non-modal dialog. Opening moves focus into its `[role="dialog"]` panel (give it
 * tabIndex -1); Escape closes it and returns focus to the `[aria-expanded]` toggle in the same root; a press elsewhere
 * in the room view closes it too. Presses outside the room view (the Inspect panel, iTrackie) leave it open so they
 * stay usable beside it, which is why the background is not made inert. A press on something matching `keepOpen` (a
 * selector) leaves it open too.
 */
export function useOverlayDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>, keepOpen?: string) {
  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      rootRef.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus({ preventScroll: true });
    };
    const onPress = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (keepOpen && target?.closest(keepOpen)) return;
      if (target?.closest(".room-view") && !rootRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open, close, rootRef, keepOpen]);
}
