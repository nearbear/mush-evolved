// Sealed chat pages the client fetched (#355, docs/plans/archive/chat-pages.md): kept for the game, since a sealed page never
// changes except for its ticks, which `chatEdit` brings. The view carries only the open page and the tail; Thread asks
// for anything older through `request`. GameScreen owns the cache (it owns the socket); a view with no socket gets
// none, so it can show only the pages its view carries.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { chatPageOf, markedText, type ChannelId, type ChatLine, type GameClientMessage, type GameServerMessage } from "@mush2/shared";

export interface ChatPages {
  /** A fetched page, or undefined while it hasn't arrived. */
  get: (channel: ChannelId, page: number) => readonly ChatLine[] | undefined;
  /** Ask the server for a page, once: a page already held or on its way is not asked for again. */
  request: (channel: ChannelId, page: number) => void;
}

const ChatPagesContext = createContext<ChatPages | null>(null);

/** The page cache, or null in a view with no socket (only the view's own pages can be shown). */
export const useChatPages = (): ChatPages | null => useContext(ChatPagesContext);

const key = (channel: ChannelId, page: number) => `${channel}:${page}`;

/**
 * The cache and the handler for the server messages that fill it. `handle` returns false for a message it doesn't
 * take, so GameScreen can pass it on.
 */
export function useChatPageCache(send: (msg: GameClientMessage) => void) {
  const [pages, setPages] = useState<ReadonlyMap<string, readonly ChatLine[]>>(new Map());
  // Pages asked for and not yet answered; a ref, so two renders asking at once send one request.
  const pending = useRef(new Set<string>());
  const held = useRef(pages);
  held.current = pages;

  const request = useCallback(
    (channel: ChannelId, page: number) => {
      const k = key(channel, page);
      if (held.current.has(k) || pending.current.has(k)) return;
      pending.current.add(k);
      send({ type: "chatPage", channel, page });
    },
    [send],
  );

  const handle = useCallback((msg: GameServerMessage): boolean => {
    if (msg.type === "chatPage") {
      pending.current.delete(key(msg.channel, msg.page));
      setPages((old) => new Map(old).set(key(msg.channel, msg.page), msg.messages));
      return true;
    }
    if (msg.type === "chatEdit") {
      // Only a page already fetched is redrawn; one not fetched comes with its ticks when it is.
      setPages((old) => {
        const k = key(msg.channel, chatPageOf(msg.seq));
        const page = old.get(k);
        if (!page?.some((m) => m.seq === msg.seq)) return old;
        return new Map(old).set(k, page.map((m) => (m.seq === msg.seq ? { ...m, text: markedText(m.text, msg.mark) } : m)));
      });
      return true;
    }
    // Every refusal of a page is this one error, with nothing to say which page: let any page be asked for again.
    if (msg.type === "error" && msg.message === "chat_page_unavailable") pending.current.clear();
    return false;
  }, []);

  const value = useMemo<ChatPages>(() => ({ get: (channel, page) => pages.get(key(channel, page)), request }), [pages, request]);
  return { value, handle };
}

/** The pages around `current` worth a button: the first, the last, and the current one with its neighbours. */
export function pageItems(first: number, last: number, current: number): (number | "gap")[] {
  const wanted = [...new Set([first, current - 1, current, current + 1, last])].filter((p) => p >= first && p <= last).sort((a, b) => a - b);
  return wanted.flatMap((p, i) => (i > 0 && p - (wanted[i - 1] ?? p) > 1 ? ["gap" as const, p] : [p]));
}

export function ChatPagesProvider({ value, children }: { value: ChatPages; children: ReactNode }) {
  return <ChatPagesContext.Provider value={value}>{children}</ChatPagesContext.Provider>;
}
