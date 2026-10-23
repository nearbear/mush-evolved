import { type RefObject, useEffect } from "react";

/**
 * Closes a room view overlay on Escape or a press elsewhere in the room view. Presses outside the room view
 * (the Inspect panel, iTrackie) leave it open so they stay usable beside it.
 */
export function useOverlayDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPress = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".room-view") && !rootRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open, close, rootRef]);
}
