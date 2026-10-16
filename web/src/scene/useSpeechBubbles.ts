import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@mush2/shared";

export interface Bubble {
  id: number;
  text: string;
}

/** How long a bubble stays up. */
export const BUBBLE_MS = 5000;
/** Most bubbles stacked over one head; older ones drop off first. */
const MAX_BUBBLES = 3;

/**
 * Global chat messages that arrived since mount, grouped by sender, oldest first. Each expires after
 * BUBBLE_MS. History already in the view when the screen mounts never pops up.
 */
export function useSpeechBubbles(chat: readonly ChatMessage[]): ReadonlyMap<string, Bubble[]> {
  const [bubbles, setBubbles] = useState<ReadonlyMap<string, Bubble[]>>(new Map());
  const seen = useRef<number | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const last = chat.reduce((m, c) => Math.max(m, c.id), -1);
    if (seen.current === null) {
      seen.current = last;
      return;
    }
    const fresh = chat.filter((c) => c.channel === "global" && c.id > (seen.current ?? -1));
    seen.current = Math.max(seen.current, last);
    if (fresh.length === 0) return;
    setBubbles((prev) => {
      const next = new Map(prev);
      for (const m of fresh) next.set(m.from, [...(next.get(m.from) ?? []), { id: m.id, text: m.text }].slice(-MAX_BUBBLES));
      return next;
    });
    for (const m of fresh) {
      const t = setTimeout(() => {
        timers.current.delete(t);
        setBubbles((prev) => {
          const list = prev.get(m.from)?.filter((b) => b.id !== m.id);
          if (!list || list.length === prev.get(m.from)?.length) return prev;
          const next = new Map(prev);
          if (list.length) next.set(m.from, list);
          else next.delete(m.from);
          return next;
        });
      }, BUBBLE_MS);
      timers.current.add(t);
    }
  }, [chat]);

  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
    };
  }, []);

  return bubbles;
}
