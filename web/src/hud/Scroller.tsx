import { useEffect, useRef, type ReactNode } from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";

/**
 * Scroll area that sticks to the bottom when new items arrive, and again when
 * it becomes visible (a hidden panel on the phone layout can't scroll).
 */
export function Scroller({ items, scrollKey, children }: { items: number; /** Back to the bottom when it changes too (another page of a thread). */ scrollKey?: unknown; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `items` and `scrollKey` only trigger the scroll.
  useEffect(() => {
    const el = viewport.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, scrollKey]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let wasHidden = el.clientHeight === 0;
    const observer = new ResizeObserver(() => {
      if (wasHidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
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
