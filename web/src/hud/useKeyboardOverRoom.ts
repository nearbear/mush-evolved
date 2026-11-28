// Phones: the on-screen keyboard covers the bottom of the room view instead of squeezing it (owner, 2026-11-27).
//
// The viewport meta's interactive-widget=resizes-content shrinks the page (and 100dvh) when the keyboard opens, which
// the chat input wants: its feed and field get everything above the keyboard. In the room view that would shrink the
// notes and inventory panels and lift the peek bar over the keyboard, though you never need the peek bar while typing.
// So while a text field in the room view has focus, the game keeps the height it had before the keyboard opened
// (--game-height on main.game, responsive.css), and the keyboard draws over the peek bar and the bottom nav. The
// browser still scrolls the page to keep the caret in sight if it goes under the keyboard.

import { type RefObject, useEffect } from "react";

const typingInRoom = (): boolean => {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.closest(".room-view") !== null && (el.isContentEditable || el.matches("input, textarea"));
};

export function useKeyboardOverRoom(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const main = ref.current;
    if (!enabled || !main) return;
    // The window's height and width with no keyboard up: taken whenever nothing in the room view is being typed in.
    let full = { width: window.innerWidth, height: window.innerHeight };
    const sync = () => {
      if (typingInRoom()) {
        // Turned while typing: the old height is wrong and the new one isn't known, so let the page size itself.
        if (window.innerWidth !== full.width) main.style.removeProperty("--game-height");
        else main.style.setProperty("--game-height", `${full.height}px`);
      } else {
        full = { width: window.innerWidth, height: window.innerHeight };
        main.style.removeProperty("--game-height");
      }
    };
    // focusout fires before focus lands on the next field, so check once it has.
    const later = () => requestAnimationFrame(sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", later);
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", later);
      window.removeEventListener("resize", sync);
      main.style.removeProperty("--game-height");
    };
  }, [ref, enabled]);
}
