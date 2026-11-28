// Keyboard moves in a chat feed (#400): the feed is one tab stop, and arrow keys move between its messages.

/** The row a feed key moves focus to (`from` is -1 on the feed itself), or null for a key the feed doesn't handle. */
export function rowAfterKey(key: string, from: number, count: number): number | null {
  if (count === 0) return null;
  const to =
    key === "ArrowDown" ? (from < 0 ? 0 : from + 1) : key === "ArrowUp" ? (from < 0 ? count - 1 : from - 1) : key === "Home" ? 0 : key === "End" ? count - 1 : null;
  return to === null ? null : Math.max(0, Math.min(count - 1, to));
}

