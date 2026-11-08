import { useEffect, useRef, type ReactNode } from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";

/**
 * Scroll area that sticks to the bottom when new items arrive, and again when
 * it becomes visible (a hidden panel on the phone layout can't scroll). With
 * `top`, it goes to the top instead: an older chat page is read from its start
 * (owner, 2026-11-08, #355).
 */
export function Scroller({
  items,
  scrollKey,
  top = false,
  children,
}: {
  items: number;
  /** Back to the anchor when it changes too (another page of a thread). */
  scrollKey?: unknown;
  /** Anchor at the top rather than the bottom. */
  top?: boolean;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const atTop = useRef(top);
  atTop.current = top;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `items`, `scrollKey` and `top` only trigger the scroll.
  useEffect(() => {
    const el = viewport.current;
    if (el) el.scrollTop = top ? 0 : el.scrollHeight;
  }, [items, scrollKey, top]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let wasHidden = el.clientHeight === 0;
    const observer = new ResizeObserver(() => {
      if (wasHidden && el.clientHeight > 0) el.scrollTop = atTop.current ? 0 : el.scrollHeight;
      wasHidden = el.clientHeight === 0;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <ScrollArea.Root className="scroll-root">
      <ScrollArea.Viewport ref={viewport} className="scroll-viewport">
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scroll-bar" orientation="vertical">
        <ScrollArea.Thumb className="scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
